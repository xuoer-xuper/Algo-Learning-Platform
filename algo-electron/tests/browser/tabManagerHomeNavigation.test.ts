import assert from 'node:assert/strict'
import { test } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from '../electron/electronMock'
import { TabManager } from '../../electron/browser/TabManager.ts'

test('goHome navigates the active web tab in place instead of opening a new tab', () => {
  resetElectronMock()
  const window = new MockBrowserWindow({ width: 1200, height: 800 })
  const manager = new TabManager(window as never)
  manager.createTab('https://codeforces.com/problemset')

  const before = manager.getTabList()
  assert.strictEqual(before.length, 1)

  manager.goHome()

  const after = manager.getTabList()
  assert.strictEqual(after.length, 1, 'home button must not open a new tab')
  assert.strictEqual(after[0].id, before[0].id, 'current tab should be reused')
  assert.strictEqual(after[0].kind, 'internal')
  assert.strictEqual(after[0].url, 'algo://home')
  assert.strictEqual(after[0].isActive, true)
})

test('goHome converts an internal tab to home in place and is idempotent on home', () => {
  resetElectronMock()
  const window = new MockBrowserWindow({ width: 1200, height: 800 })
  const manager = new TabManager(window as never)
  manager.createTab() // 无 URL → 打开内部首页标签

  const homeFirst = manager.getTabList()
  assert.strictEqual(homeFirst[0].url, 'algo://home')

  manager.goHome()
  const homeSecond = manager.getTabList()
  assert.strictEqual(homeSecond.length, 1)
  assert.strictEqual(homeSecond[0].id, homeFirst[0].id, 'already-home should stay the same tab')
})
