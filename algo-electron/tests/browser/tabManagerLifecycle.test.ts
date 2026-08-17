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
  assert.strictEqual(manager.getTabList().length, 2)
  assert.strictEqual(manager.getTabList()[0].id, firstId)

  const reopenedId = manager.reopenClosedTab()
  const reopened = manager.getTabList().find((tab) => tab.id === reopenedId)
  assert.ok(reopened)
  assert.strictEqual(reopened.url, 'https://example.com/middle')
  assert.strictEqual(reopened.title, 'Middle title')
  assert.strictEqual(reopened.isActive, true)
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
