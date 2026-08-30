import type { Session } from 'electron'
import {
  hasUserScriptHostPermission,
  markUserScriptHostUsed,
} from '../db/repositories/userScriptRuntimeRepository'
import { appLogger, type Logger } from '../shared/logger'
import {
  isUserScriptConnectDeclared,
  resolveUserScriptRequestTarget,
  type UserScriptRequestTarget,
} from './userScriptConnectPolicy'
import {
  USER_SCRIPT_RUNTIME_MAX_RESPONSE_BYTES,
  type UserScriptRuntimeEvent,
  type UserScriptXhrRequestDetails,
  type UserScriptXhrResponseSnapshot,
} from './userScriptRuntimeProtocol'
import { errorName } from '../shared/errors'

const MAX_REDIRECTS = 10
const MAX_ACTIVE_REQUESTS = 64
const MAX_ACTIVE_REQUESTS_PER_PORT = 8
const BLOCKED_REQUEST_HEADERS = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'origin',
  'proxy-authorization',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'referer',
])

export interface UserScriptNetworkContext {
  scriptId: string
  scriptName: string
  frameUrl: string
  connects: readonly string[]
  webContentsId: number
}

interface UserScriptNetworkProxyDependencies {
  fetch: Session['fetch']
  hasPermission: typeof hasUserScriptHostPermission
  markPermissionUsed: typeof markUserScriptHostUsed
  requestPermission: (
    context: UserScriptNetworkContext,
    target: UserScriptRequestTarget,
  ) => Promise<boolean>
  allowInsecureLocalhost: boolean
  logger: Logger
}

export class UserScriptNetworkProxy {
  private readonly dependencies: UserScriptNetworkProxyDependencies
  private readonly activeRequests = new Map<string, AbortController>()

  public constructor(dependencies: Partial<UserScriptNetworkProxyDependencies> & {
    fetch: Session['fetch']
    requestPermission: UserScriptNetworkProxyDependencies['requestPermission']
  }) {
    this.dependencies = {
      hasPermission: hasUserScriptHostPermission,
      markPermissionUsed: markUserScriptHostUsed,
      allowInsecureLocalhost: false,
      logger: appLogger,
      ...dependencies,
    }
  }

  public start(
    operationId: string,
    context: UserScriptNetworkContext,
    requestId: string,
    details: UserScriptXhrRequestDetails,
    send: (event: UserScriptRuntimeEvent) => void,
  ): void {
    const portPrefix = operationId.slice(0, operationId.indexOf('\u0000') + 1)
    const activeForPort = Array.from(this.activeRequests.keys()).filter(id => id.startsWith(portPrefix)).length
    if (
      this.activeRequests.has(operationId)
      || this.activeRequests.size >= MAX_ACTIVE_REQUESTS
      || activeForPort >= MAX_ACTIVE_REQUESTS_PER_PORT
    ) {
      send({ type: 'xhr:failed', requestId, reason: 'error' })
      return
    }
    const controller = new AbortController()
    this.activeRequests.set(operationId, controller)
    void this.execute(context, details, controller.signal, requestId, send)
      .catch((error) => {
        if (error instanceof UserScriptRequestDeniedError) {
          send({ type: 'xhr:failed', requestId, reason: 'denied' })
          return
        }
        if (error instanceof UserScriptRequestTimeoutError) {
          send({ type: 'xhr:failed', requestId, reason: 'timeout' })
          return
        }
        if (controller.signal.aborted) {
          send({ type: 'xhr:failed', requestId, reason: 'abort' })
          return
        }
        this.dependencies.logger.warn('userscript.network-request-failed', {
          scriptId: context.scriptId,
          error: errorName(error),
        })
        send({ type: 'xhr:failed', requestId, reason: 'error' })
      })
      .finally(() => {
        if (this.activeRequests.get(operationId) === controller) this.activeRequests.delete(operationId)
      })
  }

  public abort(operationId: string): boolean {
    const controller = this.activeRequests.get(operationId)
    if (!controller) return false
    controller.abort()
    return true
  }

  public abortPrefix(prefix: string): void {
    for (const [operationId, controller] of this.activeRequests) {
      if (operationId.startsWith(prefix)) controller.abort()
    }
  }

  private async execute(
    context: UserScriptNetworkContext,
    details: UserScriptXhrRequestDetails,
    signal: AbortSignal,
    requestId: string,
    send: (event: UserScriptRuntimeEvent) => void,
  ): Promise<void> {
    let timedOut = false
    const timer = details.timeout > 0
      ? setTimeout(() => {
          timedOut = true
          const operation = Array.from(this.activeRequests.values()).find(candidate => candidate.signal === signal)
          operation?.abort()
        }, details.timeout)
      : null

    try {
      let url = details.url
      let method = details.method
      let body = details.data
      let headers = sanitizeRequestHeaders(details.headers)
      let previousOrigin: string | null = null

      for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        if (signal.aborted) throw timedOut ? new UserScriptRequestTimeoutError() : new DOMException('Aborted', 'AbortError')
        const target = resolveUserScriptRequestTarget(url, this.dependencies.allowInsecureLocalhost)
        if (!target || !isUserScriptConnectDeclared(context.connects, context.frameUrl, target)) {
          throw new UserScriptRequestDeniedError()
        }
        const authorized = this.dependencies.hasPermission(context.scriptId, target.permissionHost)
          || await waitForAbort(this.dependencies.requestPermission(context, target), signal)
        if (!authorized || signal.aborted) throw new UserScriptRequestDeniedError()
        this.dependencies.markPermissionUsed(context.scriptId, target.permissionHost)

        if (previousOrigin !== null && previousOrigin !== target.origin) {
          headers = stripCrossOriginSecrets(headers)
        }
        previousOrigin = target.origin

        const response = await this.dependencies.fetch(target.url, {
          method,
          headers,
          body: method === 'GET' || method === 'HEAD' ? undefined : body ?? undefined,
          credentials: details.anonymous ? 'omit' : 'include',
          redirect: 'manual',
          signal,
        })
        const redirectUrl = getRedirectUrl(response, target.url)
        if (redirectUrl) {
          if (redirectCount === MAX_REDIRECTS) throw new Error('Too many redirects')
          const next = redirectMethod(response.status, method)
          method = next.method
          if (!next.keepBody) body = null
          url = redirectUrl
          continue
        }

        const responseSnapshot = await readResponse(response, target.url, details.responseType, signal, (loaded, total) => {
          send({ type: 'xhr:progress', requestId, loaded, total })
        })
        send({ type: 'xhr:complete', requestId, response: responseSnapshot })
        return
      }
    }
    catch (error) {
      if (timedOut) throw new UserScriptRequestTimeoutError()
      throw error
    }
    finally {
      if (timer) clearTimeout(timer)
    }
  }
}

class UserScriptRequestDeniedError extends Error {}
class UserScriptRequestTimeoutError extends Error {}

function sanitizeRequestHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => {
    const lower = name.toLowerCase()
    return !BLOCKED_REQUEST_HEADERS.has(lower) && !lower.startsWith('proxy-') && !lower.startsWith('sec-')
  }))
}

function stripCrossOriginSecrets(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => {
    const lower = name.toLowerCase()
    return lower !== 'authorization' && lower !== 'proxy-authorization'
  }))
}

function getRedirectUrl(response: Response, currentUrl: string): string | null {
  if (response.status < 300 || response.status >= 400) return null
  const location = response.headers.get('location')
  if (!location) return null
  try { return new URL(location, currentUrl).toString() }
  catch { throw new UserScriptRequestDeniedError() }
}

function redirectMethod(status: number, method: string): { method: string; keepBody: boolean } {
  if (status === 303 || ((status === 301 || status === 302) && method === 'POST')) {
    return { method: 'GET', keepBody: false }
  }
  return { method, keepBody: true }
}

async function readResponse(
  response: Response,
  finalUrl: string,
  responseType: UserScriptXhrRequestDetails['responseType'],
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<UserScriptXhrResponseSnapshot> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  const total = Number.isSafeInteger(declaredLength) && declaredLength > 0 ? declaredLength : 0
  if (total > USER_SCRIPT_RUNTIME_MAX_RESPONSE_BYTES) throw new Error('Response body is too large')
  const chunks: Uint8Array[] = []
  let loaded = 0
  if (response.body) {
    const reader = response.body.getReader()
    while (true) {
      if (signal.aborted) {
        await reader.cancel()
        throw new DOMException('Aborted', 'AbortError')
      }
      const { done, value } = await reader.read()
      if (done) break
      loaded += value.byteLength
      if (loaded > USER_SCRIPT_RUNTIME_MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new Error('Response body is too large')
      }
      chunks.push(value)
      onProgress(loaded, total)
    }
  }
  const body = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return {
    finalUrl,
    status: response.status,
    statusText: response.statusText,
    responseHeaders: serializeResponseHeaders(response.headers),
    responseType,
    body: body.buffer,
  }
}

function serializeResponseHeaders(headers: Headers): string {
  const lines: string[] = []
  let bytes = 0
  headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie') return
    const line = `${name}: ${value}`
    bytes += new TextEncoder().encode(line).byteLength
    if (bytes <= 64 * 1024) lines.push(line)
  })
  return lines.join('\r\n')
}

function waitForAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const handleAbort = (): void => {
      signal.removeEventListener('abort', handleAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', handleAbort, { once: true })
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', handleAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', handleAbort)
        reject(error)
      },
    )
  })
}
