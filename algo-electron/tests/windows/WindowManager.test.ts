import assert from 'node:assert/strict'
import { test } from 'vitest'
import { MockBrowserWindow, MockWebContentsView, resetElectronMock } from 'electron'
import { AppWindow } from '../../electron/windows/AppWindow.ts'
import { ViewRegistry } from '../../electron/windows/ViewRegistry.ts'
import { WindowManager } from '../../electron/windows/WindowManager.ts'

function createAppWindow(id: string): { appWindow: AppWindow; browserWindow: MockBrowserWindow } {
  const browserWindow = new MockBrowserWindow()
  return {
    appWindow: new AppWindow({ id, browserWindow: browserWindow as never, tabManager: {} as never }),
    browserWindow,
  }
}

test('registers windows and resolves shell and tab webContents ownership', () => {
  resetElectronMock()
  const viewRegistry = new ViewRegistry()
  const manager = new WindowManager({ viewRegistry })
  const { appWindow, browserWindow } = createAppWindow('window-1')
  const tabView = new MockWebContentsView()

  manager.register(appWindow)
  viewRegistry.registerTab(appWindow.id, 'tab-1', tabView as never)

  assert.strictEqual(manager.get('window-1'), appWindow)
  assert.deepStrictEqual(manager.getAll(), [appWindow])
  assert.strictEqual(manager.resolveWebContents(browserWindow.webContents), appWindow)
  assert.strictEqual(manager.resolveWebContents(tabView.webContents.id), appWindow)
  assert.strictEqual(manager.resolveWebContents(999_999), null)
})

test('falls back only for a missing download source in a single live window', () => {
  resetElectronMock()
  const manager = new WindowManager({ viewRegistry: new ViewRegistry() })
  const first = createAppWindow('window-1')
  const unknownSource = new MockWebContentsView()
  manager.register(first.appWindow)

  assert.strictEqual(manager.resolveDownloadSource(null), first.appWindow)
  assert.strictEqual(manager.resolveDownloadSource(unknownSource.webContents), null)

  const second = createAppWindow('window-2')
  manager.register(second.appWindow)
  assert.strictEqual(manager.resolveDownloadSource(undefined), null)
})

test('rejects duplicate window ids without replacing the registered window', () => {
  resetElectronMock()
  const manager = new WindowManager({ viewRegistry: new ViewRegistry() })
  const first = createAppWindow('window-1')
  const duplicate = createAppWindow('window-1')

  manager.register(first.appWindow)

  assert.throws(() => manager.register(duplicate.appWindow), /already registered/)
  assert.strictEqual(manager.get('window-1'), first.appWindow)
  assert.deepStrictEqual(manager.getAll(), [first.appWindow])
})

test('tracks the last registered window and updates recency when a window focuses', () => {
  resetElectronMock()
  const manager = new WindowManager({ viewRegistry: new ViewRegistry() })
  const first = createAppWindow('window-1')
  const second = createAppWindow('window-2')

  manager.register(first.appWindow)
  manager.register(second.appWindow)
  assert.strictEqual(manager.getMostRecent(), second.appWindow)

  first.browserWindow.focus()
  assert.strictEqual(manager.getMostRecent(), first.appWindow)
})

test('explicit unregister removes only that window and its view ownership', () => {
  resetElectronMock()
  const viewRegistry = new ViewRegistry()
  const manager = new WindowManager({ viewRegistry })
  const first = createAppWindow('window-1')
  const second = createAppWindow('window-2')
  const firstTab = new MockWebContentsView()
  const secondTab = new MockWebContentsView()

  manager.register(first.appWindow)
  manager.register(second.appWindow)
  viewRegistry.registerTab(first.appWindow.id, 'tab-1', firstTab as never)
  viewRegistry.registerTab(second.appWindow.id, 'tab-2', secondTab as never)

  assert.strictEqual(manager.unregister(first.appWindow.id), first.appWindow)
  assert.strictEqual(manager.get(first.appWindow.id), null)
  assert.strictEqual(viewRegistry.get(first.browserWindow.webContents), null)
  assert.strictEqual(viewRegistry.get(firstTab.webContents), null)
  assert.strictEqual(manager.get(second.appWindow.id), second.appWindow)
  assert.ok(viewRegistry.get(second.browserWindow.webContents))
  assert.ok(viewRegistry.get(secondTab.webContents))
})

test('BrowserWindow closed cleanup unregisters the window and preserves other ownership', () => {
  resetElectronMock()
  const viewRegistry = new ViewRegistry()
  const manager = new WindowManager({ viewRegistry })
  const first = createAppWindow('window-1')
  const second = createAppWindow('window-2')
  const firstTab = new MockWebContentsView()
  const secondTab = new MockWebContentsView()

  manager.register(first.appWindow)
  manager.register(second.appWindow)
  viewRegistry.registerTab(first.appWindow.id, 'tab-1', firstTab as never)
  viewRegistry.registerTab(second.appWindow.id, 'tab-2', secondTab as never)

  first.browserWindow.close()

  assert.strictEqual(manager.get(first.appWindow.id), null)
  assert.strictEqual(viewRegistry.getByWindow(first.appWindow.id).length, 0)
  assert.strictEqual(manager.get(second.appWindow.id), second.appWindow)
  assert.strictEqual(viewRegistry.getByWindow(second.appWindow.id).length, 2)
  assert.strictEqual(manager.getMostRecent(), second.appWindow)
})
