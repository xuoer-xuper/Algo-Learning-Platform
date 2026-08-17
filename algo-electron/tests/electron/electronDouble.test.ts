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

  const contents = view.webContents
  safeRemoveChildView(window, view)
  assert.strictEqual(window.contentView.children.length, 0)
  safeCloseWebContents(view)
  assert.strictEqual(contents.isDestroyed(), true)
  assert.strictEqual(app.commandLine.appendSwitch instanceof Function, true)
  window.close()
})
