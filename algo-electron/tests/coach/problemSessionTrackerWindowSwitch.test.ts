import { describe, expect, it } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from '../electron/electronMock'
import type { TabManager } from '../../electron/browser/TabManager.ts'
import { ProblemSessionTracker } from '../../electron/coach/ProblemSessionTracker.ts'
import type { ProblemIdentity } from '../../electron/shared/types.ts'
import type { TrackingService } from '../../electron/tracking/TrackingService.ts'
import { AppWindow } from '../../electron/windows/AppWindow.ts'

type TrackingSource = {
  windowId: string
  tabId: string
  webContentsId: number
} | null

class FakeTrackingService {
  private readonly listeners = new Set<(
    identity: ProblemIdentity,
    source: TrackingSource,
  ) => void>()

  addProblemDetectedListener(
    listener: (identity: ProblemIdentity, source: TrackingSource) => void,
  ): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(identity: ProblemIdentity, source: TrackingSource): void {
    for (const listener of this.listeners) listener(identity, source)
  }
}

class FakeTabManager {
  private readonly listeners = new Set<(url: string) => void>()

  constructor(private url: string) {}

  addActiveTabChangeListener(listener: (url: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getUrl(): string {
    return this.url
  }

  emit(url: string): void {
    this.url = url
    for (const listener of this.listeners) listener(url)
  }
}

function identity(id: string): ProblemIdentity {
  return {
    platform: 'test',
    platformProblemId: id,
    canonicalUrl: `problem:${id}`,
    confidence: 'url',
  }
}

function createAppWindow(id: string, url: string): {
  appWindow: AppWindow
  browserWindow: MockBrowserWindow
  tabManager: FakeTabManager
} {
  const browserWindow = new MockBrowserWindow()
  const tabManager = new FakeTabManager(url)
  return {
    appWindow: new AppWindow({
      id,
      browserWindow: browserWindow as never,
      tabManager: tabManager as unknown as TabManager,
    }),
    browserWindow,
    tabManager,
  }
}

describe('ProblemSessionTracker window switching', () => {
  it('unbinds the old manager and consumes detections only from the current window', () => {
    resetElectronMock()
    const tracking = new FakeTrackingService()
    const first = createAppWindow('window-a', 'problem:a')
    const second = createAppWindow('window-b', 'problem:b')
    first.browserWindow.focus()
    second.browserWindow.focus()
    const tracker = new ProblemSessionTracker({
      trackingService: tracking as unknown as TrackingService,
      parseProblemUrl: (url) => url.startsWith('problem:') ? identity(url.slice('problem:'.length)) : null,
      setInterval: (_callback, _delayMs) => ({}) as NodeJS.Timeout,
      clearInterval: (_handle) => undefined,
      now: () => 1_000,
    })

    tracker.start()
    tracker.switchWindow(first.appWindow)
    expect(tracker.getCurrentSession()?.platform_problem_id).toBe('a')

    tracker.switchWindow(second.appWindow)
    expect(tracker.getCurrentWindowId()).toBe('window-b')
    expect(tracker.getCurrentSession()?.platform_problem_id).toBe('b')

    first.tabManager.emit('problem:stale-tab')
    tracking.emit(identity('stale-tracking'), {
      windowId: 'window-a',
      tabId: 'tab-a',
      webContentsId: 10,
    })
    expect(tracker.getCurrentSession()?.platform_problem_id).toBe('b')

    tracking.emit(identity('current'), {
      windowId: 'window-b',
      tabId: 'tab-b',
      webContentsId: 20,
    })
    expect(tracker.getCurrentSession()?.platform_problem_id).toBe('current')

    tracker.stop()
  })

  it('counts activity while any application shell is focused', () => {
    resetElectronMock()
    const tracking = new FakeTrackingService()
    const active = createAppWindow('window-a', 'problem:a')
    let now = 0
    let anyWindowFocused = true
    const tracker = new ProblemSessionTracker({
      trackingService: tracking as unknown as TrackingService,
      parseProblemUrl: (url) => url.startsWith('problem:') ? identity(url.slice('problem:'.length)) : null,
      isAnyAppWindowFocused: () => anyWindowFocused,
      setInterval: (_callback, _delayMs) => ({}) as NodeJS.Timeout,
      clearInterval: (_handle) => undefined,
      now: () => now,
    })

    tracker.start()
    tracker.switchWindow(active.appWindow)
    now = 30_000
    tracker.tickForTest()
    expect(tracker.getCurrentSession()?.active_seconds).toBe(30)

    anyWindowFocused = false
    now = 60_000
    tracker.tickForTest()
    expect(tracker.getCurrentSession()?.active_seconds).toBe(30)
    tracker.stop()
  })
})
