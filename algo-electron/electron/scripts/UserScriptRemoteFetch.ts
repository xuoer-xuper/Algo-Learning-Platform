import { resolveUserScriptRequestTarget } from './userScriptConnectPolicy'

const MAX_REDIRECTS = 5
const FETCH_TIMEOUT_MS = 30_000
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024

export type UserScriptRemoteFetch = (input: string, init?: RequestInit) => Promise<Response>

export interface FetchUserScriptDocumentOptions {
  fetch: UserScriptRemoteFetch
  allowInsecureLocalhost?: boolean
  maxBytes?: number
  etag?: string | null
  lastModified?: string | null
  signal?: AbortSignal
}

export type UserScriptDocumentResponse = {
  status: 'not-modified'
  finalUrl: string
  etag: string | null
  lastModified: string | null
} | {
  status: 'ok'
  code: string
  finalUrl: string
  etag: string | null
  lastModified: string | null
}

export async function fetchUserScriptDocument(
  url: string,
  options: FetchUserScriptDocumentOptions,
): Promise<UserScriptDocumentResponse> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('maxBytes must be positive')
  let currentUrl = requireSafeUrl(url, Boolean(options.allowInsecureLocalhost))
  let conditionalEtag = options.etag ?? null
  let conditionalLastModified = options.lastModified ?? null
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) abortFromCaller()
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const headers = conditionalHeaders(conditionalEtag, conditionalLastModified)
      const response = await options.fetch(currentUrl, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'manual',
        headers,
        signal: controller.signal,
      })
      if (response.status >= 300 && response.status < 400 && response.status !== 304) {
        const location = response.headers.get('location')
        if (!location || redirect === MAX_REDIRECTS) throw new Error('Userscript source redirected too many times')
        const nextUrl = requireSafeUrl(
          new URL(location, currentUrl).toString(),
          Boolean(options.allowInsecureLocalhost),
        )
        if (new URL(nextUrl).origin !== new URL(currentUrl).origin) {
          conditionalEtag = null
          conditionalLastModified = null
        }
        currentUrl = nextUrl
        continue
      }
      const responseEtag = response.headers.get('etag')
      const responseLastModified = response.headers.get('last-modified')
      if (response.status === 304) {
        return {
          status: 'not-modified',
          finalUrl: currentUrl,
          etag: responseEtag ?? conditionalEtag,
          lastModified: responseLastModified ?? conditionalLastModified,
        }
      }
      if (!response.ok) throw new Error(`Userscript source request failed with HTTP ${response.status}`)
      const bytes = await readBoundedResponse(response, maxBytes)
      let code: string
      try { code = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
      catch { throw new Error('Userscript source is not valid UTF-8') }
      return {
        status: 'ok',
        code,
        finalUrl: currentUrl,
        etag: responseEtag,
        lastModified: responseLastModified,
      }
    }
    throw new Error('Userscript source request failed')
  }
  catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error('Userscript source download timed out or was cancelled'), { cause: error })
    }
    throw error
  }
  finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}

function requireSafeUrl(value: string, allowInsecureLocalhost: boolean): string {
  const target = resolveUserScriptRequestTarget(value, allowInsecureLocalhost)
  if (!target) throw new Error('Userscript source URL must be HTTPS')
  return target.url
}

function conditionalHeaders(etag: string | null, lastModified: string | null): Headers | undefined {
  const headers = new Headers()
  if (etag) headers.set('If-None-Match', etag)
  if (lastModified) headers.set('If-Modified-Since', lastModified)
  return [...headers].length > 0 ? headers : undefined
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error('Userscript source exceeds the maximum size')
  }
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error('Userscript source exceeds the maximum size')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
