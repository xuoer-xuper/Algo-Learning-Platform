import assert from 'node:assert/strict'
import { test } from 'vitest'
import { MockWebContents, MockWebContentsView } from '../electron/electronMock'
import { ViewRegistry } from '../../electron/windows/ViewRegistry.ts'

test('registers and looks up shell and tab ownership', () => {
  const registry = new ViewRegistry()
  const shellContents = new MockWebContents()
  const tabView = new MockWebContentsView()

  const shellEntry = registry.registerShell('window-1', shellContents)
  const tabEntry = registry.registerTab('window-1', 'tab-1', tabView as never)

  assert.deepStrictEqual(shellEntry, {
    kind: 'shell',
    webContentsId: shellContents.id,
    windowId: 'window-1',
    tabId: null,
    view: null,
  })
  assert.deepStrictEqual(tabEntry, {
    kind: 'tab',
    webContentsId: tabView.webContents.id,
    windowId: 'window-1',
    tabId: 'tab-1',
    view: tabView,
  })
  assert.strictEqual(registry.get(shellContents), shellEntry)
  assert.strictEqual(registry.get(tabView.webContents.id), tabEntry)
  assert.deepStrictEqual(registry.getByWindow('window-1'), [shellEntry, tabEntry])
})

test('allows the same owner to register again and refreshes the stored entry', () => {
  const registry = new ViewRegistry()
  const shellContents = new MockWebContents()
  const tabContents = new MockWebContents()
  const firstView = new MockWebContentsView({ webContents: tabContents })
  const replacementView = new MockWebContentsView({ webContents: tabContents })

  registry.registerShell('window-1', shellContents)
  const shellEntry = registry.registerShell('window-1', shellContents)
  registry.registerTab('window-1', 'tab-1', firstView as never)
  const tabEntry = registry.registerTab('window-1', 'tab-1', replacementView as never)

  assert.strictEqual(registry.get(shellContents), shellEntry)
  assert.strictEqual(registry.get(tabContents), tabEntry)
  assert.strictEqual(tabEntry.view, replacementView)
  assert.strictEqual(registry.getByWindow('window-1').length, 2)
})

test('rejects conflicting ownership for an existing webContents id', () => {
  const registry = new ViewRegistry()
  const contents = new MockWebContents()
  const view = new MockWebContentsView({ webContents: contents })

  registry.registerTab('window-1', 'tab-1', view as never)

  assert.throws(
    () => registry.registerTab('window-2', 'tab-1', view as never),
    /already has an owner/,
  )
  assert.throws(
    () => registry.registerTab('window-1', 'tab-2', view as never),
    /already has an owner/,
  )
  assert.throws(
    () => registry.registerShell('window-1', contents),
    /already has an owner/,
  )
})

test('preserves an entry when unregister receives a mismatched expected window id', () => {
  const registry = new ViewRegistry()
  const contents = new MockWebContents()
  const entry = registry.registerShell('window-1', contents)

  assert.strictEqual(registry.unregister(contents, 'window-2'), false)
  assert.strictEqual(registry.get(contents), entry)
  assert.strictEqual(registry.unregister(contents, 'window-1'), true)
  assert.strictEqual(registry.get(contents), null)
})

test('transfers tab ownership while preserving its view', () => {
  const registry = new ViewRegistry()
  const view = new MockWebContentsView()

  registry.registerTab('window-1', 'tab-1', view as never)

  assert.strictEqual(registry.transferTab(view.webContents.id, 'window-2', 'tab-2'), true)
  assert.deepStrictEqual(registry.get(view.webContents), {
    kind: 'tab',
    webContentsId: view.webContents.id,
    windowId: 'window-2',
    tabId: 'tab-2',
    view,
  })
})

test('locks a tab owner across source window unregister and supports rollback', () => {
  const registry = new ViewRegistry()
  const view = new MockWebContentsView()
  registry.registerTab('window-1', 'tab-1', view as never)

  const transfer = registry.beginTabTransfer(view.webContents.id, 'window-1', 'tab-1')
  assert.ok(transfer)
  assert.strictEqual(registry.beginTabTransfer(view.webContents.id, 'window-1', 'tab-1'), null)
  assert.strictEqual(registry.unregisterWindow('window-1'), 0)
  assert.strictEqual(registry.moveTabTransfer(transfer, 'window-2'), true)
  assert.strictEqual(registry.rollbackTabTransfer(transfer), true)
  assert.strictEqual(registry.get(view.webContents.id)?.windowId, 'window-1')
})

test('unregisterWindow removes only entries owned by that window', () => {
  const registry = new ViewRegistry()
  const firstShell = new MockWebContents()
  const firstTab = new MockWebContentsView()
  const secondShell = new MockWebContents()
  const secondTab = new MockWebContentsView()

  registry.registerShell('window-1', firstShell)
  registry.registerTab('window-1', 'tab-1', firstTab as never)
  const secondShellEntry = registry.registerShell('window-2', secondShell)
  const secondTabEntry = registry.registerTab('window-2', 'tab-2', secondTab as never)

  assert.strictEqual(registry.unregisterWindow('window-1'), 2)
  assert.strictEqual(registry.get(firstShell), null)
  assert.strictEqual(registry.get(firstTab.webContents), null)
  assert.deepStrictEqual(registry.getByWindow('window-2'), [secondShellEntry, secondTabEntry])
})
