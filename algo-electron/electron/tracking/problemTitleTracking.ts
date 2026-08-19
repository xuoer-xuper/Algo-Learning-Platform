import type { BrowserPageEvent, TabManager } from '../browser/TabManager'
import { BrowserDiagnostics } from '../diagnostics/BrowserDiagnostics'
import { upsertProblem } from '../db/repositories/problemRepository'
import { resolveBrowserTitleProblemIdentity } from '../parsers/browserTitle'
import { createProblemTitleFallbackScript } from '../parsers/problemTitleFallback'
import { parseUrl } from '../parsers/registry'
import type { TrackingService } from './TrackingService'

interface InstallProblemTitleTrackingOptions {
  tabManager: TabManager
  getTrackingService: () => TrackingService | null
  notifyProblemsUpdated: () => void
  diagnostics?: BrowserDiagnostics
}

function isCodeforcesUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'codeforces.com' || parsed.hostname === 'www.codeforces.com'
  } catch {
    return false
  }
}

export function installProblemTitleTracking(options: InstallProblemTitleTrackingOptions): BrowserDiagnostics {
  const { tabManager } = options
  const diagnostics = options.diagnostics ?? new BrowserDiagnostics()
  const extractionTimers = new Map<string, NodeJS.Timeout[]>()
  const successfulExtractions = new Set<string>()

  const pageKey = (event: BrowserPageEvent): string => (
    `${event.windowId}:${event.tabId}:${event.webContentsId}:${event.url}`
  )

  const updateProblemTitle = (
    url: string,
    title: string | null | undefined,
    source: 'browser-title' | 'dom-fallback',
  ): boolean => {
    try {
      if (source === 'browser-title' && isCodeforcesUrl(url)) return false
      const identity = resolveBrowserTitleProblemIdentity(url, title, parseUrl)
      if (!identity) {
        diagnostics.record('title', 'extract', 'skipped', { url, detail: `${source}: no valid title` })
        return false
      }
      upsertProblem(identity)
      options.notifyProblemsUpdated()
      diagnostics.record('title', 'extract', 'success', { url, detail: source })
      return true
    } catch (error) {
      diagnostics.record('title', 'extract', 'failed', { url, detail: error })
      return false
    }
  }

  const scheduleTitleExtraction = (event: BrowserPageEvent) => {
    const { url } = event
    if (!url || url === 'about:blank') return
    const key = pageKey(event)
    if (successfulExtractions.has(key)) return

    if (extractionTimers.has(key)) {
      extractionTimers.get(key)?.forEach(clearTimeout)
    }
    const timers: NodeJS.Timeout[] = []

    const extract = () => {
      const title = tabManager.getTitleForPage(event)
      if (updateProblemTitle(url, title, 'browser-title')) {
        successfulExtractions.add(key)
        timers.forEach(clearTimeout)
        extractionTimers.delete(key)
        return
      }

      const script = createProblemTitleFallbackScript(url)
      if (!script) return
      tabManager.executeScriptForPage(event, script)
        .then((fallbackTitle) => {
          if (updateProblemTitle(url, typeof fallbackTitle === 'string' ? fallbackTitle : null, 'dom-fallback')) {
            successfulExtractions.add(key)
            timers.forEach(clearTimeout)
            extractionTimers.delete(key)
          }
        })
        .catch((error) => {
          diagnostics.record('title', 'fallback', 'failed', { url, detail: error })
        })
    }

    timers.push(setTimeout(extract, 2000))
    timers.push(setTimeout(extract, 5000))
    if (url.includes('pintia.cn') || url.includes('vjudge.net/contest')) {
      timers.push(setTimeout(extract, 8000))
    }
    extractionTimers.set(key, timers)
  }

  tabManager.addPageEventListener((event) => {
    const { url } = event
    if (event.reason === 'destroyed') {
      options.getTrackingService()?.endVisitForPage(event)
      for (const [key, timers] of extractionTimers) {
        if (!key.startsWith(`${event.windowId}:${event.tabId}:${event.webContentsId}:`)) continue
        timers.forEach(clearTimeout)
        extractionTimers.delete(key)
      }
      for (const key of successfulExtractions) {
        if (key.startsWith(`${event.windowId}:${event.tabId}:${event.webContentsId}:`)) {
          successfulExtractions.delete(key)
        }
      }
      return
    }

    if (
      event.reason === 'did-navigate'
      || event.reason === 'did-navigate-in-page'
      || event.reason === 'active-tab-changed'
    ) {
      if (!event.isMainFrame) return
      if (tabManager.isPageActive(event)) {
        let identity
        try {
          identity = options.getTrackingService()?.handleNavigation(event)
        } catch (error) {
          diagnostics.record('tracking', 'navigate', 'failed', { url, detail: error })
          return
        }
        if (identity) {
          diagnostics.record('tracking', 'navigate', 'success', { url })
          options.notifyProblemsUpdated()
          scheduleTitleExtraction(event)
        } else {
          diagnostics.record('tracking', 'navigate', 'skipped', { url, detail: 'No enabled problem identity' })
        }
      }
      if (event.reason !== 'active-tab-changed') return
    }

    if (event.reason === 'page-title-updated') {
      const title = event.title ?? ''
      if (title.includes('Illegal contest ID') && url.includes('codeforces.com')) {
        const match = url.match(/codeforces\.com\/(?:gym|problemset\/problem|contest)\/(\d+)/)
        if (match) {
          void tabManager.navigatePage(event, `https://codeforces.com/gym/${match[1]}/attachments`)
          return
        }
      }
      if (updateProblemTitle(url, title, 'browser-title')) {
        successfulExtractions.add(pageKey(event))
        return
      }
      scheduleTitleExtraction(event)
      return
    }

    if (event.reason === 'active-tab-changed') {
      const title = tabManager.getTitleForPage(event)
      if (updateProblemTitle(url, title, 'browser-title')) {
        successfulExtractions.add(pageKey(event))
        return
      }
      scheduleTitleExtraction(event)
    }
  })

  tabManager.addActiveTabChangeListener((url) => {
    if (tabManager.getActivePageEvent()) return
    try {
      options.getTrackingService()?.handleWindowNavigation(tabManager.getWindowId(), url)
    } catch (error) {
      diagnostics.record('tracking', 'active-tab', 'failed', { url, detail: error })
    }
  })

  return diagnostics
}
