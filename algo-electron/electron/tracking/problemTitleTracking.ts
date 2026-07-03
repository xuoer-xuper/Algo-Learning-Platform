import type { TabManager } from '../browser/TabManager'
import { upsertProblem } from '../db/repositories/problemRepository'
import { resolveBrowserTitleProblemIdentity } from '../parsers/browserTitle'
import { createProblemTitleFallbackScript } from '../parsers/problemTitleFallback'
import { parseUrl } from '../parsers/registry'
import type { ProblemIdentity } from '../shared/types'
import type { TrackingService } from './TrackingService'

interface InstallProblemTitleTrackingOptions {
  tabManager: TabManager
  getTrackingService: () => TrackingService | null
  notifyProblemDetected: (identity: ProblemIdentity) => void
  notifyProblemsUpdated: () => void
}

function isCodeforcesUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'codeforces.com' || parsed.hostname === 'www.codeforces.com'
  } catch {
    return false
  }
}

export function installProblemTitleTracking(options: InstallProblemTitleTrackingOptions): void {
  const { tabManager } = options
  const extractionTimers = new Map<string, NodeJS.Timeout[]>()
  const successfulExtractions = new Set<string>()

  const updateProblemTitle = (
    url: string,
    title: string | null | undefined,
    source: 'browser-title' | 'dom-fallback',
  ): boolean => {
    if (source === 'browser-title' && isCodeforcesUrl(url)) return false
    const identity = resolveBrowserTitleProblemIdentity(url, title, parseUrl)
    if (!identity) return false
    successfulExtractions.add(url)
    upsertProblem(identity)
    options.notifyProblemsUpdated()
    return true
  }

  const scheduleTitleExtraction = (url: string) => {
    if (!url || url === 'about:blank') return
    if (successfulExtractions.has(url)) return

    if (extractionTimers.has(url)) {
      extractionTimers.get(url)?.forEach(clearTimeout)
    }
    const timers: NodeJS.Timeout[] = []

    const extract = () => {
      const title = tabManager.getTitleForUrl(url)
      if (updateProblemTitle(url, title, 'browser-title')) {
        timers.forEach(clearTimeout)
        extractionTimers.delete(url)
        return
      }

      const script = createProblemTitleFallbackScript(url)
      if (!script) return
      tabManager.executeScriptOnUrl(url, script)
        .then((fallbackTitle) => {
          if (updateProblemTitle(url, typeof fallbackTitle === 'string' ? fallbackTitle : null, 'dom-fallback')) {
            timers.forEach(clearTimeout)
            extractionTimers.delete(url)
          }
        })
        .catch(() => {})
    }

    timers.push(setTimeout(extract, 2000))
    timers.push(setTimeout(extract, 5000))
    if (url.includes('pintia.cn') || url.includes('vjudge.net/contest')) {
      timers.push(setTimeout(extract, 8000))
    }
    extractionTimers.set(url, timers)
  }

  tabManager.setNavigateCallback((url) => {
    const identity = options.getTrackingService()?.handleNavigation(url)
    if (identity) {
      options.notifyProblemDetected(identity)
      options.notifyProblemsUpdated()
      scheduleTitleExtraction(url)
    }
  })

  tabManager.setTitleChangeCallback((title, url) => {
    if (!url) return

    if (title.includes('Illegal contest ID') && url.includes('codeforces.com')) {
      const match = url.match(/codeforces\.com\/(?:gym|problemset\/problem|contest)\/(\d+)/)
      if (match) {
        tabManager.navigate(`https://codeforces.com/gym/${match[1]}/attachments`)
        return
      }
    }

    if (updateProblemTitle(url, title, 'browser-title')) return
    scheduleTitleExtraction(url)
  })

  tabManager.addActiveTabChangeListener((url) => {
    if (!url || url === 'about:blank') return
    const title = tabManager.getTitleForUrl(url)
    if (updateProblemTitle(url, title, 'browser-title')) return
    scheduleTitleExtraction(url)
  })
}
