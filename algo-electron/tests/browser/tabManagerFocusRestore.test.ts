import assert from 'node:assert/strict'
import { test } from 'vitest'
import { MockBrowserWindow, MockWebContents, MockWebContentsView, resetElectronMock } from '../electron/electronMock'
import { TabManager } from '../../electron/browser/TabManager.ts'

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve()
}

test('window refocus returns focus to the web tab that had it', async () => {
  resetElectronMock()
  const window = new MockBrowserWindow({ width: 1200, height: 800 })
  const manager = new TabManager(window as never)
  manager.createTab('https://www.luogu.com.cn/problem/P1001')

  const view = window.contentView.children[0] as MockWebContentsView
  const contents = view.webContents as MockWebContents

  contents.emit('focus') // 用户正在页面输入框打字
  window.emit('blur') // 切到别的窗口（看题/写代码）
  window.emit('focus') // 切回来
  await flushMicrotasks()

  assert.strictEqual(contents.focusCalls, 1, 'active web tab should regain focus without a click')
})

test('window refocus does not steal focus from the shell ui', async () => {
  resetElectronMock()
  const window = new MockBrowserWindow({ width: 1200, height: 800 })
  const manager = new TabManager(window as never)
  manager.createTab('https://www.luogu.com.cn/problem/P1001')

  const view = window.contentView.children[0] as MockWebContentsView
  const contents = view.webContents as MockWebContents

  window.webContents.emit('focus') // 壳层（地址栏等）持有焦点
  window.emit('blur')
  window.emit('focus')
  await flushMicrotasks()

  assert.strictEqual(contents.focusCalls, 0, 'shell-owned focus must restore naturally, not be stolen')
})

test('no restore when the blurred tab is no longer active or the omnibox is open', async () => {
  resetElectronMock()
  const window = new MockBrowserWindow({ width: 1200, height: 800 })
  const manager = new TabManager(window as never)
  manager.createTab('https://www.luogu.com.cn/problem/P1001')
  const firstView = window.contentView.children[0] as MockWebContentsView
  const firstContents = firstView.webContents as MockWebContents

  firstContents.emit('focus')
  window.emit('blur')
  manager.createTab('https://codeforces.com/problemset') // 活动标签换人
  window.emit('focus')
  await flushMicrotasks()
  assert.strictEqual(firstContents.focusCalls, 0)

  const secondView = window.contentView.children[0] as MockWebContentsView
  const secondContents = secondView.webContents as MockWebContents
  secondContents.emit('focus')
  window.emit('blur')
  manager.setOmniboxOpen(true) // 地址栏打开期间不归还
  window.emit('focus')
  await flushMicrotasks()
  assert.strictEqual(secondContents.focusCalls, 0)
})
