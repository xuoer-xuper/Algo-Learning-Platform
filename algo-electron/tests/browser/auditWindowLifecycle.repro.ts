import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, it } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from '../electron/electronMock'
import { TabManager } from '../../electron/browser/TabManager'
import { AppWindow } from '../../electron/windows/AppWindow'
import { ViewRegistry } from '../../electron/windows/ViewRegistry'
import { WindowManager } from '../../electron/windows/WindowManager'
import { TabTransferCoordinator } from '../../electron/windows/TabTransferCoordinator'
import { ApplicationSessionStore } from '../../electron/windows/applicationSessionStore'
import { createApplicationSessionSnapshot } from '../../electron/windows/applicationSessionSnapshot'
import { resetTrustedSenderRegistry } from '../../electron/ipc/trustedSender'

const output = path.resolve('tmp/audit-windows-20260911')
const live: AppWindow[] = []
const results: Record<string, unknown> = {}
let registry: ViewRegistry
let manager: WindowManager
let limitNotices: number[]

beforeEach(() => {
  resetElectronMock()
  resetTrustedSenderRegistry()
  registry = new ViewRegistry()
  manager = new WindowManager({ viewRegistry: registry })
  limitNotices = []
})

afterEach(async () => {
  for (const appWindow of live.splice(0)) {
    appWindow.tabManager.destroy()
    manager.unregister(appWindow.id)
    if (!appWindow.isDestroyed()) appWindow.browserWindow.close()
  }
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
})

function appWindow(id: string): AppWindow {
  const browserWindow = new MockBrowserWindow()
  const tabManager = new TabManager(browserWindow as never, { windowId: id, viewRegistry: registry })
  tabManager.setTabLimitReachedHandler(limit => { limitNotices.push(limit) })
  const result = new AppWindow({ id, browserWindow: browserWindow as never, tabManager })
  manager.register(result)
  live.push(result)
  return result
}

function snapshot() {
  return createApplicationSessionSnapshot(manager.getAll().map(window => {
    const tabs = window.tabManager.getSessionSnapshot()
    return {
      id: window.id, bounds: window.browserWindow.getNormalBounds(), maximized: false,
      activeTabId: tabs.activeTabId, tabs: tabs.tabs,
    }
  }), manager.getMostRecent()?.id ?? null)
}

async function roundTrip(name: string) {
  await fs.mkdir(output, { recursive: true })
  const directory = await fs.mkdtemp(path.join(output, `${name}-`))
  const store = new ApplicationSessionStore(path.join(directory, 'session.json'))
  const current = snapshot()
  await store.save(current)
  const loaded = await store.load()
  assert.equal(loaded.kind, 'restore')
  if (loaded.kind !== 'restore') throw new Error('Unexpected session fallback')
  return loaded.snapshot
}

it('records loss of the ninth full window after a successful session round trip', async () => {
  for (let windowIndex = 0; windowIndex < 9; windowIndex++) {
    const window = appWindow(`full-${windowIndex}`)
    for (let tabIndex = 0; tabIndex < 16; tabIndex++) {
      assert.ok(window.tabManager.openInternalTab({ type: 'home' }, { id: `full-${windowIndex}-${tabIndex}` }))
    }
  }
  assert.equal(manager.getAll().reduce((count, window) => count + window.tabManager.getTabList().length, 0), 144)
  assert.equal(manager.getMostRecent()?.id, 'full-8')
  assert.deepEqual(limitNotices, [])
  const loaded = await roundTrip('nine-full-windows')
  assert.equal(loaded.windows.length, 8)
  assert.equal(loaded.windows.flatMap(window => window.tabs).length, 128)
  assert.equal(loaded.windows.some(window => window.id === 'full-8'), false)
  assert.equal(loaded.mostRecentWindowId, 'full-0')
  results.globalTabCap = {
    runtimeWindows: 9, runtimeTabs: 144, runtimeLimitNotices: limitNotices,
    restoredWindows: loaded.windows.length, restoredTabs: loaded.windows.flatMap(window => window.tabs).length,
    actualMostRecent: 'full-8', persistedMostRecent: loaded.mostRecentWindowId,
  }
})

it('records loss of the seventeenth single-tab window after successful persistence', async () => {
  for (let index = 0; index < 17; index++) {
    const window = appWindow(`single-${index}`)
    assert.ok(window.tabManager.openInternalTab({ type: 'settings' }, { id: `single-tab-${index}` }))
  }
  assert.equal(manager.getAll().length, 17)
  assert.deepEqual(limitNotices, [])
  const loaded = await roundTrip('seventeen-windows')
  assert.equal(loaded.windows.length, 16)
  assert.equal(loaded.windows.some(window => window.id === 'single-16'), false)
  results.globalWindowCap = {
    runtimeWindows: 17, runtimeTabs: 17, restoredWindows: loaded.windows.length,
    runtimeLimitNotices: limitNotices, droppedMostRecent: 'single-16',
  }
})

it('preserves ordered tabs and recency while inside supported save limits', async () => {
  const expected = []
  for (let index = 0; index < 4; index++) {
    const window = appWindow(`ordinary-${index}`)
    for (let tab = 0; tab < 8; tab++) {
      const id = window.tabManager.openInternalTab({ type: 'home' }, { id: `ordinary-${index}-${tab}` })
      expected.push(id)
    }
  }
  manager.markRecent('ordinary-2')
  const loaded = await roundTrip('ordinary')
  assert.deepEqual(loaded.windows.flatMap(window => window.tabs.map(tab => tab.id)), expected)
  assert.equal(loaded.mostRecentWindowId, 'ordinary-2')
  results.ordinaryRoundTrip = { windows: 4, tabs: 32, sameOrder: true, sameRecency: true }
})

it('releases tab views and registry entries through 100 normal open-close cycles', async () => {
  const owner = appWindow('cycles')
  owner.tabManager.openInternalTab({ type: 'home' }, { id: 'cycle-home' })
  let destroyedEvents = 0
  const unsubscribe = owner.tabManager.addPageEventListener(event => {
    if (event.reason === 'destroyed') destroyedEvents++
  })
  for (let index = 0; index < 100; index++) {
    const id = owner.tabManager.createTab(`https://example.invalid/ordinary/${index}`)
    await Promise.resolve()
    const entry = registry.getByWindow(owner.id).find(item => item.tabId === id)
    assert.ok(entry?.kind === 'tab')
    const contents = entry.view.webContents
    owner.tabManager.closeTab(id)
    assert.equal(contents.isDestroyed(), true)
    assert.equal(registry.get(contents.id), null)
  }
  assert.equal(destroyedEvents, 100)
  assert.deepEqual(owner.tabManager.getTabList().map(tab => tab.id), ['cycle-home'])
  assert.equal(registry.getByWindow(owner.id).filter(entry => entry.kind === 'tab').length, 0)
  unsubscribe()
  results.normalLifecycle = { cycles: 100, destroyedEvents, remainingTabs: 1, retainedTabRegistryEntries: 0,
    limit: 'Mock resource ownership only; no RSS, GPU or real Chromium process measurement.' }
})

it('rolls back a transfer when the existing destination has reached its per-window limit', async () => {
  const source = appWindow('transfer-source')
  const target = appWindow('transfer-target')
  source.tabManager.openInternalTab({ type: 'home' }, { id: 'source-home' })
  const id = source.tabManager.createTab('https://example.invalid/transfer')
  await Promise.resolve()
  const viewEntry = registry.getByWindow(source.id).find(entry => entry.tabId === id)
  assert.ok(viewEntry?.kind === 'tab')
  const contents = viewEntry.view.webContents
  for (let index = 0; index < 16; index++) target.tabManager.openInternalTab({ type: 'home' }, { id: `target-${index}` })
  const released = source.tabManager.releaseTab(id)
  assert.ok(released)
  assert.equal(target.tabManager.adoptTab(released), false)
  assert.equal(released.state, 'rolled-back')
  assert.equal(source.tabManager.getActiveTabId(), id)
  assert.equal(registry.get(contents.id)?.windowId, source.id)
  assert.equal(contents.isDestroyed(), false)
  assert.deepEqual(limitNotices, [16])
  results.transferIntoFullWindow = { denied: true, sourceRestored: true, activeIdRestored: true, viewPreserved: true }
})

it('cleans up a newly-created destination when the source closes during window creation', async () => {
  const source = appWindow('closing-source')
  const target = appWindow('new-target')
  const id = source.tabManager.openInternalTab({ type: 'settings' }, { id: 'moving-tab' })
  let resolveTarget: (target: AppWindow) => void = () => {}
  const pending = new Promise<AppWindow>(resolve => { resolveTarget = resolve })
  const coordinator = new TabTransferCoordinator({ createWindow: () => pending, getWindows: () => manager.getAll() })
  const move = coordinator.moveToNewWindow(source, id)
  await Promise.resolve()
  source.tabManager.destroy()
  source.browserWindow.close()
  resolveTarget(target)
  assert.equal(await move, false)
  assert.equal(target.isDestroyed(), true)
  results.sourceClosesDuringTransfer = { moveSucceeded: false, emptyTargetClosed: true }
})
