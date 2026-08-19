import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserPageEvent } from '../../electron/browser/TabManager'
import { installProblemTitleTracking } from '../../electron/tracking/problemTitleTracking'

const mocks = vi.hoisted(() => ({
  upsertProblem: vi.fn(),
  resolveIdentity: vi.fn(),
  createFallbackScript: vi.fn(() => 'readProblemTitle()'),
}))

vi.mock('../../electron/db/repositories/problemRepository', () => ({
  upsertProblem: mocks.upsertProblem,
}))

vi.mock('../../electron/parsers/browserTitle', () => ({
  resolveBrowserTitleProblemIdentity: mocks.resolveIdentity,
}))

vi.mock('../../electron/parsers/problemTitleFallback', () => ({
  createProblemTitleFallbackScript: mocks.createFallbackScript,
}))

vi.mock('../../electron/parsers/registry', () => ({
  parseUrl: vi.fn(),
}))

function pageEvent(webContentsId: number, reason: BrowserPageEvent['reason']): BrowserPageEvent {
  return {
    windowId: 'window-1',
    tabId: `tab-${webContentsId}`,
    webContentsId,
    url: 'https://leetcode.cn/problems/two-sum/',
    isMainFrame: true,
    reason,
  }
}

function createTabManagerHarness() {
  const pageListeners: Array<(event: BrowserPageEvent) => void> = []
  const activeTabListeners: Array<(url: string) => void> = []
  const scriptResults = new Map<number, string>()
  const titleResults = new Map<number, string | null>()
  const executedPages: BrowserPageEvent[] = []
  const titlePages: BrowserPageEvent[] = []
  let activeWebContentsId = 101

  return {
    manager: {
      addPageEventListener(callback: (event: BrowserPageEvent) => void) {
        pageListeners.push(callback)
        return () => undefined
      },
      addActiveTabChangeListener(callback: (url: string) => void) {
        activeTabListeners.push(callback)
        return () => undefined
      },
      getActivePageEvent() {
        return pageEvent(activeWebContentsId, 'active-tab-changed')
      },
      getWindowId: () => 'window-1',
      isPageActive: (event: BrowserPageEvent) => event.webContentsId === activeWebContentsId,
      getTitleForPage(event: BrowserPageEvent) {
        titlePages.push(event)
        return titleResults.get(event.webContentsId) ?? null
      },
      executeScriptForPage(event: BrowserPageEvent) {
        executedPages.push(event)
        return Promise.resolve(scriptResults.get(event.webContentsId))
      },
      navigatePage: vi.fn(() => Promise.resolve()),
    },
    emitPage(event: BrowserPageEvent) {
      pageListeners.forEach((listener) => listener(event))
    },
    executedPages,
    scriptResults,
    setActive(webContentsId: number) {
      activeWebContentsId = webContentsId
    },
    titlePages,
    titleResults,
  }
}

describe('problem title tracking page ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.resolveIdentity.mockImplementation((_url, title) => {
      if (typeof title !== 'string' || !title.endsWith('DOM')) return null
      return { platform: 'leetcode', problemId: 'two-sum', title }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('tracks only the active page while resolving same-URL fallbacks against each exact owner', async () => {
    const harness = createTabManagerHarness()
    const notifyProblemsUpdated = vi.fn()
    const trackingService = {
      handleNavigation: vi.fn(() => ({ platform: 'leetcode', problemId: 'two-sum' })),
      endVisitForPage: vi.fn(),
    }
    harness.scriptResults.set(101, 'Active DOM')
    harness.scriptResults.set(202, 'Background DOM')

    installProblemTitleTracking({
      tabManager: harness.manager as never,
      getTrackingService: () => trackingService as never,
      notifyProblemsUpdated,
    })

    harness.emitPage(pageEvent(202, 'did-navigate'))
    harness.emitPage(pageEvent(101, 'did-navigate'))
    harness.emitPage({ ...pageEvent(202, 'page-title-updated'), title: 'Loading' })
    await vi.advanceTimersByTimeAsync(2000)

    expect(trackingService.handleNavigation).toHaveBeenCalledTimes(1)
    expect(trackingService.handleNavigation).toHaveBeenCalledWith(pageEvent(101, 'did-navigate'))
    expect(harness.executedPages.map((event) => event.webContentsId).sort()).toEqual([101, 202])
    expect(harness.executedPages.every((event) => event.url === pageEvent(101, 'did-navigate').url)).toBe(true)
    expect(mocks.upsertProblem).toHaveBeenCalledTimes(2)
    expect(notifyProblemsUpdated).toHaveBeenCalledTimes(3)
  })

  it('uses the newly active page identity for title lookup and navigation tracking', () => {
    const harness = createTabManagerHarness()
    const trackingService = {
      handleNavigation: vi.fn(() => ({ platform: 'leetcode', problemId: 'two-sum' })),
      endVisitForPage: vi.fn(),
    }
    harness.setActive(202)
    harness.titleResults.set(202, 'Background DOM')

    installProblemTitleTracking({
      tabManager: harness.manager as never,
      getTrackingService: () => trackingService as never,
      notifyProblemsUpdated: vi.fn(),
    })

    const event = pageEvent(202, 'active-tab-changed')
    harness.emitPage(event)

    expect(trackingService.handleNavigation).toHaveBeenCalledWith(event)
    expect(harness.titlePages).toEqual([event])
    expect(mocks.upsertProblem).toHaveBeenCalledWith(expect.objectContaining({ title: 'Background DOM' }))
  })

  it('cancels delayed extraction and closes only the destroyed page visit', async () => {
    const harness = createTabManagerHarness()
    const trackingService = {
      handleNavigation: vi.fn(() => ({ platform: 'leetcode', problemId: 'two-sum' })),
      endVisitForPage: vi.fn(),
    }

    installProblemTitleTracking({
      tabManager: harness.manager as never,
      getTrackingService: () => trackingService as never,
      notifyProblemsUpdated: vi.fn(),
    })

    const navigation = pageEvent(101, 'did-navigate')
    const destroyed = pageEvent(101, 'destroyed')
    harness.emitPage(navigation)
    harness.emitPage(destroyed)
    await vi.advanceTimersByTimeAsync(5000)

    expect(trackingService.endVisitForPage).toHaveBeenCalledTimes(1)
    expect(trackingService.endVisitForPage).toHaveBeenCalledWith(destroyed)
    expect(harness.executedPages).toEqual([])
    expect(harness.titlePages).toEqual([])
  })
})
