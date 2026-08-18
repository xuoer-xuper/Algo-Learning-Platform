import assert from 'node:assert/strict'
import { test } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from 'electron'
import { TabManager } from '../../electron/browser/TabManager.ts'
import { MAX_TABS } from '../../electron/browser/tabManagerConfig.ts'

test('closing the active tab selects its right neighbor and reopening restores url and title', () => {
  resetElectronMock()
  const window = new MockBrowserWindow({ width: 1200, height: 800 })
  const manager = new TabManager(window as never)
  const firstId = manager.createTab('https://example.com/first')
  const middleId = manager.createTab('https://example.com/middle')
  const rightId = manager.createTab('https://example.com/right')

  manager.switchTab(middleId)
  window.contentView.children[0].webContents.setTitle('Middle title')
  manager.closeActiveTab()

  assert.strictEqual(manager.getActiveTabId(), rightId)
  assert.deepStrictEqual(manager.getTabList().map((tab) => tab.id), [firstId, rightId])

  const reopenedId = manager.reopenClosedTab()
  const reopened = manager.getTabList().find((tab) => tab.id === reopenedId)
  assert.ok(reopened)
  assert.strictEqual(reopened.url, 'https://example.com/middle')
  assert.strictEqual(reopened.title, 'Middle title')
  assert.strictEqual(reopened.isActive, true)
  assert.deepStrictEqual(manager.getTabList().map((tab) => tab.id), [firstId, rightId, reopenedId])
})

test('closing a background tab preserves the remaining order and active tab', () => {
  resetElectronMock()
  const window = new MockBrowserWindow()
  const manager = new TabManager(window as never)
  const firstId = manager.createTab('https://example.com/first')
  const middleId = manager.createTab('https://example.com/middle')
  const rightId = manager.createTab('https://example.com/right')

  manager.closeTab(middleId)

  assert.strictEqual(manager.getActiveTabId(), rightId)
  assert.deepStrictEqual(manager.getTabList().map((tab) => tab.id), [firstId, rightId])
})

test('destroying or detaching an active middle tab selects its right neighbor', () => {
  resetElectronMock()
  const destroyedWindow = new MockBrowserWindow()
  const destroyedManager = new TabManager(destroyedWindow as never)
  const firstId = destroyedManager.createTab('https://example.com/first')
  const middleId = destroyedManager.createTab('https://example.com/middle')
  const rightId = destroyedManager.createTab('https://example.com/right')
  const lastId = destroyedManager.createTab('https://example.com/last')

  destroyedManager.switchTab(middleId)
  destroyedWindow.contentView.children[0].webContents.close()

  assert.strictEqual(destroyedManager.getActiveTabId(), rightId)
  assert.deepStrictEqual(destroyedManager.getTabList().map((tab) => tab.id), [firstId, rightId, lastId])

  const detachedWindow = new MockBrowserWindow()
  const detachedManager = new TabManager(detachedWindow as never)
  const detachedFirstId = detachedManager.createTab('https://example.com/first')
  const detachedMiddleId = detachedManager.createTab('https://example.com/middle')
  const detachedRightId = detachedManager.createTab('https://example.com/right')
  const detachedLastId = detachedManager.createTab('https://example.com/last')

  detachedManager.switchTab(detachedMiddleId)
  const detached = detachedManager.detachTab(detachedMiddleId)

  assert.ok(detached)
  assert.strictEqual(detachedManager.getActiveTabId(), detachedRightId)
  assert.deepStrictEqual(
    detachedManager.getTabList().map((tab) => tab.id),
    [detachedFirstId, detachedRightId, detachedLastId],
  )
  detached.close()
})

test('closing the last tab resets it to a blank new tab and keeps it reopenable', () => {
  resetElectronMock()
  const window = new MockBrowserWindow()
  const manager = new TabManager(window as never)
  const originalId = manager.createTab('https://example.com/problem')

  manager.closeActiveTab()

  const resetTabs = manager.getTabList()
  assert.strictEqual(resetTabs.length, 1)
  assert.notStrictEqual(resetTabs[0].id, originalId)
  assert.strictEqual(resetTabs[0].url, '')
  assert.strictEqual(resetTabs[0].isActive, true)

  const reopenedId = manager.reopenClosedTab()
  assert.ok(reopenedId)
  assert.strictEqual(manager.getTabList().find((tab) => tab.id === reopenedId)?.url, 'https://example.com/problem')
})

test('tab capacity is 16 and both direct and popup creation report the limit', () => {
  resetElectronMock()
  const window = new MockBrowserWindow()
  const manager = new TabManager(window as never)
  const notices: number[] = []
  manager.setTabLimitReachedHandler((limit) => notices.push(limit))

  for (let index = 0; index < MAX_TABS; index += 1) {
    assert.ok(manager.createTab(`https://example.com/${index}`))
  }
  assert.strictEqual(MAX_TABS, 16)
  assert.strictEqual(manager.getTabList().length, 16)
  assert.strictEqual(manager.createTab('https://example.com/overflow'), '')

  const activeContents = window.contentView.children[0].webContents
  const popup = activeContents.simulateWindowOpen({
    url: 'https://example.com/popup',
    disposition: 'foreground-tab',
  })
  assert.strictEqual(popup.response.action, 'deny')
  assert.deepStrictEqual(notices, [16, 16])
  assert.strictEqual(manager.getTabList().length, 16)
})

test('tab list preserves insertion order and reports loading/favicon state', () => {
  resetElectronMock()
  const window = new MockBrowserWindow()
  const manager = new TabManager(window as never)
  const firstId = manager.createTab('https://example.com/first')
  const secondId = manager.createTab('https://example.com/second')
  const contents = window.contentView.children[0].webContents
  const snapshots: string[][] = []
  manager.setTabListChangedCallback((tabs) => snapshots.push(tabs.map((tab) => tab.id)))

  contents.emit('did-start-loading')
  contents.emit('did-start-loading')
  contents.emit('page-favicon-updated', {}, [
    'javascript:alert(1)',
    'https://example.com/favicon.ico',
  ])
  contents.emit('page-favicon-updated', {}, ['https://example.com/favicon.ico'])

  const loadingTabs = manager.getTabList()
  assert.deepStrictEqual(loadingTabs.map((tab) => tab.id), [firstId, secondId])
  assert.deepStrictEqual(loadingTabs.map((tab) => tab.kind), ['web', 'web'])
  assert.strictEqual(loadingTabs[1].isLoading, true)
  assert.strictEqual(loadingTabs[1].isCrashed, false)
  assert.strictEqual(loadingTabs[1].favicon, 'https://example.com/favicon.ico')
  assert.strictEqual(snapshots.length, 2)

  contents.emit('did-stop-loading')
  contents.emit('did-stop-loading')
  assert.strictEqual(manager.getTabList()[1].isLoading, false)
  assert.strictEqual(snapshots.length, 3)

  contents.emit('page-favicon-updated', {}, [
    `data:image/svg+xml;base64,${'x'.repeat(70_000)}`,
    'data:image/svg+xml;base64,PHN2Zy8+',
  ])
  assert.strictEqual(manager.getTabList()[1].favicon, null)
  assert.strictEqual(snapshots.length, 4)
})
