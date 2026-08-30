import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from 'electron'
import { TabManager } from '../../electron/browser/TabManager.ts'

async function drainNavigationEvents(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('TabManager renderer health', () => {
  test('keeps a crashed active tab and restores it with the same stable id', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow({ width: 1200, height: 800 })
    const manager = new TabManager(window as never)
    const tabId = manager.createTab('https://example.com/problem')
    await drainNavigationEvents()
    const view = window.contentView.children[0]

    view.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })

    assert.strictEqual(window.contentView.children.length, 0)
    assert.deepStrictEqual(manager.getTabList().map((tab) => ({
      id: tab.id,
      url: tab.url,
      isCrashed: tab.isCrashed,
    })), [{ id: tabId, url: 'https://example.com/problem', isCrashed: true }])

    manager.reloadTab(tabId)

    assert.strictEqual(manager.getActiveTabId(), tabId)
    assert.strictEqual(manager.getTabList()[0].isCrashed, false)
    assert.deepStrictEqual(window.contentView.children, [view])
  })

  test('replaces a destroyed crashed view and reloads the preserved url', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    const tabId = manager.createTab('https://example.com/preserved')
    await drainNavigationEvents()
    const crashedView = window.contentView.children[0]
    const crashedContents = crashedView.webContents

    crashedContents.emit('render-process-gone', {}, { reason: 'oom', exitCode: 1 })
    crashedContents.close()
    manager.reloadTab(tabId)
    await drainNavigationEvents()

    assert.strictEqual(manager.getTabList()[0].id, tabId)
    assert.strictEqual(manager.getTabList()[0].url, 'https://example.com/preserved')
    assert.strictEqual(manager.getTabList()[0].isCrashed, false)
    assert.strictEqual(manager.getUrl(), 'https://example.com/preserved')
    assert.strictEqual(window.contentView.children.length, 1)
    assert.notStrictEqual(window.contentView.children[0], crashedView)
  })

  test('yields layout space while unresponsive and restores it for wait or responsive', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow({ width: 1200, height: 800 })
    const manager = new TabManager(window as never)
    const firstId = manager.createTab('https://example.com/first')
    await drainNavigationEvents()
    const firstView = window.contentView.children[0]
    const secondId = manager.createTab('https://example.com/second')
    await drainNavigationEvents()
    const secondView = window.contentView.children[0]

    firstView.webContents.emit('unresponsive')
    assert.strictEqual(secondView.getBounds().y, 78)

    manager.switchTab(firstId)
    assert.strictEqual(firstView.getBounds().y, 116)
    assert.strictEqual(manager.getTabList()[0].isUnresponsive, true)
    assert.strictEqual(manager.getTabList()[0].isUnresponsiveNoticeDismissed, false)

    manager.dismissUnresponsive(firstId)
    assert.strictEqual(firstView.getBounds().y, 78)
    assert.strictEqual(manager.getTabList()[0].isUnresponsive, true)
    assert.strictEqual(manager.getTabList()[0].isUnresponsiveNoticeDismissed, true)

    firstView.webContents.emit('responsive')
    assert.strictEqual(firstView.getBounds().y, 78)
    assert.strictEqual(manager.getTabList()[0].isUnresponsive, false)
    assert.strictEqual(manager.getTabList()[0].isUnresponsiveNoticeDismissed, false)
    assert.strictEqual(manager.getActiveTabId(), firstId)
    assert.strictEqual(manager.getTabList().find((tab) => tab.id === secondId)?.isActive, false)
  })

  test('ignores a failed recovery after its tab has already closed', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    const tabId = manager.createTab('https://example.com/failing')
    await drainNavigationEvents()
    const contents = window.contentView.children[0].webContents
    contents.reload = (() => Promise.reject(new Error('reload failed'))) as never

    contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
    manager.reloadTab(tabId)
    manager.closeTab(tabId)
    await drainNavigationEvents()

    assert.strictEqual(manager.getTabList().length, 1)
    assert.notStrictEqual(manager.getTabList()[0].id, tabId)
    assert.strictEqual(manager.getTabList()[0].isCrashed, false)
    assert.strictEqual(manager.getActiveTabId(), manager.getTabList()[0].id)
  })

  test('stops the recovery spinner and broadcasts once when the retry load fails', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    const tabId = manager.createTab('https://example.com/flaky')
    await drainNavigationEvents()
    const view = window.contentView.children[0]
    const contents = view.webContents
    // 静默 reload 把标签页留在"等待恢复"状态；mock 的 reload 默认同步发
    // did-finish-load，那会让恢复立刻成功，失败路径就永远走不到。
    contents.reload = (() => undefined) as never

    contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
    manager.reloadTab(tabId)
    assert.strictEqual(manager.getTabList()[0].isLoading, true)

    const broadcasts: boolean[] = []
    manager.setTabListChangedCallback((tabs) => broadcasts.push(tabs[0].isLoading))
    contents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://example.com/flaky', true)

    assert.deepStrictEqual(manager.getTabList().map((tab) => ({
      id: tab.id,
      isCrashed: tab.isCrashed,
      isLoading: tab.isLoading,
    })), [{ id: tabId, isCrashed: true, isLoading: false }])
    assert.deepStrictEqual(window.contentView.children, [])
    assert.deepStrictEqual(broadcasts, [false])
  })

  test('treats a repeated failure on the same recovery view as a no-op', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    const tabId = manager.createTab('https://example.com/flaky')
    await drainNavigationEvents()
    const contents = window.contentView.children[0].webContents
    contents.reload = (() => undefined) as never

    contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
    manager.reloadTab(tabId)
    contents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://example.com/flaky', true)

    const broadcasts: unknown[] = []
    manager.setTabListChangedCallback((tabs) => broadcasts.push(tabs))
    contents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://example.com/flaky', true)

    assert.deepStrictEqual(broadcasts, [])
    assert.deepStrictEqual(manager.getTabList().map((tab) => ({
      id: tab.id,
      isCrashed: tab.isCrashed,
      isLoading: tab.isLoading,
    })), [{ id: tabId, isCrashed: true, isLoading: false }])
    assert.deepStrictEqual(window.contentView.children, [])
  })

  test('keeps waiting when the recovery load is aborted by the user or a subframe', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    const tabId = manager.createTab('https://example.com/slow')
    await drainNavigationEvents()
    const view = window.contentView.children[0]
    const contents = view.webContents
    contents.reload = (() => undefined) as never

    contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
    manager.reloadTab(tabId)

    // -3 是用户按停止键；把它当恢复失败处理会让停止操作显示成崩溃页。
    contents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'https://example.com/slow', true)
    // 子框架失败与标签页健康无关，主框架仍在恢复中。
    contents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://ads.example/pixel', false)

    assert.strictEqual(manager.getTabList()[0].isLoading, true)
    assert.strictEqual(manager.getTabList()[0].isCrashed, true)

    contents.emit('did-finish-load')

    assert.deepStrictEqual(manager.getTabList().map((tab) => ({
      id: tab.id,
      isCrashed: tab.isCrashed,
      isLoading: tab.isLoading,
    })), [{ id: tabId, isCrashed: false, isLoading: false }])
    assert.deepStrictEqual(window.contentView.children, [view])
  })

  test('leaves a healthy tab untouched when a plain navigation error arrives', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    const tabId = manager.createTab('https://example.com/live')
    await drainNavigationEvents()
    const view = window.contentView.children[0]

    view.webContents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://example.com/live/next', true)

    assert.deepStrictEqual(manager.getTabList().map((tab) => ({
      id: tab.id,
      isCrashed: tab.isCrashed,
    })), [{ id: tabId, isCrashed: false }])
    assert.deepStrictEqual(window.contentView.children, [view])
  })

  test('does not crash the replacement view when a stale recovery failure lands late', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    const tabId = manager.createTab('https://example.com/stale')
    await drainNavigationEvents()
    const staleView = window.contentView.children[0]
    const staleContents = staleView.webContents
    let rejectRecovery: (error: Error) => void = () => undefined
    // 恢复失败的回调挂在 loadURL/reload 返回的 promise 上，所以要把它悬在
    // 手里，等 view 被换掉之后再让它落地——这就是"迟到的失败"。
    staleContents.reload = (() => new Promise<void>((_resolve, reject) => { rejectRecovery = reject })) as never

    staleContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
    manager.reloadTab(tabId)

    // isDestroyed 先翻真、destroyed 事件还没送达，是渲染进程消失时的真实竞态；
    // 它让下一次恢复换上新 view，而旧 view 仍留在等待恢复的集合里。
    staleContents.isDestroyed = (() => true) as never
    manager.navigate('https://example.com/stale/retry')
    await drainNavigationEvents()
    const freshView = window.contentView.children[0]
    assert.notStrictEqual(freshView, staleView)
    assert.strictEqual(manager.getTabList()[0].isCrashed, false)

    rejectRecovery(new Error('stale recovery load failed'))
    await drainNavigationEvents()

    assert.deepStrictEqual(manager.getTabList().map((tab) => ({
      id: tab.id,
      isCrashed: tab.isCrashed,
      isLoading: tab.isLoading,
    })), [{ id: tabId, isCrashed: false, isLoading: false }])
    assert.deepStrictEqual(window.contentView.children, [freshView])
  })
})
