import assert from 'node:assert/strict'
import { test } from 'vitest'
import { MockBrowserWindow, menuPopups, resetElectronMock } from 'electron'
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

test('tab context menu enables move-to-window when a transfer handler is installed', () => {
  resetElectronMock()
  const window = new MockBrowserWindow()
  const manager = new TabManager(window as never)
  const firstId = manager.createTab('https://example.com/first')
  const middleId = manager.createTab('https://example.com/middle')
  manager.createTab('https://example.com/right')
  manager.createTab('https://example.com/last')
  manager.switchTab(middleId)
  const detachedIds: string[] = []
  manager.setTabDetachHandler((tabId) => { detachedIds.push(tabId) })

  manager.showTabContextMenu(middleId)
  const firstTemplate = menuPopups.at(-1)?.template as Electron.MenuItemConstructorOptions[]
  const detachItem = firstTemplate.find((item) => item.label === '移到新窗口')
  assert.strictEqual(detachItem?.enabled, true)
  detachItem?.click?.({} as never, {} as never, {} as never)
  assert.deepStrictEqual(detachedIds, [middleId])
  firstTemplate.find((item) => item.label === '关闭右侧标签页')?.click?.(
    {} as never,
    {} as never,
    {} as never,
  )
  assert.deepStrictEqual(manager.getTabList().map((tab) => tab.id), [firstId, middleId])

  manager.showTabContextMenu(middleId)
  const secondTemplate = menuPopups.at(-1)?.template as Electron.MenuItemConstructorOptions[]
  secondTemplate.find((item) => item.label === '关闭其他标签页')?.click?.(
    {} as never,
    {} as never,
    {} as never,
  )
  assert.deepStrictEqual(manager.getTabList().map((tab) => tab.id), [middleId])

  manager.showTabContextMenu(middleId)
  const finalTemplate = menuPopups.at(-1)?.template as Electron.MenuItemConstructorOptions[]
  assert.strictEqual(finalTemplate.find((item) => item.label === '关闭其他标签页')?.enabled, false)
  assert.strictEqual(finalTemplate.find((item) => item.label === '关闭右侧标签页')?.enabled, false)
  assert.strictEqual(finalTemplate.find((item) => item.label === '恢复关闭的标签页')?.enabled, true)
})

test('destroying an active middle tab selects its right neighbor', () => {
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

})

test('closing the last tab resets it to an internal home tab and keeps it reopenable', () => {
  resetElectronMock()
  const window = new MockBrowserWindow()
  const manager = new TabManager(window as never)
  const originalId = manager.createTab('https://example.com/problem')

  manager.closeActiveTab()

  const resetTabs = manager.getTabList()
  assert.strictEqual(resetTabs.length, 1)
  assert.notStrictEqual(resetTabs[0].id, originalId)
  assert.strictEqual(resetTabs[0].kind, 'internal')
  assert.strictEqual(resetTabs[0].url, 'algo://home')
  assert.deepStrictEqual(resetTabs[0].kind === 'internal' ? resetTabs[0].page : null, { type: 'home' })
  assert.strictEqual(resetTabs[0].isActive, true)

  const reopenedId = manager.reopenClosedTab()
  assert.ok(reopenedId)
  assert.strictEqual(manager.getTabList().find((tab) => tab.id === reopenedId)?.url, 'https://example.com/problem')
})

test('internal tabs close and reopen with their validated page payload', () => {
  resetElectronMock()
  const window = new MockBrowserWindow()
  const manager = new TabManager(window as never)
  const homeId = manager.createTab()
  const notesId = manager.openInternalTab({ type: 'notes', problemId: 'problem-1' })

  manager.closeTab(notesId)
  assert.strictEqual(manager.getActiveTabId(), homeId)

  const reopenedId = manager.reopenClosedTab()
  assert.deepStrictEqual(manager.getTabList().find((tab) => tab.id === reopenedId), {
    id: reopenedId,
    kind: 'internal',
    page: { type: 'notes', problemId: 'problem-1' },
    url: 'algo://problem-notes?problemId=problem-1',
    title: '本地笔记',
    favicon: null,
    isLoading: false,
    isCrashed: false,
    isUnresponsive: false,
    isUnresponsiveNoticeDismissed: false,
    isActive: true,
  })
})

test('navigating from an internal tab converts the same stable id into a web tab', async () => {
  resetElectronMock()
  const window = new MockBrowserWindow()
  const manager = new TabManager(window as never)
  const tabId = manager.createTab()

  manager.navigate('https://example.com/problem')
  await Promise.resolve()
  await Promise.resolve()

  const tab = manager.getTabList()[0]
  assert.strictEqual(tab.id, tabId)
  assert.strictEqual(tab.kind, 'web')
  assert.strictEqual(tab.url, 'https://example.com/problem')
  assert.strictEqual(window.contentView.children.length, 1)
})

test('omnibox focus detaches the active web view until the panel closes', () => {
  resetElectronMock()
  const window = new MockBrowserWindow()
  const manager = new TabManager(window as never)
  const firstId = manager.createTab('https://example.com/first')
  const firstView = window.contentView.children[0]
  const secondId = manager.createTab('https://example.com/second')
  const secondView = window.contentView.children[0]

  manager.setOmniboxOpen(true)
  assert.deepStrictEqual(window.contentView.children, [])
  assert.strictEqual(manager.isViewVisible(), false)

  manager.switchTab(firstId)
  assert.deepStrictEqual(window.contentView.children, [])
  manager.switchTab(secondId)
  assert.deepStrictEqual(window.contentView.children, [])

  manager.setOmniboxOpen(false)
  assert.deepStrictEqual(window.contentView.children, [secondView])
  assert.strictEqual(manager.isViewVisible(), true)

  manager.switchTab(firstId)
  assert.deepStrictEqual(window.contentView.children, [firstView])
})

test('omnibox internal navigation replaces the active tab in place and closes its web view', () => {
  resetElectronMock()
  const window = new MockBrowserWindow()
  const manager = new TabManager(window as never)
  const backgroundId = manager.createTab('https://example.com/background')
  const activeId = manager.createTab('https://example.com/active')
  const activeContents = window.contentView.children[0].webContents
  const urls: string[] = []
  let sessionChanges = 0
  manager.setUrlChangeCallback((url) => urls.push(url))
  manager.addSessionChangeListener(() => { sessionChanges += 1 })

  manager.navigateInternal({ type: 'settings' })

  assert.deepStrictEqual(manager.getTabList().map((tab) => tab.id), [backgroundId, activeId])
  assert.deepStrictEqual(manager.getTabList()[1], {
    id: activeId,
    kind: 'internal',
    page: { type: 'settings' },
    url: 'algo://settings',
    title: '设置',
    favicon: null,
    isLoading: false,
    isCrashed: false,
    isUnresponsive: false,
    isUnresponsiveNoticeDismissed: false,
    isActive: true,
  })
  assert.strictEqual(activeContents.isDestroyed(), true)
  assert.deepStrictEqual(window.contentView.children, [])
  assert.deepStrictEqual(urls, ['algo://settings'])
  assert.strictEqual(sessionChanges, 1)
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

test('reordering tabs preserves the active tab and mounted web view while persisting the new order', () => {
  resetElectronMock()
  const window = new MockBrowserWindow()
  const manager = new TabManager(window as never)
  const firstId = manager.createTab('https://example.com/first')
  const homeId = manager.openInternalTab({ type: 'home' })
  const activeId = manager.createTab('https://example.com/active')
  const activeView = window.contentView.children[0]
  let listChanges = 0
  let sessionChanges = 0
  manager.setTabListChangedCallback(() => { listChanges += 1 })
  manager.addSessionChangeListener(() => { sessionChanges += 1 })

  assert.strictEqual(manager.reorderTab(firstId, 2), true)
  assert.deepStrictEqual(manager.getTabList().map((tab) => tab.id), [homeId, activeId, firstId])
  assert.strictEqual(manager.getActiveTabId(), activeId)
  assert.deepStrictEqual(window.contentView.children, [activeView])
  assert.deepStrictEqual(manager.getSessionSnapshot().tabs.map((tab) => tab.id), [homeId, activeId, firstId])
  assert.strictEqual(listChanges, 1)
  assert.strictEqual(sessionChanges, 1)

  assert.strictEqual(manager.reorderTab(firstId, 2), false)
  assert.strictEqual(manager.reorderTab('missing', 0), false)
  assert.strictEqual(manager.reorderTab(firstId, Number.NaN), false)
  assert.strictEqual(listChanges, 1)
  assert.strictEqual(sessionChanges, 1)
})
