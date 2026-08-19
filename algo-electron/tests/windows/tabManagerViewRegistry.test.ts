import assert from 'node:assert/strict'
import { test } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from 'electron'
import { TabManager } from '../../electron/browser/TabManager.ts'
import type { TabSessionSnapshot } from '../../electron/browser/tabManagerTypes.ts'
import { ViewRegistry } from '../../electron/windows/ViewRegistry.ts'

function createManager(): {
  manager: TabManager
  registry: ViewRegistry
} {
  resetElectronMock()
  const registry = new ViewRegistry()
  const manager = new TabManager(new MockBrowserWindow() as never, {
    windowId: 'window-1',
    viewRegistry: registry,
  })
  return { manager, registry }
}

test('tracks web ownership across web/internal replacements and close', async () => {
  const { manager, registry } = createManager()
  const tabId = manager.createTab('https://example.com/')
  await Promise.resolve()

  const initialEntry = registry.getByWindow('window-1')[0]
  assert.strictEqual(initialEntry?.kind, 'tab')
  assert.strictEqual(initialEntry?.tabId, tabId)

  manager.navigateInternal({ type: 'settings' })
  assert.deepStrictEqual(registry.getByWindow('window-1'), [])

  manager.navigate('https://leetcode.cn/problems/two-sum/')
  await Promise.resolve()
  const replacementEntry = registry.getByWindow('window-1')[0]
  assert.strictEqual(replacementEntry?.kind, 'tab')
  assert.strictEqual(replacementEntry?.tabId, tabId)

  manager.closeTab(tabId)
  assert.deepStrictEqual(registry.getByWindow('window-1'), [])
})

test('replaces crashed webContents ownership without leaving the destroyed id registered', async () => {
  const { manager, registry } = createManager()
  const tabId = manager.createTab('https://codeforces.com/problemset/problem/1/A')
  await Promise.resolve()
  const initialEntry = registry.getByWindow('window-1')[0]
  assert.ok(initialEntry && initialEntry.kind === 'tab')
  const initialWebContentsId = initialEntry.webContentsId

  initialEntry.view.webContents.emit('render-process-gone', {}, {
    reason: 'crashed',
    exitCode: 1,
  })
  initialEntry.view.webContents.close()

  const replacementEntry = registry.getByWindow('window-1')[0]
  assert.ok(replacementEntry && replacementEntry.kind === 'tab')
  assert.strictEqual(replacementEntry.tabId, tabId)
  assert.notStrictEqual(replacementEntry.webContentsId, initialWebContentsId)
  assert.strictEqual(registry.get(initialWebContentsId), null)
})

test('registers restored web tabs and removes every owner on manager destroy', () => {
  const { manager, registry } = createManager()
  const snapshot: TabSessionSnapshot = {
    version: 1,
    activeTabId: 'web-tab',
    tabs: [
      { id: 'web-tab', kind: 'web', url: 'https://example.com/', title: 'Example' },
      { id: 'settings-tab', kind: 'internal', page: { type: 'settings' }, title: '设置' },
    ],
  }

  assert.strictEqual(manager.restoreSession(snapshot), true)
  assert.deepStrictEqual(registry.getByWindow('window-1').map((entry) => entry.tabId), ['web-tab'])

  manager.destroy()
  assert.deepStrictEqual(registry.getByWindow('window-1'), [])
})
