import { app, session, webContents, type Session } from 'electron'
import { getRealtimeAdapterForUrl } from '../adapters/registry'
import { STEALTH_SCRIPT } from './stealthScript'

interface SiteEnableState {
  enabled: boolean
}

interface ConfigureOjSessionOptions {
  getSiteById: (siteId: string) => SiteEnableState | null | undefined
}

export function configureOjSession(options: ConfigureOjSessionOptions): Session {
  const chromeVersion = process.versions.chrome
  const realUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
  app.userAgentFallback = realUA
  session.defaultSession.setUserAgent(realUA)
  const ojSession = session.fromPartition('persist:oj-main')
  ojSession.setUserAgent(realUA)

  const corsHeadersToAdd = {
    'access-control-allow-origin': ['*'],
    'access-control-allow-methods': ['GET, POST, PUT, DELETE, OPTIONS, PATCH'],
    'access-control-allow-headers': ['*'],
    'access-control-expose-headers': ['*'],
    'access-control-max-age': ['86400'],
  }

  ojSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType === 'mainFrame') {
      const ct = details.responseHeaders?.['content-type']?.[0] || details.responseHeaders?.['Content-Type']?.[0]
      if (ct && ct.includes('text/html')) {
        (details as unknown as Record<string, unknown>)._needsStealth = true
      }
      callback({})
      return
    }

    if (details.resourceType !== 'xhr' && details.method !== 'OPTIONS') {
      callback({})
      return
    }

    const hasCredentials = Object.entries(details.responseHeaders || {}).some(
      ([key, value]) => key.toLowerCase() === 'access-control-allow-credentials' && value[0] === 'true'
    )
    if (hasCredentials) {
      callback({})
      return
    }

    const headers: Record<string, string[]> = {}
    const corsKeys = ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-expose-headers', 'access-control-max-age']
    for (const [key, value] of Object.entries(details.responseHeaders || {})) {
      if (!corsKeys.includes(key.toLowerCase())) {
        headers[key] = value as string[]
      }
    }
    Object.assign(headers, corsHeadersToAdd)

    if (details.method === 'OPTIONS') {
      callback({ responseHeaders: headers, statusLine: 'HTTP/1.1 204 No Content' })
      return
    }

    callback({ responseHeaders: headers })
  })

  ojSession.webRequest.onResponseStarted((details) => {
    const wc = details.webContentsId ? webContents.fromId(details.webContentsId) : undefined
    if (details.resourceType === 'mainFrame') {
      const adapter = getRealtimeAdapterForUrl(details.url)
      const site = adapter ? options.getSiteById(adapter.id) : null
      const hookScript = adapter && (!site || site.enabled) ? adapter.injectHookScript?.() : undefined
      if (hookScript) {
        // Some OJ editors cache fetch/XMLHttpRequest during module startup.
        const earlyRealtimeScript = `try { window.__ALGO_TOP_PAGE_URL = ${JSON.stringify(details.url)}; } catch (_) {}\n${hookScript}`
        wc?.executeJavaScript(earlyRealtimeScript, true).catch(() => {})
      }
    }

    if ((details as unknown as Record<string, unknown>)._needsStealth) {
      const earlyScript = `
        if (typeof navigator !== 'undefined') {
          ${STEALTH_SCRIPT}
        } else {
          (function wait() {
            if (typeof navigator !== 'undefined') { ${STEALTH_SCRIPT} }
            else { requestAnimationFrame(wait) }
          })()
        }
      `
      wc?.executeJavaScript(earlyScript, true).catch(() => {})
    }
  })

  return ojSession
}
