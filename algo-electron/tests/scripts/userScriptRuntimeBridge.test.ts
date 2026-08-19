import { EventEmitter } from 'node:events'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { ipcMain, MockWebContents, resetElectronMock, session } from '../electron/electronMock'
import {
  registerOjWebContents,
  resetTrustedSenderRegistry,
} from '../../electron/ipc/trustedSender'
import { installUserScriptRuntimeBridge } from '../../electron/scripts/userScriptRuntimeBridge'
import {
  USER_SCRIPT_RUNTIME_INIT_CHANNEL,
  USER_SCRIPT_RUNTIME_PORT_CHANNEL,
} from '../../electron/scripts/userScriptRuntimeProtocol'

class MockPort extends EventEmitter {
  closed = false
  started = false
  close(): void { this.closed = true; this.emit('close') }
  start(): void { this.started = true }
  postMessage(): void { /* no-op */ }
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
  const bridge = installUserScriptRuntimeBridge({
    runtime: runtime as never,
    session: ojSession as never,
    preloadPath: 'C:\\app\\userscriptBootstrapPreload.mjs',
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
  assert.strictEqual(runtime.setValue.mock.calls.length, 0)
  assert.strictEqual(runtime.deleteValue.mock.calls.length, 0)
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
  return {
    generation: 1,
    getNavigationSnapshot: vi.fn(() => ({ generation: 1, scripts: [expectScriptSnapshot(grants)] })),
    setValue: vi.fn(),
    deleteValue: vi.fn(),
  }
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
