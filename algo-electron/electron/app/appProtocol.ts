import fs from 'node:fs'
import path from 'node:path'
import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'

export const SHELL_SCHEME = 'app'
export const SHELL_HOST = 'shell'
export const SHELL_ORIGIN = `${SHELL_SCHEME}://${SHELL_HOST}`

export const SHELL_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: note-asset:",
  "font-src 'self' data:",
  "connect-src 'self' https: http://localhost:* ws://localhost:*",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ')

let schemeRegistered = false
let protocolRegistered = false

export function registerShellSchemeAsPrivileged(): void {
  if (schemeRegistered) return
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SHELL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
  schemeRegistered = true
}

function responseWithCsp(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Content-Security-Policy', SHELL_CSP)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function resolveShellAsset(rendererDist: string, requestUrl: string): string | null {
  const root = path.resolve(rendererDist)
  const url = new URL(requestUrl)
  if (url.protocol !== `${SHELL_SCHEME}:` || url.hostname !== SHELL_HOST) return null

  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
  const candidate = path.resolve(root, relativePath)
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null
  return candidate
}

export function registerShellProtocol(rendererDist: string): void {
  if (protocolRegistered) return
  const root = path.resolve(rendererDist)
  protocol.handle(SHELL_SCHEME, async (request) => {
    try {
      const assetPath = resolveShellAsset(root, request.url)
      if (!assetPath || !fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
        return new Response('Not Found', { status: 404, headers: { 'Content-Security-Policy': SHELL_CSP } })
      }
      return responseWithCsp(await net.fetch(pathToFileURL(assetPath).toString()))
    } catch {
      return new Response('Not Found', { status: 404, headers: { 'Content-Security-Policy': SHELL_CSP } })
    }
  })
  protocolRegistered = true
}

export function shellUrl(pathname = '/index.html'): string {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${SHELL_ORIGIN}${normalized}`
}

export function resetShellProtocolForTests(): void {
  schemeRegistered = false
  protocolRegistered = false
}
