import { describe, expect, it, vi } from 'vitest'
import { MockBrowserWindow, type MockWebContents, resetElectronMock } from 'electron'
import { TabManager } from '../../electron/browser/TabManager.ts'
import {
  ContestUrlAggregator,
  installContestNavigationTracking,
  type WebContentsUrlSource,
} from '../../electron/coach/ContestUrlAggregator.ts'
import { ContestGuard } from '../../electron/coach/ContestGuard.ts'

class TestUrlSource implements WebContentsUrlSource {
  private readonly listeners = new Set<(snapshot: { webContentsId: number; url: string | null }) => void>()

  addWebContentsUrlListener(
    listener: (snapshot: { webContentsId: number; url: string | null }) => void,
  ): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(webContentsId: number, url: string | null): void {
    for (const listener of this.listeners) listener({ webContentsId, url })
  }
}

describe('ContestUrlAggregator', () => {
  it('keeps the oldest contest view authoritative until it leaves', () => {
    const changes: string[] = []
    const aggregator = new ContestUrlAggregator({
      isContestUrl: (url) => url.startsWith('contest:'),
      onAggregateUrlChange: (url) => changes.push(url),
    })

    aggregator.update(10, 'practice:https://example.com')
    aggregator.update(20, 'contest:first')
    aggregator.update(30, 'contest:second')
    expect(changes).toEqual(['contest:first'])

    aggregator.update(20, 'practice:https://example.com/finished')
    expect(changes).toEqual(['contest:first', 'contest:second'])

    aggregator.remove(30)
    expect(changes).toEqual(['contest:first', 'contest:second', ''])
  })

  it('does not let a non-contest window clear another window contest', () => {
    const changes: string[] = []
    const aggregator = new ContestUrlAggregator({
      isContestUrl: (url) => url.startsWith('contest:'),
      onAggregateUrlChange: (url) => changes.push(url),
    })
    const first = new TestUrlSource()
    const second = new TestUrlSource()
    const detachFirst = installContestNavigationTracking(first, aggregator)
    const detachSecond = installContestNavigationTracking(second, aggregator)

    first.emit(10, 'contest:first')
    second.emit(20, 'practice:second')
    second.emit(20, 'practice:changed')
    detachSecond()

    expect(changes).toEqual(['contest:first'])

    detachFirst()
    expect(changes).toEqual(['contest:first', ''])
  })

  it('removes only the detached source and exits after the final contest view disappears', () => {
    const changes: string[] = []
    const aggregator = new ContestUrlAggregator({
      isContestUrl: (url) => url.startsWith('contest:'),
      onAggregateUrlChange: (url) => changes.push(url),
    })
    const first = new TestUrlSource()
    const second = new TestUrlSource()
    const detachFirst = installContestNavigationTracking(first, aggregator)
    const detachSecond = installContestNavigationTracking(second, aggregator)

    first.emit(10, 'contest:first')
    second.emit(20, 'contest:second')
    detachFirst()

    expect(changes).toEqual(['contest:first', 'contest:second'])

    second.emit(20, null)
    expect(changes).toEqual(['contest:first', 'contest:second', ''])
    detachSecond()
  })

  it('tracks replayed, same-tab, background-tab, and destroyed view URLs', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow({ width: 1200, height: 800 })
    const manager = new TabManager(window as never)
    const firstTabId = manager.createTab('https://codeforces.com/contest/2048/problem/A')
    const firstContents = window.contentView.children[0].webContents as MockWebContents
    await Promise.resolve()

    const onEnter = vi.fn()
    const onEnd = vi.fn()
    const guard = new ContestGuard({ onContestEnter: onEnter, onContestEnd: onEnd })
    const aggregator = new ContestUrlAggregator({
      onAggregateUrlChange: (url) => guard.handleUrlChange(url),
    })
    const unsubscribe = installContestNavigationTracking(manager, aggregator)

    expect(guard.isContestMode()).toBe(true)
    expect(onEnter).toHaveBeenCalledTimes(1)

    await firstContents.loadURL('https://codeforces.com/problemset/problem/2048/A')
    expect(guard.isContestMode()).toBe(false)
    expect(onEnd).toHaveBeenCalledTimes(1)

    manager.createTab('https://example.com/background')
    const backgroundContents = window.contentView.children[0].webContents as MockWebContents
    await Promise.resolve()
    manager.switchTab(firstTabId)

    await backgroundContents.loadURL('https://www.luogu.com.cn/contest/12345/problem/P1001')
    expect(manager.getActiveTabId()).toBe(firstTabId)
    expect(guard.isContestMode()).toBe(true)
    expect(onEnter).toHaveBeenCalledTimes(2)

    backgroundContents.close()
    expect(guard.isContestMode()).toBe(false)
    expect(onEnd).toHaveBeenCalledTimes(2)

    unsubscribe()
    manager.destroy()
  })
})
