import assert from 'node:assert/strict'
import { test } from 'vitest'
import { clipboard, ipcMain } from 'electron'
import { menuPopups, MockBrowserWindow, MockWebContents, resetElectronMock } from '../electron/electronMock'
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
  assert.throws(() => move(untrustedEvent, 'tab-2'), /Rejected IPC sender/)
  assert.strictEqual(await finishDrag(trustedEvent, 'tab-1', 2, 300, 20), true)

  /*
   * 空 tabId 与小数 targetIndex 原先返回 false，现在是拒绝。
   *
   * 断言的承重部分没变——非法参数不能到达 `moveTabToNewWindow` / `finishTabDrag`，
   * 下面两条 deepStrictEqual 才是要守的东西。改判的理由是这两个值都由 TabStrip 自己算：
   * tabId 取自真实标签，targetIndex 来自 `findTargetIndex`（循环下标或 `candidates.length`，
   * 只可能是非负整数）。形状不对说明渲染进程有 bug，而返回 false 会和"过户失败"
   * （窗口已销毁、标签已关）混在一起，调用方分不出。两个调用点都是
   * `.catch(() => false)`，不会产生无人接管的 rejection。
   */
  assert.throws(() => move(trustedEvent, ''), /Rejected IPC sender \(payload\)/, '空 tabId 应被拒绝')
  assert.throws(
    () => finishDrag(trustedEvent, 'tab-1', 2.5, 300, 20),
    /Rejected IPC sender \(payload\)/,
    '小数 targetIndex 应被拒绝',
  )
  assert.throws(
    () => finishDrag(trustedEvent, 'tab-1', -1, 300, 20),
    /Rejected IPC sender \(payload\)/,
    '负 targetIndex 应被拒绝',
  )
  // NaN 坐标此前就被 `checkIpcPayload` 的非有限数检查拦住了；现在 schema 也拦，两层都在。
  assert.throws(() => finishDrag(trustedEvent, 'tab-1', 2, NaN, 20), /Rejected IPC sender/)
  assert.deepStrictEqual(moves, [['window-1', 'tab-1']])
  assert.deepStrictEqual(drags, [['window-1', 'tab-1', 2, 300, 20]])
})

test('userscript host permission IPC is bound to the trusted owning shell window', async () => {
  resetElectronMock()
  resetTrustedSenderRegistry()
  const shell = new MockWebContents()
  const untrusted = new MockWebContents()
  await shell.loadURL('app://shell/index.html')
  await untrusted.loadURL('https://example.com/')
  const appWindow = new AppWindow({
    id: 'window-1',
    browserWindow: new MockBrowserWindow() as never,
    tabManager: {} as never,
  })
  registerShellWebContents(shell, appWindow)
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const originalHandle = ipcMain.handle
  ipcMain.handle = (channel, handler) => {
    handlers.set(channel, handler as (...args: unknown[]) => unknown)
    originalHandle(channel, handler)
  }
  const responses: Array<[string, string, boolean]> = []
  registerBrowserShellIpc({
    getUserScriptHostPermissionPrompt: owner => ({
      promptId: `prompt-${owner.id}`,
      scriptName: 'Helper',
      targetHost: 'api.example.com',
      sourceHost: 'codeforces.com',
    }),
    respondUserScriptHostPermission: async (owner, promptId, allow) => {
      responses.push([owner.id, promptId, allow])
      return allow ? 'allowed' : 'denied'
    },
  })
  ipcMain.handle = originalHandle
  const trustedEvent = { sender: shell, senderFrame: shell.mainFrame }
  const untrustedEvent = { sender: untrusted, senderFrame: untrusted.mainFrame }
  const getPrompt = handlers.get('userscript:getHostPermissionPrompt')!
  const respond = handlers.get('userscript:respondHostPermission')!

  assert.deepStrictEqual(await getPrompt(trustedEvent), {
    promptId: 'prompt-window-1', scriptName: 'Helper', targetHost: 'api.example.com', sourceHost: 'codeforces.com',
  })
  assert.strictEqual(await respond(trustedEvent, 'prompt-window-1', true), 'allowed')
  assert.throws(() => getPrompt(untrustedEvent), /Rejected IPC sender/)

  /*
   * 空 promptId 原先返回 `'stale'`，现在是拒绝。
   *
   * 这条改判比其它几处更值得说：`'stale'` 是一个**有含义的业务答复**——"这个授权提示
   * 已经过期了，重新申请吧"。把形状错误也答成 `'stale'`，等于告诉渲染进程一件假话，
   * 而 promptId 是由 broker 生成、渲染进程原样回传的，形状不对只可能是我们的 bug。
   * 承重的仍是下面那条 deepStrictEqual：非法参数不能到达 broker。
   */
  assert.throws(
    () => respond(trustedEvent, '', true),
    /Rejected IPC sender \(payload\)/,
    '空 promptId 应被拒绝，而不是答成 stale',
  )
  for (const badAllow of [1, 'true', null, undefined]) {
    assert.throws(
      () => respond(trustedEvent, 'prompt-window-1', badAllow),
      /Rejected IPC sender \(payload\)/,
      `allow 应拒绝 ${JSON.stringify(badAllow) ?? 'undefined'}`,
    )
  }
  assert.deepStrictEqual(responses, [['window-1', 'prompt-window-1', true]])
})
