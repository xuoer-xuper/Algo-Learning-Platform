import { app, session, webContents, type Session } from 'electron'
import { getRealtimeAdapterForUrl } from '../adapters/registry'
import { STEALTH_SCRIPT } from './stealthScript'
import { installBrowserPermissionPolicy } from './permissionPolicy'

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
  installBrowserPermissionPolicy(session.defaultSession)
  installBrowserPermissionPolicy(ojSession)

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

    const contentType = Object.entries(details.responseHeaders ?? {})
      .find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.[0]
    if (details.resourceType === 'mainFrame' && contentType?.toLowerCase().includes('text/html')) {
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
