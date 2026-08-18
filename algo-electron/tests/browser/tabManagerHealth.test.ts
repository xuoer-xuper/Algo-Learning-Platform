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
})
