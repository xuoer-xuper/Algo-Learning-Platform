import assert from 'node:assert/strict'
import { test } from 'vitest'
import { app, BrowserWindow, WebContentsView, commandLineSwitches, resetElectronMock } from 'electron'
import { configureChromiumCommandLine } from '../../electron/app/chromiumFlags.ts'
import { setTabViewBounds, safeCloseWebContents, safeRemoveChildView } from '../../electron/browser/tabViewLayout.ts'

test('Electron test double exposes observable command-line and view primitives', () => {
  resetElectronMock()
  configureChromiumCommandLine()
  assert.deepStrictEqual(commandLineSwitches, [
    ['disable-features', 'PostQuantumKyber,TLS13KeyExchangeMLKEM'],
    ['disable-blink-features', 'AutomationControlled'],
  ])

  const window = new BrowserWindow({ width: 1200, height: 700 })
  const view = new WebContentsView()
  window.contentView.addChildView(view)
  setTabViewBounds(view, { width: 1200, height: 700 }, 240)
  assert.deepStrictEqual(view.getBounds(), { x: 240, y: 78, width: 960, height: 622 })
  setTabViewBounds(view, { width: 1200, height: 700 }, 240, 38)
  assert.deepStrictEqual(view.getBounds(), { x: 240, y: 116, width: 960, height: 584 })

  const contents = view.webContents
  safeRemoveChildView(window, view)
  assert.strictEqual(window.contentView.children.length, 0)
  safeCloseWebContents(view)
  assert.strictEqual(contents.isDestroyed(), true)
  assert.strictEqual(app.commandLine.appendSwitch instanceof Function, true)
  window.close()
})

test('Electron test double models single-instance and window focus primitives', () => {
  resetElectronMock()
  app.singleInstanceLockGranted = false

  assert.strictEqual(app.requestSingleInstanceLock(), false)
  assert.strictEqual(app.requestSingleInstanceLockCallCount, 1)
  app.quit()
  assert.strictEqual(app.quitCallCount, 1)

  const window = new BrowserWindow()
  window.show()
  window.minimize()
  assert.strictEqual(window.isMinimized(), true)
  assert.strictEqual(window.isVisible(), false)

  window.restore()
  window.focus()
  assert.strictEqual(window.isMinimized(), false)
  assert.strictEqual(window.isVisible(), true)
  assert.strictEqual(window.isFocused(), true)
})
