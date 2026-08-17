import assert from 'node:assert/strict'
import { test } from 'vitest'
import { MockBrowserWindow, MockWebContents, resetElectronMock } from 'electron'
import { TabManager } from '../../electron/browser/TabManager.ts'

function popupDetails(url: string, disposition = 'foreground-tab') {
  return {
    url,
    frameName: 'oauth-popup',
    features: '',
    disposition,
    referrer: { url: 'https://codeforces.com/', policy: 'strict-origin-when-cross-origin' },
    postBody: {
      contentType: 'application/x-www-form-urlencoded',
      data: [{ bytes: Buffer.from('token=opaque') }],
    },
  }
}

test('window.open adopts Chromium-created contents as managed tabs', () => {
  resetElectronMock()
  const window = new MockBrowserWindow({ width: 1200, height: 800 })
  const manager = new TabManager(window as never)
  manager.createTab('https://codeforces.com/problemset')

  const parent = window.contentView.children[0].webContents as MockWebContents
  const popup = parent.simulateWindowOpen(popupDetails('https://codeforces.com/oauth/authorize'))

  assert.strictEqual(popup.response.action, 'allow')
  assert.strictEqual(typeof popup.response.createWindow, 'function')
  assert.ok(popup.webContents)
  assert.notStrictEqual(popup.webContents, parent)
  assert.strictEqual(manager.getTabList().length, 2)
  assert.strictEqual(manager.getTabList().find((tab) => tab.isActive)?.url, 'https://codeforces.com/oauth/authorize')

  popup.webContents?.close()
  assert.strictEqual(manager.getTabList().length, 1)
  assert.strictEqual(manager.getTabList()[0].isActive, true)
})

test('window.open preserves about:blank, background tabs, and rejects unsafe protocols', () => {
  resetElectronMock()
  const window = new MockBrowserWindow({ width: 1200, height: 800 })
  const manager = new TabManager(window as never)
  const blockedReasons: string[] = []
  manager.setNavigationBlockedHandler((reason) => blockedReasons.push(reason))
  manager.createTab('https://leetcode.cn/problems/two-sum/')

  const parent = window.contentView.children[0].webContents as MockWebContents
  const background = parent.simulateWindowOpen(popupDetails('https://leetcode.cn/accounts/login/', 'background-tab'))
  assert.strictEqual(background.response.action, 'allow')
  assert.strictEqual(manager.getTabList().length, 2)
  assert.strictEqual(manager.getTabList()[0].isActive, true)

  const blank = parent.simulateWindowOpen(popupDetails('about:blank'))
  assert.strictEqual(blank.response.action, 'allow')
  assert.strictEqual(manager.getTabList().find((tab) => tab.isActive)?.url, 'about:blank')

  const unsafe = parent.simulateWindowOpen(popupDetails('mailto:test@example.com'))
  assert.strictEqual(unsafe.response.action, 'deny')
  assert.deepStrictEqual(blockedReasons, ['unsupported-protocol'])
})

test('direct navigation is HTTPS-only outside local development', () => {
  resetElectronMock()
  const window = new MockBrowserWindow()
  const manager = new TabManager(window as never)
  const blockedReasons: string[] = []
  manager.setNavigationBlockedHandler((reason) => blockedReasons.push(reason))
  manager.createTab('https://ac.nowcoder.com/')
  manager.navigate('http://ac.nowcoder.com/')
  assert.deepStrictEqual(blockedReasons, ['insecure-http'])
  assert.strictEqual(manager.getUrl(), 'https://ac.nowcoder.com/')

  const devWindow = new MockBrowserWindow()
  const devManager = new TabManager(devWindow as never, { allowInsecureLocalhost: true })
  devManager.createTab('http://localhost:5173/test')
  assert.strictEqual(devManager.getUrl(), 'http://localhost:5173/test')
})
