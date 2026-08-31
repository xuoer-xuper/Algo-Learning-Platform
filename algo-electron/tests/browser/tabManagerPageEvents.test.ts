import { describe, expect, it } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from '../electron/electronMock'
import { TabManager, type BrowserPageEvent } from '../../electron/browser/TabManager.ts'
import { BROWSER_LAYOUT } from '../../electron/browser/browserLayout.ts'
import { ViewRegistry } from '../../electron/windows/ViewRegistry.ts'

async function drain(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

/**
 * `did-navigate` 和 `did-navigate-in-page` 的处理体在守卫之后有 14 行字节完全相同，
 * 只差事件名和参数个数。参数化跑两遍，是为了让一份期望同时约束两个孪生实现——
 * 只改其中一个（或将来合并时漏掉一个）会立刻失败。
 *
 * 两个事件的签名不同：did-navigate 是 (event, url, code, status, isMainFrame)，
 * did-navigate-in-page 是 (event, url, isMainFrame)，所以按事件名补参数。
 */
const MAIN_FRAME_NAVIGATION_EVENTS = ['did-navigate', 'did-navigate-in-page'] as const

function emitMainFrameNavigation(
  contents: { emit: (event: string, ...args: unknown[]) => boolean },
  eventName: (typeof MAIN_FRAME_NAVIGATION_EVENTS)[number],
  url: string,
): void {
  if (eventName === 'did-navigate') contents.emit(eventName, {}, url, 200, 'OK', true)
  else contents.emit(eventName, {}, url, true)
}

describe('TabManager page events', () => {
  it('emits exact per-webContents identities for background navigation and lifecycle events', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    const registry = new ViewRegistry()
    const manager = new TabManager(window as never, { windowId: 'window-1', viewRegistry: registry })
    const events: BrowserPageEvent[] = []
    manager.addPageEventListener((event) => events.push(event))

    const activeTabId = manager.createTab('https://example.com/active')
    const backgroundTabId = manager.createTab('https://example.com/background')
    await drain()
    manager.switchTab(activeTabId)
    const backgroundEntry = registry.getByWindow('window-1').find((entry) => entry.tabId === backgroundTabId)
    expect(backgroundEntry?.kind).toBe('tab')
    if (!backgroundEntry || backgroundEntry.kind !== 'tab') throw new Error('background tab missing')

    events.length = 0
    await backgroundEntry.view.webContents.loadURL('https://example.com/background/next')
    backgroundEntry.view.webContents.emit('page-title-updated', {}, 'Background title')
    backgroundEntry.view.webContents.emit('dom-ready')
    backgroundEntry.view.webContents.emit('did-frame-finish-load', {}, false)

    expect(manager.getActiveTabId()).toBe(activeTabId)
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        windowId: 'window-1',
        tabId: backgroundTabId,
        webContentsId: backgroundEntry.webContentsId,
        url: 'https://example.com/background/next',
        isMainFrame: true,
        reason: 'did-navigate',
      }),
      expect.objectContaining({ tabId: backgroundTabId, reason: 'page-title-updated', title: 'Background title' }),
      expect.objectContaining({ tabId: backgroundTabId, reason: 'dom-ready', isMainFrame: true }),
      expect.objectContaining({ tabId: backgroundTabId, reason: 'did-frame-finish-load', isMainFrame: false }),
    ]))
  })

  it('reports iframe navigation without replacing the tab or top-level webContents URL', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    const registry = new ViewRegistry()
    const manager = new TabManager(window as never, { windowId: 'window-1', viewRegistry: registry })
    const tabId = manager.createTab('https://example.com/problem')
    await drain()
    const entry = registry.getByWindow('window-1').find((candidate) => candidate.tabId === tabId)
    if (!entry || entry.kind !== 'tab') throw new Error('tab missing')

    const events: BrowserPageEvent[] = []
    const urlSnapshots: Array<{ webContentsId: number; url: string | null }> = []
    manager.addPageEventListener((event) => events.push(event))
    manager.addWebContentsUrlListener((snapshot) => urlSnapshots.push(snapshot))
    events.length = 0
    urlSnapshots.length = 0

    entry.view.webContents.emit(
      'did-navigate',
      {},
      'https://frame.example/statement',
      200,
      'OK',
      false,
    )
    entry.view.webContents.emit(
      'did-navigate-in-page',
      {},
      'https://frame.example/statement#examples',
      false,
    )

    expect(events).toEqual([
      expect.objectContaining({
        tabId,
        url: 'https://frame.example/statement',
        isMainFrame: false,
        reason: 'did-navigate',
      }),
      expect.objectContaining({
        tabId,
        url: 'https://frame.example/statement#examples',
        isMainFrame: false,
        reason: 'did-navigate-in-page',
      }),
    ])
    expect(manager.getTabList().find((tab) => tab.id === tabId)?.url).toBe('https://example.com/problem')
    expect(manager.getActivePageEvent()?.url).toBe('https://example.com/problem')
    expect(urlSnapshots).toEqual([])
  })

  it('emits destroyed exactly once when close and webContents teardown overlap', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    const registry = new ViewRegistry()
    const manager = new TabManager(window as never, { windowId: 'window-1', viewRegistry: registry })
    const tabId = manager.createTab('https://example.com/problem')
    await drain()
    const entry = registry.getByWindow('window-1').find((candidate) => candidate.tabId === tabId)
    if (!entry || entry.kind !== 'tab') throw new Error('tab missing')
    const contents = entry.view.webContents

    const events: BrowserPageEvent[] = []
    manager.addPageEventListener((event) => events.push(event))
    manager.closeTab(tabId)
    contents.emit('destroyed')

    expect(events.filter((event) => (
      event.webContentsId === entry.webContentsId && event.reason === 'destroyed'
    ))).toEqual([
      expect.objectContaining({
        windowId: 'window-1',
        tabId,
        webContentsId: entry.webContentsId,
        url: 'https://example.com/problem',
      }),
    ])
  })

  it('executes only in the page identified by the event and rejects stale ownership', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    const registry = new ViewRegistry()
    const manager = new TabManager(window as never, { windowId: 'window-1', viewRegistry: registry })
    const firstTabId = manager.createTab('https://example.com/same')
    const secondTabId = manager.createTab('https://example.com/same')
    await drain()
    const secondEntry = registry.getByWindow('window-1').find((entry) => entry.tabId === secondTabId)
    if (!secondEntry || secondEntry.kind !== 'tab') throw new Error('second tab missing')
    const event: BrowserPageEvent = {
      windowId: 'window-1',
      tabId: secondTabId,
      webContentsId: secondEntry.webContentsId,
      url: 'https://example.com/same',
      isMainFrame: true,
      reason: 'did-finish-load',
    }
    const calls: string[] = []
    secondEntry.view.webContents.executeJavaScript = (async (code: string) => {
      calls.push(code)
      return 'second-result'
    }) as never

    await expect(manager.executeScriptForPage(event, 'window.marker = 2')).resolves.toBe('second-result')
    expect(calls).toEqual(['window.marker = 2'])
    await expect(manager.executeScriptForPage({ ...event, tabId: firstTabId }, 'wrong')).rejects.toThrow('unavailable')

    await secondEntry.view.webContents.loadURL('https://example.com/next')
    await expect(manager.executeScriptForPage(event, 'stale-navigation')).rejects.toThrow('stale')

    secondEntry.view.webContents.close()
    await expect(manager.executeScriptForPage(event, 'stale')).rejects.toThrow('unavailable')
  })

  it.each(MAIN_FRAME_NAVIGATION_EVENTS)(
    'a main-frame %s rebinds the tab url, re-applies zoom, retracts the find bar and announces the session',
    async (eventName) => {
      resetElectronMock()
      const window = new MockBrowserWindow({ width: 1200, height: 800 })
      const registry = new ViewRegistry()
      const zoomByOrigin = new Map<string, number>()
      const manager = new TabManager(window as never, {
        windowId: 'window-1',
        viewRegistry: registry,
        getZoomFactorForUrl: (url) => zoomByOrigin.get(new URL(url).origin) ?? 1,
      })
      const tabId = manager.createTab('https://example.com/problem/1')
      await drain()
      const entry = registry.getByWindow('window-1').find((candidate) => candidate.tabId === tabId)
      if (!entry || entry.kind !== 'tab') throw new Error('tab missing')
      const contents = entry.view.webContents

      expect(manager.openFindInPage()).toBe(true)
      expect(entry.view.getBounds().y).toBe(BROWSER_LAYOUT.topOffset + BROWSER_LAYOUT.findBarHeight)

      const events: BrowserPageEvent[] = []
      const urlSnapshots: Array<{ webContentsId: number; url: string | null }> = []
      const navigated: string[] = []
      const zoomStates: Array<{ tabId: string; factor: number }> = []
      let sessionChanges = 0
      manager.addPageEventListener((event) => events.push(event))
      manager.addWebContentsUrlListener((snapshot) => urlSnapshots.push(snapshot))
      manager.addNavigateListener((url) => navigated.push(url))
      manager.setZoomChangedHandler((state) => zoomStates.push(state))
      manager.addSessionChangeListener(() => { sessionChanges += 1 })
      // addWebContentsUrlListener 注册时会回放已知快照，先清掉再观测。
      urlSnapshots.length = 0
      // 站点缩放偏好在导航之后才改，用来证明处理体是重新读取并重新施加缩放，
      // 而不是沿用建视图时那一次的结果。
      zoomByOrigin.set('https://example.com', 1.5)

      emitMainFrameNavigation(contents, eventName, 'https://example.com/problem/2')

      expect(events).toEqual([expect.objectContaining({
        windowId: 'window-1',
        tabId,
        webContentsId: entry.webContentsId,
        url: 'https://example.com/problem/2',
        isMainFrame: true,
        reason: eventName,
      })])
      expect(urlSnapshots).toEqual([
        { webContentsId: entry.webContentsId, url: 'https://example.com/problem/2' },
      ])
      expect(contents.getZoomFactor()).toBe(1.5)
      expect(zoomStates).toEqual([{ tabId, factor: 1.5 }])
      expect(navigated).toEqual(['https://example.com/problem/2'])
      expect(manager.getTabList().find((tab) => tab.id === tabId)?.url).toBe('https://example.com/problem/2')
      // 查找栏归这个标签页、且 url 变了：必须先把 findInPageTabId 清空再重算布局。
      // 顺序颠倒的话查找栏的 38px 会留在版面里，这里会停在 116 而不是 78。
      expect(entry.view.getBounds().y).toBe(BROWSER_LAYOUT.topOffset)
      expect(sessionChanges).toBe(1)
    },
  )

  it.each(MAIN_FRAME_NAVIGATION_EVENTS)(
    'a main-frame %s onto the same url still reports the page but leaves the find bar and session alone',
    async (eventName) => {
      resetElectronMock()
      const window = new MockBrowserWindow({ width: 1200, height: 800 })
      const registry = new ViewRegistry()
      const manager = new TabManager(window as never, { windowId: 'window-1', viewRegistry: registry })
      const tabId = manager.createTab('https://example.com/problem/1')
      await drain()
      const entry = registry.getByWindow('window-1').find((candidate) => candidate.tabId === tabId)
      if (!entry || entry.kind !== 'tab') throw new Error('tab missing')

      expect(manager.openFindInPage()).toBe(true)
      const events: BrowserPageEvent[] = []
      const navigated: string[] = []
      let sessionChanges = 0
      manager.addPageEventListener((event) => events.push(event))
      manager.addNavigateListener((url) => navigated.push(url))
      manager.addSessionChangeListener(() => { sessionChanges += 1 })

      emitMainFrameNavigation(entry.view.webContents, eventName, 'https://example.com/problem/1')

      // 重复上报同一个 url（reload、history.replaceState 覆盖同址）不算换页：
      // 会话不必落盘，查找栏也不该被拆掉——否则用户按下重载就丢掉搜索词。
      expect(sessionChanges).toBe(0)
      expect(entry.view.getBounds().y).toBe(BROWSER_LAYOUT.topOffset + BROWSER_LAYOUT.findBarHeight)
      // 但页面事件和导航回调仍然要发，实时钩子依赖它们确认文档还在。
      expect(events).toEqual([expect.objectContaining({
        tabId,
        url: 'https://example.com/problem/1',
        isMainFrame: true,
        reason: eventName,
      })])
      expect(navigated).toEqual(['https://example.com/problem/1'])
    },
  )
})
