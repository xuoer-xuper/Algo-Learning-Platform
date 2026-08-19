import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  clipboard,
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
import { AppWindow } from '../../electron/windows/AppWindow.ts'

test('browser shell IPC resolves omnibox input and validates transient UI commands', async () => {
  resetElectronMock()
  resetTrustedSenderRegistry()
  const shell = new MockWebContents()
  await shell.loadURL('app://shell/index.html')
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
    getActiveZoomState: () => null,
  }
  registerShellWebContents(shell, new AppWindow({
    id: 'window-1',
    browserWindow: window as never,
    tabManager: tabManager as never,
  }))

  registerBrowserShellIpc({})

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

test('browser context-menu IPC validates senders and supports omnibox paste-and-go', async () => {
  resetElectronMock()
  resetTrustedSenderRegistry()
  const shell = new MockWebContents()
  await shell.loadURL('app://shell/index.html')
  const event = { sender: shell, senderFrame: shell.mainFrame } as never
  const untrusted = new MockWebContents()
  await untrusted.loadURL('https://example.com/')
  const untrustedEvent = { sender: untrusted, senderFrame: untrusted.mainFrame } as never
  const window = new MockBrowserWindow()
  const webNavigations: string[] = []
  const tabMenuIds: string[] = []
  const tabManager = {
    canGoBack: () => false,
    goBack: () => undefined,
    reload: () => undefined,
    navigate: (url: string) => { webNavigations.push(url) },
    navigateInternal: () => undefined,
    showTabContextMenu: (tabId: string) => { tabMenuIds.push(tabId) },
  }
  registerShellWebContents(shell, new AppWindow({
    id: 'window-1',
    browserWindow: window as never,
    tabManager: tabManager as never,
  }))

  registerBrowserShellIpc({})

  ipcMain.emit('browser:showShellContextMenu', event, 'unknown')
  ipcMain.emit('browser:showShellContextMenu', untrustedEvent, 'page')
  assert.strictEqual(menuPopups.length, 0)

  ipcMain.emit('browser:showShellContextMenu', event, 'page')
  assert.strictEqual(menuPopups.length, 1)
  clipboard.writeText('example.com')
  ipcMain.emit('browser:showShellContextMenu', event, 'omnibox')
  assert.strictEqual(menuPopups.length, 2)
  const omniboxTemplate = menuPopups[1].template as Electron.MenuItemConstructorOptions[]
  omniboxTemplate.find((item) => item.label === '粘贴并前往')?.click?.(
    {} as never,
    {} as never,
    {} as never,
  )
  assert.deepStrictEqual(webNavigations, ['https://example.com/'])

  ipcMain.emit('browser:showTabContextMenu', event, 'tab-1')
  ipcMain.emit('browser:showTabContextMenu', event, '')
  ipcMain.emit('browser:showTabContextMenu', event, 42)
  ipcMain.emit('browser:showTabContextMenu', untrustedEvent, 'tab-2')
  assert.deepStrictEqual(tabMenuIds, ['tab-1'])
})

test('browser shell IPC routes each trusted sender only to its owning window', async () => {
  resetElectronMock()
  resetTrustedSenderRegistry()
  const firstShell = new MockWebContents()
  const secondShell = new MockWebContents()
  await firstShell.loadURL('app://shell/index.html')
  await secondShell.loadURL('app://shell/index.html')
  const firstWindow = new MockBrowserWindow()
  const secondWindow = new MockBrowserWindow()
  const firstNavigations: string[] = []
  const secondNavigations: string[] = []
  registerShellWebContents(firstShell, new AppWindow({
    id: 'window-1',
    browserWindow: firstWindow as never,
    tabManager: { navigate: (url: string) => { firstNavigations.push(url) } } as never,
  }))
  registerShellWebContents(secondShell, new AppWindow({
    id: 'window-2',
    browserWindow: secondWindow as never,
    tabManager: { navigate: (url: string) => { secondNavigations.push(url) } } as never,
  }))
  registerBrowserShellIpc({})

  ipcMain.emit('browser:navigate', { sender: firstShell, senderFrame: firstShell.mainFrame }, 'first.example')
  ipcMain.emit('browser:navigate', { sender: secondShell, senderFrame: secondShell.mainFrame }, 'second.example')
  ipcMain.emit('window:minimize', { sender: firstShell, senderFrame: firstShell.mainFrame })

  assert.deepStrictEqual(firstNavigations, ['https://first.example/'])
  assert.deepStrictEqual(secondNavigations, ['https://second.example/'])
  assert.strictEqual(firstWindow.isMinimized(), true)
  assert.strictEqual(secondWindow.isMinimized(), false)
})

test('tab transfer IPC validates payloads and preserves the trusted source window', async () => {
  resetElectronMock()
  resetTrustedSenderRegistry()
  const shell = new MockWebContents()
  await shell.loadURL('app://shell/index.html')
  const untrusted = new MockWebContents()
  await untrusted.loadURL('https://example.com/')
  const appWindow = new AppWindow({
    id: 'window-1',
    browserWindow: new MockBrowserWindow() as never,
    tabManager: {} as never,
  })
  registerShellWebContents(shell, appWindow)
  const moves: Array<[string, string]> = []
  const drags: Array<[string, string, number, number, number]> = []
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const originalHandle = ipcMain.handle
  ipcMain.handle = (channel, handler) => {
    handlers.set(channel, handler as (...args: unknown[]) => unknown)
    originalHandle(channel, handler)
  }
  registerBrowserShellIpc({
    moveTabToNewWindow: async (source, tabId) => {
      moves.push([source.id, tabId])
      return true
    },
    finishTabDrag: async (source, tabId, targetIndex, screenX, screenY) => {
      drags.push([source.id, tabId, targetIndex, screenX, screenY])
      return true
    },
  })
  ipcMain.handle = originalHandle
  const trustedEvent = { sender: shell, senderFrame: shell.mainFrame }
  const untrustedEvent = { sender: untrusted, senderFrame: untrusted.mainFrame }
  const move = handlers.get('tab:moveToNewWindow')!
  const finishDrag = handlers.get('tab:finishDrag')!

  assert.strictEqual(await move(trustedEvent, 'tab-1'), true)
  assert.strictEqual(await move(trustedEvent, ''), false)
  assert.throws(() => move(untrustedEvent, 'tab-2'), /Rejected IPC sender/)
  assert.strictEqual(await finishDrag(trustedEvent, 'tab-1', 2, 300, 20), true)
  assert.strictEqual(await finishDrag(trustedEvent, 'tab-1', 2.5, 300, 20), false)
  assert.throws(() => finishDrag(trustedEvent, 'tab-1', 2, NaN, 20), /Rejected IPC sender/)
  assert.deepStrictEqual(moves, [['window-1', 'tab-1']])
  assert.deepStrictEqual(drags, [['window-1', 'tab-1', 2, 300, 20]])
})
