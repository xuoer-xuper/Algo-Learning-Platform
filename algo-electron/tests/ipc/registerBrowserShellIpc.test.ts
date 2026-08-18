import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  ipcMain,
  menuPopups,
  MockBrowserWindow,
  MockWebContents,
  resetElectronMock,
} from 'electron'
import { registerBrowserShellIpc } from '../../electron/ipc/registerBrowserShellIpc.ts'
import {
  registerShellWebContents,
  resetTrustedSenderRegistry,
} from '../../electron/ipc/trustedSender.ts'
import type { InternalPage } from '../../electron/browser/tabManagerTypes.ts'

test('browser shell IPC resolves omnibox input and validates transient UI commands', async () => {
  resetElectronMock()
  resetTrustedSenderRegistry()
  const shell = new MockWebContents()
  await shell.loadURL('app://shell/index.html')
  registerShellWebContents(shell)
  const event = { sender: shell, senderFrame: shell.mainFrame } as never

  const window = new MockBrowserWindow()
  const sentMessages: unknown[][] = []
  Object.assign(window.webContents, {
    send: (...args: unknown[]) => { sentMessages.push(args) },
  })
  const webNavigations: string[] = []
  const internalNavigations: InternalPage[] = []
  const openedPages: InternalPage[] = []
  const omniboxStates: boolean[] = []
  const tabManager = {
    navigate: (url: string) => { webNavigations.push(url) },
    navigateInternal: (page: InternalPage) => { internalNavigations.push(page) },
    setOmniboxOpen: (open: boolean) => { omniboxStates.push(open) },
    openInternalTab: (page: InternalPage) => { openedPages.push(page); return 'tab-1' },
  }

  registerBrowserShellIpc({
    getWindow: () => window as never,
    getTabManager: () => tabManager as never,
  })

  ipcMain.emit('browser:navigate', event, 'algo://settings')
  ipcMain.emit('browser:navigate', event, 'two sum')
  ipcMain.emit('browser:navigate', event, 'javascript:alert(1)')
  ipcMain.emit('browser:setOmniboxOpen', event, true)
  ipcMain.emit('browser:setOmniboxOpen', event, 'true')
  ipcMain.emit('browser:showAppMenu', event, { x: 640, y: 78 })
  ipcMain.emit('browser:showAppMenu', event, { x: -1, y: 78 })

  assert.deepStrictEqual(internalNavigations, [{ type: 'settings' }])
  assert.deepStrictEqual(webNavigations, ['https://www.bing.com/search?q=two%20sum'])
  assert.deepStrictEqual(sentMessages, [[
    'ui:command',
    { type: 'navigation-blocked', reason: 'unsupported-protocol' },
  ]])
  assert.deepStrictEqual(omniboxStates, [true])
  assert.strictEqual(menuPopups.length, 1)

  const menuTemplate = menuPopups[0].template as Array<{ click?: (...args: never[]) => void }>
  menuTemplate[0].click?.()
  assert.deepStrictEqual(openedPages, [{ type: 'dashboard' }])
})
