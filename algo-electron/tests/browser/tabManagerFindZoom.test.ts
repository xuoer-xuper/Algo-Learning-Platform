import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from '../electron/electronMock'
import { TabManager } from '../../electron/browser/TabManager.ts'
import { BROWSER_LAYOUT } from '../../electron/browser/browserLayout.ts'
import type { FindInPageViewState } from '../../electron/browser/findInPage.ts'
import { PendingUserScriptInstallRegistry } from '../../electron/downloads/userScriptNavigation.ts'

async function drainNavigationEvents(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  resetElectronMock()
})

describe('TabManager find in page', () => {
  test('scopes results to the active tab and stacks document-flow insets', async () => {
    const window = new MockBrowserWindow({ width: 1200, height: 800 })
    const manager = new TabManager(window as never)
    const tabId = manager.createTab('https://example.com/problem')
    await drainNavigationEvents()
    const view = window.contentView.children[0]
    const results: FindInPageViewState[] = []
    manager.setFindInPageStateChangedHandler((state) => results.push(state))

    expect(manager.openFindInPage()).toBe(true)
    manager.setDownloadNoticeVisible(true)
    expect(view.getBounds().y).toBe(154)
    manager.setContestNoticeVisible(true)
    expect(view.getBounds().y).toBe(192)
    // 重复投递同一状态不应再排一次版：真实环境下这是一次跨进程 setBounds。
    const settledCalls = view.setBoundsCalls
    manager.setContestNoticeVisible(true)
    expect(view.setBoundsCalls).toBe(settledCalls)
    expect(view.getBounds().y).toBe(192)

    const pending = manager.findInPage(tabId, { type: 'query', query: 'graph' })
    expect(pending?.requestId).toBe(1)
    expect(view.webContents.findInPageCalls).toEqual([{
      text: 'graph',
      options: { forward: true, findNext: true },
    }])

    view.webContents.simulateFoundInPage({
      requestId: 1,
      activeMatchOrdinal: 2,
      matches: 5,
      selectionArea: { x: 0, y: 0, width: 10, height: 10 },
      finalUpdate: true,
    })
    expect(results.at(-1)).toMatchObject({
      tabId,
      activeMatchOrdinal: 2,
      matches: 5,
      finalUpdate: true,
    })

    manager.findInPage(tabId, { type: 'close' })
    expect(view.webContents.stopFindInPageCalls.at(-1)).toBe('keepSelection')
    expect(view.getBounds().y).toBe(154)
    manager.setContestNoticeVisible(false)
    expect(view.getBounds().y).toBe(116)
  })

  test('each notice kind occupies its own slot and releases it independently', async () => {
    const window = new MockBrowserWindow({ width: 1200, height: 800 })
    const manager = new TabManager(window as never)
    manager.createTab('https://example.com/problem')
    await drainNavigationEvents()
    const view = window.contentView.children[0]

    // 六条通知条共用一个可见集合，这里逐条打开：每条都必须让出自己那一格，
    // 任意两条被错认成同一种都会让高度停在上一档。
    const show: ReadonlyArray<(visible: boolean) => void> = [
      (v) => manager.setDownloadNoticeVisible(v),
      (v) => manager.setContestNoticeVisible(v),
      (v) => manager.setUserScriptPermissionNoticeVisible(v),
      (v) => manager.setCredentialAutofillNoticeVisible(v),
      (v) => manager.setCredentialCaptureNoticeVisible(v),
      (v) => manager.setErrorNoticeVisible(v),
    ]
    show.forEach((toggle, index) => {
      toggle(true)
      expect(view.getBounds().y).toBe(BROWSER_LAYOUT.topOffset + (index + 1) * BROWSER_LAYOUT.noticeBarHeight)
    })

    // 反向逐条关闭，验证释放的是自己那一格而不是整块清零。
    show.forEach((toggle, index) => {
      toggle(false)
      expect(view.getBounds().y).toBe(BROWSER_LAYOUT.topOffset + (show.length - index - 1) * BROWSER_LAYOUT.noticeBarHeight)
    })
    expect(view.getBounds().y).toBe(BROWSER_LAYOUT.topOffset)
  })

  test('switching away closes the bar, drops the highlight, and frees the inset on return', async () => {
    const window = new MockBrowserWindow({ width: 1200, height: 800 })
    const manager = new TabManager(window as never)
    const firstTabId = manager.createTab('https://example.com/problem/1')
    const secondTabId = manager.createTab('https://example.com/problem/2')
    await drainNavigationEvents()
    manager.switchTab(firstTabId)
    const firstView = window.contentView.children[0]
    const states: FindInPageViewState[] = []

    expect(manager.openFindInPage()).toBe(true)
    manager.findInPage(firstTabId, { type: 'query', query: 'dijkstra' })
    expect(firstView.getBounds().y).toBe(BROWSER_LAYOUT.topOffset + BROWSER_LAYOUT.findBarHeight)
    manager.setFindInPageStateChangedHandler((state) => states.push(state))

    manager.switchTab(secondTabId)

    // 查找栏属于某一个标签页。切走时若不主动关闭，renderer 会继续显示搜索框，
    // 而它指向的已经是一个背景标签页——输入就会打到看不见的页面上。
    expect(states).toEqual([expect.objectContaining({ open: false, tabId: null, query: '' })])
    // 旧页的黄色高亮也必须撤掉，否则切回来时残留着上一次的搜索痕迹。
    expect(firstView.webContents.stopFindInPageCalls.at(-1)).toBe('clearSelection')

    manager.switchTab(firstTabId)
    expect(window.contentView.children).toEqual([firstView])
    expect(firstView.getBounds().y).toBe(BROWSER_LAYOUT.topOffset)
  })

  test('refuses to open on a crashed tab and ignores commands aimed at a background tab', async () => {
    const window = new MockBrowserWindow({ width: 1200, height: 800 })
    const manager = new TabManager(window as never)
    const activeTabId = manager.createTab('https://example.com/live')
    const backgroundTabId = manager.createTab('https://example.com/background')
    await drainNavigationEvents()
    manager.switchTab(activeTabId)

    // 后台标签页的查找命令必须被丢掉：findInPage 是有副作用的（它会滚动并高亮），
    // 施加在看不见的页面上等于让用户的按键消失。
    expect(manager.findInPage(backgroundTabId, { type: 'query', query: 'x' })).toBeNull()

    const activeView = window.contentView.children[0]
    activeView.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })

    expect(manager.getTabList().find((tab) => tab.id === activeTabId)?.isCrashed).toBe(true)
    // 崩溃页没有可用的 webContents，开查找栏只会占掉 38px 却什么都搜不到。
    expect(manager.openFindInPage()).toBe(false)
    expect(manager.findInPage(activeTabId, { type: 'query', query: 'x' })).toBeNull()
  })
})

describe('TabManager zoom preferences', () => {
  test('uses Chrome presets, saves before applying, and restores the committed origin', async () => {
    const saved = new Map([['https://example.com', 1.25]])
    const saveZoomFactorForUrl = vi.fn((url: string, factor: number) => {
      saved.set(new URL(url).origin, factor)
      return factor
    })
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never, {
      getZoomFactorForUrl: (url) => saved.get(new URL(url).origin) ?? 1,
      saveZoomFactorForUrl,
    })
    const tabId = manager.createTab('https://example.com/problem')
    await drainNavigationEvents()
    const view = window.contentView.children[0]

    expect(view.webContents.getZoomFactor()).toBe(1.25)
    expect(manager.setZoom(tabId, 'in')).toEqual({ tabId, factor: 1.5 })
    expect(saveZoomFactorForUrl).toHaveBeenCalledWith('https://example.com/problem', 1.5)
    expect(view.webContents.getZoomFactor()).toBe(1.5)

    saveZoomFactorForUrl.mockImplementationOnce(() => { throw new Error('read only') })
    expect(manager.setZoom(tabId, 'out')).toBeNull()
    expect(view.webContents.getZoomFactor()).toBe(1.5)
  })
})

describe('TabManager userscript navigation', () => {
  test('routes .user.js directly to a volatile internal confirmation tab', () => {
    const window = new MockBrowserWindow()
    const registry = new PendingUserScriptInstallRegistry({ idFactory: () => 'install-1' })
    const manager = new TabManager(window as never, { userScriptInstallRegistry: registry })

    const tabId = manager.createTab('https://example.com/helper.user.js')

    expect(manager.getTabList()).toMatchObject([{
      id: tabId,
      kind: 'internal',
      page: { type: 'script-install', installId: 'install-1' },
    }])
    expect(window.contentView.children).toHaveLength(0)
    expect(registry.get('install-1')?.sourceFileName).toBe('helper.user.js')
    expect(manager.getSessionSnapshot().tabs).toEqual([])

    manager.closeTab(tabId)
    expect(registry.get('install-1')).toBeNull()
  })
})
