import assert from 'node:assert/strict'
import { test } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from '../electron/electronMock'
import { TabManager } from '../../electron/browser/TabManager.ts'

const SNAPSHOT = {
  version: 1 as const,
  activeTabId: 't-home',
  tabs: [
    { id: 't-home', kind: 'internal' as const, page: { type: 'home' as const }, title: '首页' },
    {
      id: 't-web',
      kind: 'web' as const,
      url: 'https://leetcode.cn/problemset/',
      title: 'LeetCode',
    },
  ],
}

test('restoreSession with replaceExisting swaps tabs in place', () => {
  resetElectronMock()
  const window = new MockBrowserWindow({ width: 1200, height: 800 })
  const manager = new TabManager(window as never)
  manager.createTab('https://codeforces.com/problemset')
  assert.strictEqual(manager.getTabList().length, 1)

  const replaced = manager.restoreSession(SNAPSHOT, { replaceExisting: true })

  assert.strictEqual(replaced, true)
  const tabs = manager.getTabList()
  assert.strictEqual(tabs.length, 2)
  assert.strictEqual(tabs[0].id, 't-home')
  assert.strictEqual(tabs.find((tab) => tab.isActive)?.id, 't-home')
})

test('restoreSession without replaceExisting still rejects non-empty tabs', () => {
  resetElectronMock()
  const window = new MockBrowserWindow({ width: 1200, height: 800 })
  const manager = new TabManager(window as never)
  manager.createTab('https://codeforces.com/problemset')

  assert.strictEqual(manager.restoreSession(SNAPSHOT), false)
  assert.strictEqual(manager.getTabList().length, 1)
})
