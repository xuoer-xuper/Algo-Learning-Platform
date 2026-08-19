import assert from 'node:assert/strict'
import { beforeEach, test } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from 'electron'
import { TabManager } from '../../electron/browser/TabManager.ts'
import { ViewRegistry } from '../../electron/windows/ViewRegistry.ts'

beforeEach(() => resetElectronMock())

test('moves the same web view and stable tab id to the target event owner', async () => {
  const registry = new ViewRegistry()
  const sourceWindow = new MockBrowserWindow()
  const targetWindow = new MockBrowserWindow()
  const source = new TabManager(sourceWindow as never, { windowId: 'source', viewRegistry: registry })
  const target = new TabManager(targetWindow as never, { windowId: 'target', viewRegistry: registry })
  const remainingId = source.createTab('https://example.com/remaining')
  const movedId = source.createTab('https://example.com/moved')
  await Promise.resolve()
  const entry = registry.getByWindow('source').find((item) => item.tabId === movedId)
  assert.ok(entry?.kind === 'tab')
  const view = entry.view
  const sourceTitles: string[] = []
  const targetTitles: string[] = []
  source.addPageEventListener((event) => {
    if (event.reason === 'page-title-updated') sourceTitles.push(event.title ?? '')
  })
  target.addPageEventListener((event) => {
    if (event.reason === 'page-title-updated') targetTitles.push(event.title ?? '')
  })

  const released = source.releaseTab(movedId)
  assert.ok(released)
  assert.equal(source.getActiveTabId(), remainingId)
  assert.equal(target.adoptTab(released), true)

  assert.equal(released.state, 'adopted')
  assert.equal(target.getActiveTabId(), movedId)
  assert.deepEqual(targetWindow.contentView.children, [view])
  assert.equal(registry.get(view.webContents.id)?.windowId, 'target')
  view.webContents.setTitle('Moved title')
  assert.deepEqual(sourceTitles, [])
  assert.deepEqual(targetTitles, ['Moved title'])

  source.destroy()
  assert.equal(view.webContents.isDestroyed(), false)
  assert.deepEqual(targetWindow.contentView.children, [view])
  assert.equal(target.getActiveTabId(), movedId)
})

test('rolls the last internal tab back with its stable id and active state', () => {
  const manager = new TabManager(new MockBrowserWindow() as never, { windowId: 'source' })
  manager.openInternalTab({ type: 'settings' }, { id: 'stable-settings' })

  const released = manager.releaseTab('stable-settings')
  assert.ok(released)
  assert.deepEqual(manager.getTabList(), [])
  assert.equal(manager.getActiveTabId(), null)
  assert.equal(released.rollback(), true)
  assert.equal(released.state, 'rolled-back')
  assert.deepEqual(manager.getTabList().map((tab) => [tab.id, tab.kind, tab.isActive]), [
    ['stable-settings', 'internal', true],
  ])
  assert.equal(released.rollback(), false)
})

test('rejects a duplicate id and automatically restores the source tab', () => {
  const source = new TabManager(new MockBrowserWindow() as never, { windowId: 'source' })
  const target = new TabManager(new MockBrowserWindow() as never, { windowId: 'target' })
  source.openInternalTab({ type: 'settings' }, { id: 'shared-id' })
  target.openInternalTab({ type: 'home' }, { id: 'shared-id' })

  const released = source.releaseTab('shared-id')
  assert.ok(released)
  assert.equal(target.adoptTab(released), false)
  assert.equal(released.state, 'rolled-back')
  assert.equal(source.getActiveTabId(), 'shared-id')
})

test('restores registry ownership and source mounting after target attachment fails', async () => {
  const registry = new ViewRegistry()
  const sourceWindow = new MockBrowserWindow()
  const targetWindow = new MockBrowserWindow()
  const source = new TabManager(sourceWindow as never, { windowId: 'source', viewRegistry: registry })
  const target = new TabManager(targetWindow as never, { windowId: 'target', viewRegistry: registry })
  const tabId = source.createTab('https://example.com/rollback')
  await Promise.resolve()
  const entry = registry.getByWindow('source')[0]
  assert.ok(entry?.kind === 'tab')
  const view = entry.view
  targetWindow.contentView.addChildView = () => { throw new Error('injected failure') }

  const released = source.releaseTab(tabId)
  assert.ok(released)
  assert.equal(target.adoptTab(released), false)

  assert.equal(released.state, 'rolled-back')
  assert.equal(source.getActiveTabId(), tabId)
  assert.deepEqual(sourceWindow.contentView.children, [view])
  assert.deepEqual(target.getTabList(), [])
  assert.equal(registry.get(view.webContents.id)?.windowId, 'source')
})

test('invalidates an in-flight web transfer when its source manager is destroyed', async () => {
  const registry = new ViewRegistry()
  const source = new TabManager(new MockBrowserWindow() as never, {
    windowId: 'source',
    viewRegistry: registry,
  })
  const target = new TabManager(new MockBrowserWindow() as never, {
    windowId: 'target',
    viewRegistry: registry,
  })
  const tabId = source.createTab('https://example.com/closing')
  await Promise.resolve()
  const entry = registry.getByWindow('source')[0]
  assert.ok(entry?.kind === 'tab')
  const contents = entry.view.webContents

  const released = source.releaseTab(tabId)
  assert.ok(released)
  source.destroy()

  assert.equal(released.state, 'invalid')
  assert.equal(contents.isDestroyed(), true)
  assert.equal(registry.get(contents.id), null)
  assert.equal(target.adoptTab(released), false)
})
