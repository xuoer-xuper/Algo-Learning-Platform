import { EventEmitter } from 'node:events'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { ipcMain, MockWebContents, resetElectronMock, session } from '../electron/electronMock'
import {
  registerOjWebContents,
  resetTrustedSenderRegistry,
} from '../../electron/ipc/trustedSender'
import { installUserScriptRuntimeBridge } from '../../electron/scripts/userScriptRuntimeBridge'
import { UserScriptMenuRegistry } from '../../electron/scripts/UserScriptMenuRegistry'
import {
  USER_SCRIPT_RUNTIME_INIT_CHANNEL,
  USER_SCRIPT_RUNTIME_PORT_CHANNEL,
} from '../../electron/scripts/userScriptRuntimeProtocol'

class MockPort extends EventEmitter {
  closed = false
  started = false
  sentMessages: unknown[] = []
  close(): void { this.closed = true; this.emit('close') }
  start(): void { this.started = true }
  postMessage(message: unknown): void { this.sentMessages.push(message) }
  receive(data: unknown): void { this.emit('message', { data }) }
}

const nonce = 'a'.repeat(32)

beforeEach(() => {
  resetElectronMock()
  resetTrustedSenderRegistry()
})

afterEach(() => {
  resetElectronMock()
  resetTrustedSenderRegistry()
})

test('registers one fixed frame preload and serves source only to a registered OJ frame', async () => {
  const ojSession = session.fromPartition('persist:oj-main')
  const runtime = createRuntime()
  const bridge = installUserScriptRuntimeBridge({
    runtime: runtime as never,
    session: ojSession as never,
    preloadPath: 'C:\\app\\userscriptBootstrapPreload.mjs',
  })
  assert.deepStrictEqual(Array.from(ojSession.preloadScripts.values()), [{
    type: 'frame',
    filePath: 'C:\\app\\userscriptBootstrapPreload.mjs',
  }])

  const sender = await createSender(ojSession)
  const rejectedEvent = createEvent(sender, [])
  ipcMain.emit(USER_SCRIPT_RUNTIME_INIT_CHANNEL, rejectedEvent, initPayload())
  assert.deepStrictEqual(rejectedEvent.returnValue, { ok: false })

  registerOjWebContents(sender)
  const event = createEvent(sender, [])
  ipcMain.emit(USER_SCRIPT_RUNTIME_INIT_CHANNEL, event, initPayload())
  assert.deepStrictEqual(event.returnValue, {
    ok: true,
    nonce,
    generation: 1,
    scripts: [expectScriptSnapshot()],
  })
  assert.strictEqual(runtime.getNavigationSnapshot.mock.calls.length, 1)

  bridge.dispose()
  assert.strictEqual(ojSession.preloadScripts.size, 0)
})

test('binds value mutations to the navigation generation, script grants, and exact frame', async () => {
  const ojSession = session.fromPartition('persist:oj-main')
  const runtime = createRuntime()
  const bridge = installUserScriptRuntimeBridge({
    runtime: runtime as never,
    session: ojSession as never,
    preloadPath: 'C:\\app\\userscriptBootstrapPreload.mjs',
  })
  const sender = await createSender(ojSession)
  registerOjWebContents(sender)

  const initEvent = createEvent(sender, [])
  ipcMain.emit(USER_SCRIPT_RUNTIME_INIT_CHANNEL, initEvent, initPayload())
  const port = new MockPort()
  ipcMain.emit(USER_SCRIPT_RUNTIME_PORT_CHANNEL, createEvent(sender, [port]), {
    nonce,
    frameUrl: sender.getURL(),
  })
  assert.strictEqual(port.started, true)

  port.receive({ type: 'value:set', scriptId: 'script-1', key: 'count', value: 2 })
  port.receive({ type: 'value:delete', scriptId: 'script-1', key: 'count' })
  port.receive({ type: 'value:set', scriptId: 'other-script', key: 'count', value: 9 })
  assert.deepStrictEqual(runtime.setValue.mock.calls, [['script-1', 'count', 2]])
  assert.deepStrictEqual(runtime.deleteValue.mock.calls, [['script-1', 'count']])

  runtime.generation = 2
  port.receive({ type: 'value:set', scriptId: 'script-1', key: 'count', value: 3 })
  assert.strictEqual(port.closed, true)
  assert.strictEqual(runtime.setValue.mock.calls.length, 1)
  bridge.dispose()
})

test('@grant none blocks value mutations even when mutation grants are also persisted', async () => {
  const ojSession = session.fromPartition('persist:oj-main')
  const runtime = createRuntime(['none', 'GM_setValue', 'GM_deleteValue'])
  const networkProxy = { start: vi.fn(), abort: vi.fn(), abortPrefix: vi.fn() }
  const menuRegistry = new UserScriptMenuRegistry()
  const writeClipboard = vi.fn()
  const bridge = installUserScriptRuntimeBridge({
    runtime: runtime as never,
    session: ojSession as never,
    preloadPath: 'C:\\app\\userscriptBootstrapPreload.mjs',
    networkProxy: networkProxy as never,
    menuRegistry,
    writeClipboard,
  })
  const sender = await createSender(ojSession)
  registerOjWebContents(sender)

  ipcMain.emit(USER_SCRIPT_RUNTIME_INIT_CHANNEL, createEvent(sender, []), initPayload())
  const port = new MockPort()
  ipcMain.emit(USER_SCRIPT_RUNTIME_PORT_CHANNEL, createEvent(sender, [port]), {
    nonce,
    frameUrl: sender.getURL(),
  })

  port.receive({ type: 'value:set', scriptId: 'script-1', key: 'count', value: 2 })
  port.receive({ type: 'value:delete', scriptId: 'script-1', key: 'count' })
  port.receive({
    type: 'xhr:start', scriptId: 'script-1', requestId: 'request-1',
    details: { method: 'GET', url: 'https://api.example.com/', headers: {}, data: null, responseType: '', timeout: 0, anonymous: false },
  })
  port.receive({ type: 'clipboard:set', scriptId: 'script-1', requestId: 'clipboard-1', data: 'blocked', dataType: 'text' })
  port.receive({ type: 'menu:register', scriptId: 'script-1', commandId: 'menu-1', name: 'Blocked' })
  assert.strictEqual(runtime.setValue.mock.calls.length, 0)
  assert.strictEqual(runtime.deleteValue.mock.calls.length, 0)
  assert.strictEqual(networkProxy.start.mock.calls.length, 0)
  assert.strictEqual(writeClipboard.mock.calls.length, 0)
  assert.deepStrictEqual(menuRegistry.getForWebContents(sender.id), [])
  bridge.dispose()
})

test('routes granted network, clipboard, and menu commands and revokes them on generation change', async () => {
  const ojSession = session.fromPartition('persist:oj-main')
  const runtime = createRuntime([
    'GM_xmlhttpRequest', 'GM_setClipboard', 'GM_registerMenuCommand', 'GM_unregisterMenuCommand',
  ])
  const networkProxy = { start: vi.fn(), abort: vi.fn(), abortPrefix: vi.fn() }
  const menuRegistry = new UserScriptMenuRegistry()
  const writeClipboard = vi.fn()
  const bridge = installUserScriptRuntimeBridge({
    runtime: runtime as never,
    session: ojSession as never,
    preloadPath: 'C:\\app\\userscriptBootstrapPreload.mjs',
    networkProxy: networkProxy as never,
    menuRegistry,
    writeClipboard,
  })
  const sender = await createSender(ojSession)
  registerOjWebContents(sender)
  ipcMain.emit(USER_SCRIPT_RUNTIME_INIT_CHANNEL, createEvent(sender, []), initPayload())
  const port = new MockPort()
  ipcMain.emit(USER_SCRIPT_RUNTIME_PORT_CHANNEL, createEvent(sender, [port]), {
    nonce,
    frameUrl: sender.getURL(),
  })

  port.receive({
    type: 'xhr:start', scriptId: 'script-1', requestId: 'request-1',
    details: { method: 'GET', url: 'https://api.example.com/', headers: {}, data: null, responseType: '', timeout: 0, anonymous: false },
  })
  assert.strictEqual(networkProxy.start.mock.calls.length, 1)
  assert.deepStrictEqual(networkProxy.start.mock.calls[0][1], {
    scriptId: 'script-1',
    scriptName: 'Helper',
    frameUrl: sender.getURL(),
    connects: ['api.example.com'],
    webContentsId: sender.id,
  })
  networkProxy.start.mock.calls[0][4]({
    type: 'xhr:failed', requestId: 'request-1', reason: 'denied',
  })
  assert.deepStrictEqual(port.sentMessages.at(-1), {
    type: 'xhr:failed', requestId: 'request-1', reason: 'denied',
  })

  port.receive({ type: 'clipboard:set', scriptId: 'script-1', requestId: 'clipboard-1', data: 'answer', dataType: 'text' })
  assert.deepStrictEqual(writeClipboard.mock.calls, [['answer', 'text']])
  assert.deepStrictEqual(port.sentMessages.at(-1), { type: 'clipboard:result', requestId: 'clipboard-1', ok: true })

  port.receive({ type: 'menu:register', scriptId: 'script-1', commandId: 'menu-1', name: 'Refresh' })
  const commands = menuRegistry.getForWebContents(sender.id)
  assert.strictEqual(commands.length, 1)
  commands[0].invoke()
  assert.deepStrictEqual(port.sentMessages.at(-1), {
    type: 'menu:invoke', scriptId: 'script-1', commandId: 'menu-1',
  })

  runtime.advanceGeneration()
  assert.strictEqual(port.closed, true)
  assert.deepStrictEqual(menuRegistry.getForWebContents(sender.id), [])
  assert.ok(networkProxy.abortPrefix.mock.calls.length > 0)
  const messagesAfterGenerationChange = port.sentMessages.length
  networkProxy.start.mock.calls[0][4]({
    type: 'xhr:complete',
    requestId: 'request-1',
    response: {
      finalUrl: 'https://api.example.com/',
      status: 200,
      statusText: 'OK',
      responseHeaders: '',
      responseType: 'text',
      body: new ArrayBuffer(0),
    },
  })
  assert.strictEqual(port.sentMessages.length, messagesAfterGenerationChange)
  bridge.dispose()
})

test('rejects stale or mismatched port handoffs', async () => {
  const ojSession = session.fromPartition('persist:oj-main')
  const runtime = createRuntime()
  const bridge = installUserScriptRuntimeBridge({
    runtime: runtime as never,
    session: ojSession as never,
    preloadPath: 'C:\\app\\userscriptBootstrapPreload.mjs',
  })
  const sender = await createSender(ojSession)
  registerOjWebContents(sender)
  ipcMain.emit(USER_SCRIPT_RUNTIME_INIT_CHANNEL, createEvent(sender, []), initPayload())

  const wrongNoncePort = new MockPort()
  ipcMain.emit(USER_SCRIPT_RUNTIME_PORT_CHANNEL, createEvent(sender, [wrongNoncePort]), {
    nonce: 'b'.repeat(32),
    frameUrl: sender.getURL(),
  })
  assert.strictEqual(wrongNoncePort.closed, true)

  const replayPort = new MockPort()
  ipcMain.emit(USER_SCRIPT_RUNTIME_PORT_CHANNEL, createEvent(sender, [replayPort]), {
    nonce,
    frameUrl: sender.getURL(),
  })
  assert.strictEqual(replayPort.closed, true)
  bridge.dispose()
})

function createRuntime(grants?: string[]) {
  let generationListener: ((generation: number) => void) | null = null
  const runtime = {
    generation: 1,
    getNavigationSnapshot: vi.fn(() => ({ generation: 1, scripts: [expectScriptSnapshot(grants)] })),
    setValue: vi.fn(),
    deleteValue: vi.fn(),
    addGenerationChangeListener: vi.fn((listener: (generation: number) => void) => {
      generationListener = listener
      return () => { generationListener = null }
    }),
    advanceGeneration: () => {
      runtime.generation += 1
      generationListener?.(runtime.generation)
    },
  }
  return runtime
}

function expectScriptSnapshot(grants = ['GM_getValue', 'GM_setValue', 'GM_deleteValue']) {
  return {
    id: 'script-1',
    name: 'Helper',
    namespace: null,
    description: null,
    version: '1.0.0',
    runAt: 'document-start',
    grants,
    connects: ['api.example.com'],
    values: [['count', 1]],
    code: 'window.marker = true',
  }
}

async function createSender(ojSession: ReturnType<typeof session.fromPartition>): Promise<MockWebContents> {
  const sender = new MockWebContents()
  Object.defineProperty(sender, 'session', { value: ojSession })
  await sender.loadURL('https://example.com/problem/1')
  return sender
}

function initPayload() {
  return { nonce, frameUrl: 'https://example.com/problem/1', isMainFrame: true }
}

function createEvent(sender: MockWebContents, ports: MockPort[]) {
  return {
    sender,
    senderFrame: sender.mainFrame,
    ports,
    returnValue: undefined as unknown,
  }
}
