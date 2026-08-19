import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  buildUserScriptMainWorldRuntime,
} from '../../electron/scripts/userScriptMainWorldRuntime'
import { USER_SCRIPT_RUNTIME_HANDOFF_KIND } from '../../electron/scripts/userScriptRuntimeProtocol'

class TestPort {
  peer: TestPort | null = null
  messages: unknown[] = []
  onmessage: ((event: { data: unknown }) => void) | null = null
  postMessage(message: unknown): void {
    this.peer?.messages.push(message)
    this.peer?.onmessage?.({ data: message })
  }
  start(): void { /* no-op */ }
  receive(message: unknown): void { this.postMessage(message) }
}

class TestMessageChannel {
  readonly port1 = new TestPort()
  readonly port2 = new TestPort()
  constructor() {
    this.port1.peer = this.port2
    this.port2.peer = this.port1
  }
}

interface RuntimeEvents {
  document: Map<string, () => void>
  window: Map<string, () => void>
}

async function withRuntimeGlobals(callback: (
  port: TestPort,
  styles: Array<{ textContent: string }>,
  events: RuntimeEvents,
) => void | Promise<void>): Promise<void> {
  const originals = {
    MessageChannel: Object.getOwnPropertyDescriptor(globalThis, 'MessageChannel'),
    postMessage: Object.getOwnPropertyDescriptor(globalThis, 'postMessage'),
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    addEventListener: Object.getOwnPropertyDescriptor(globalThis, 'addEventListener'),
    dispatchEvent: Object.getOwnPropertyDescriptor(globalThis, 'dispatchEvent'),
    location: Object.getOwnPropertyDescriptor(globalThis, 'location'),
    history: Object.getOwnPropertyDescriptor(globalThis, 'history'),
    onurlchange: Object.getOwnPropertyDescriptor(globalThis, 'onurlchange'),
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
  }
  const styles: Array<{ textContent: string }> = []
  const events: RuntimeEvents = { document: new Map(), window: new Map() }
  let transferredPort: TestPort | null = null
  Object.defineProperty(globalThis, 'MessageChannel', { configurable: true, value: TestMessageChannel })
  Object.defineProperty(globalThis, 'postMessage', {
    configurable: true,
    value: (message: unknown, origin: string, ports: TestPort[]) => {
      assert.deepStrictEqual(message, {
        type: USER_SCRIPT_RUNTIME_HANDOFF_KIND,
        handshakeId: 'navigation-handshake',
      })
      assert.strictEqual(origin, 'https://example.com')
      transferredPort = ports[0]
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      readyState: 'loading',
      createElement: () => ({ textContent: '' }),
      head: { appendChild: (style: { textContent: string }) => styles.push(style) },
      addEventListener: (name: string, listener: () => void) => events.document.set(name, listener),
    },
  })
  Object.defineProperty(globalThis, 'addEventListener', {
    configurable: true,
    value: (name: string, listener: () => void) => events.window.set(name, listener),
  })
  Object.defineProperty(globalThis, 'dispatchEvent', { configurable: true, value: () => true })
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { href: 'https://example.com/start' },
  })
  const updateLocation = (_state: unknown, _unused: string, url?: string | URL | null): void => {
    if (url !== undefined && url !== null) globalThis.location.href = new URL(String(url), globalThis.location.href).toString()
  }
  Object.defineProperty(globalThis, 'history', {
    configurable: true,
    value: { pushState: updateLocation, replaceState: updateLocation },
  })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis })
  try {
    await callback({
      get messages() {
        assert.ok(transferredPort)
        return transferredPort.messages
      },
      postMessage: () => undefined,
      start: () => undefined,
      receive: (message: unknown) => transferredPort?.receive(message),
      peer: null,
    } as TestPort, styles, events)
  }
  finally {
    restoreGlobal('MessageChannel', originals.MessageChannel)
    restoreGlobal('postMessage', originals.postMessage)
    restoreGlobal('document', originals.document)
    restoreGlobal('addEventListener', originals.addEventListener)
    restoreGlobal('dispatchEvent', originals.dispatchEvent)
    restoreGlobal('location', originals.location)
    restoreGlobal('history', originals.history)
    restoreGlobal('onurlchange', originals.onurlchange)
    restoreGlobal('window', originals.window)
  }
}

function restoreGlobal(name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor)
  else Reflect.deleteProperty(globalThis, name)
}

function execute(scripts: Parameters<typeof buildUserScriptMainWorldRuntime>[0]['scripts']) {
  return buildUserScriptMainWorldRuntime({
    handshakeId: 'navigation-handshake',
    targetOrigin: 'https://example.com',
    scripts,
  })
}

test('runs scripts in independent IIFEs and rejects only syntax-invalid entries', async () => {
  await withRuntimeGlobals((port) => {
    Object.defineProperty(globalThis, '__userscriptRuns', { configurable: true, value: [] })
    try {
      const result = execute([
        { id: 'first', name: 'First', grants: [], source: "const collision = 'first'; globalThis.__userscriptRuns.push(collision)" },
        { id: 'syntax', name: 'Syntax', grants: [], source: 'const broken =' },
        { id: 'last', name: 'Last', grants: [], source: "const collision = 'last'; globalThis.__userscriptRuns.push(collision)" },
      ])
      result.execution.func(...result.execution.args)
      assert.deepStrictEqual((globalThis as typeof globalThis & { __userscriptRuns: string[] }).__userscriptRuns, ['first', 'last'])
      assert.deepStrictEqual(result.rejectedScripts.map(script => script.id), ['syntax'])
      assert.strictEqual('source' in result.execution.args[0].scripts[0], false)
      assert.strictEqual(port.messages.length, 0)
    }
    finally { Reflect.deleteProperty(globalThis, '__userscriptRuns') }
  })
})

test('provides only granted classic APIs and persists cloned values through the port', async () => {
  await withRuntimeGlobals((port, styles) => {
    Object.defineProperty(globalThis, '__classicResult', { configurable: true, value: null, writable: true })
    try {
      const result = execute([{
        id: 'classic',
        name: 'Classic',
        grants: ['GM_info', 'GM_addStyle', 'GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues', 'unsafeWindow'],
        values: [['count', 3], ['object', { nested: true }]],
        source: `
          const objectValue = GM_getValue('object');
          objectValue.nested = false;
          const style = GM_addStyle('body { color: red; }');
          GM_setValue('count', GM_getValue('count', 0) + 1);
          GM_deleteValue('object');
          globalThis.__classicResult = {
            modernType: typeof GM,
            infoName: GM_info.script.name,
            infoFrozen: Object.isFrozen(GM_info) && Object.isFrozen(GM_info.script),
            values: GM_listValues(),
            objectWasCloned: GM_getValue('object', { nested: true }).nested,
            unsafeIsWindow: unsafeWindow === globalThis,
            styleText: style.textContent,
          };
        `,
      }])
      result.execution.func(...result.execution.args)
      assert.deepStrictEqual((globalThis as typeof globalThis & { __classicResult: unknown }).__classicResult, {
        modernType: 'undefined',
        infoName: 'Classic',
        infoFrozen: true,
        values: ['count'],
        objectWasCloned: true,
        unsafeIsWindow: true,
        styleText: 'body { color: red; }',
      })
      assert.deepStrictEqual(styles, [{ textContent: 'body { color: red; }' }])
      assert.deepStrictEqual((port as TestPort).messages, [
        { type: 'value:set', scriptId: 'classic', key: 'count', value: 4 },
        { type: 'value:delete', scriptId: 'classic', key: 'object' },
      ])
      for (const name of ['GM', 'GM_info', 'GM_addStyle', 'GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues', 'GM_xmlhttpRequest', 'GM_setClipboard', 'GM_registerMenuCommand', 'GM_unregisterMenuCommand', 'unsafeWindow']) {
        assert.strictEqual(Object.prototype.hasOwnProperty.call(globalThis, name), false)
      }
    }
    finally { Reflect.deleteProperty(globalThis, '__classicResult') }
  })
})

test('@grant none disables all supported bindings and modern GM aliases are exact', async () => {
  await withRuntimeGlobals(async (port) => {
    Object.defineProperty(globalThis, '__noneResult', { configurable: true, value: null, writable: true })
    Object.defineProperty(globalThis, '__modernResult', { configurable: true, value: null, writable: true })
    try {
      execute([
        {
          id: 'none', name: 'None', grants: ['none', 'GM_getValue', 'GM.getValue', 'unsafeWindow'],
          source: 'globalThis.__noneResult = [typeof GM, typeof GM_getValue, typeof unsafeWindow]',
        },
        {
          id: 'modern', name: 'Modern', grants: ['GM.info', 'GM.getValue', 'GM.setValue'], values: [['answer', 41]],
          source: `globalThis.__modernResult = { keys: Object.keys(GM).sort(), classic: typeof GM_getValue, name: GM.info.script.name }; (async () => { await GM.setValue('answer', (await GM.getValue('answer')) + 1) })()`,
        },
      ]).execution.func(...execute([
        {
          id: 'none', name: 'None', grants: ['none', 'GM_getValue', 'GM.getValue', 'unsafeWindow'],
          source: 'globalThis.__noneResult = [typeof GM, typeof GM_getValue, typeof unsafeWindow]',
        },
        {
          id: 'modern', name: 'Modern', grants: ['GM.info', 'GM.getValue', 'GM.setValue'], values: [['answer', 41]],
          source: `globalThis.__modernResult = { keys: Object.keys(GM).sort(), classic: typeof GM_getValue, name: GM.info.script.name }; (async () => { await GM.setValue('answer', (await GM.getValue('answer')) + 1) })()`,
        },
      ]).execution.args)
      assert.deepStrictEqual((globalThis as typeof globalThis & { __noneResult: unknown }).__noneResult, ['undefined', 'undefined', 'undefined'])
      assert.deepStrictEqual((globalThis as typeof globalThis & { __modernResult: unknown }).__modernResult, {
        keys: ['getValue', 'info', 'setValue'],
        classic: 'undefined',
        name: 'Modern',
      })
      await Promise.resolve()
      assert.deepStrictEqual((port as TestPort).messages, [
        { type: 'value:set', scriptId: 'modern', key: 'answer', value: 42 },
      ])
    }
    finally {
      Reflect.deleteProperty(globalThis, '__noneResult')
      Reflect.deleteProperty(globalThis, '__modernResult')
    }
  })
})

test('stages document-end and document-idle scripts without running them at preload time', async () => {
  await withRuntimeGlobals(async (_port, _styles, events) => {
    Object.defineProperty(globalThis, '__scheduledRuns', { configurable: true, value: [], writable: true })
    try {
      const result = execute([
        {
          id: 'end', name: 'End', grants: [], runAt: 'document-end',
          source: "globalThis.__scheduledRuns.push('end')",
        },
        {
          id: 'idle', name: 'Idle', grants: [], runAt: 'document-idle',
          source: "globalThis.__scheduledRuns.push('idle')",
        },
      ])
      result.execution.func(...result.execution.args)
      const scheduledRuns = (globalThis as typeof globalThis & { __scheduledRuns: string[] }).__scheduledRuns
      assert.deepStrictEqual(scheduledRuns, [])

      events.document.get('DOMContentLoaded')?.()
      assert.deepStrictEqual(scheduledRuns, ['end'])
      events.window.get('load')?.()
      await new Promise(resolve => setTimeout(resolve, 0))
      assert.deepStrictEqual(scheduledRuns, ['end', 'idle'])
    }
    finally { Reflect.deleteProperty(globalThis, '__scheduledRuns') }
  })
})

test('routes classic xhr, clipboard, and menu callbacks through the private port', async () => {
  await withRuntimeGlobals(async (port) => {
    Object.defineProperty(globalThis, '__gmRuntimeResult', {
      configurable: true,
      value: { menuRuns: 0 },
      writable: true,
    })
    try {
      execute([{
        id: 'network',
        name: 'Network helper',
        grants: ['GM_xmlhttpRequest', 'GM_setClipboard', 'GM_registerMenuCommand'],
        source: `
          const result = globalThis.__gmRuntimeResult;
          result.request = GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://api.example.com/data',
            responseType: 'json',
            onprogress: event => { result.loaded = event.loaded; },
            onload: response => { result.response = response.response; result.finalUrl = response.finalUrl; },
          });
          GM_setClipboard('answer', 'text', ok => { result.clipboard = ok; });
          result.menuId = GM_registerMenuCommand('Refresh rating', () => { result.menuRuns += 1; });
        `,
      }]).execution.func(...execute([{
        id: 'network',
        name: 'Network helper',
        grants: ['GM_xmlhttpRequest', 'GM_setClipboard', 'GM_registerMenuCommand'],
        source: `
          const result = globalThis.__gmRuntimeResult;
          result.request = GM_xmlhttpRequest({
            method: 'GET', url: 'https://api.example.com/data', responseType: 'json',
            onprogress: event => { result.loaded = event.loaded; },
            onload: response => { result.response = response.response; result.finalUrl = response.finalUrl; },
          });
          GM_setClipboard('answer', 'text', ok => { result.clipboard = ok; });
          result.menuId = GM_registerMenuCommand('Refresh rating', () => { result.menuRuns += 1; });
        `,
      }]).execution.args)

      const messages = port.messages as Array<Record<string, unknown>>
      const xhr = messages.find(message => message.type === 'xhr:start')!
      const clipboard = messages.find(message => message.type === 'clipboard:set')!
      const menu = messages.find(message => message.type === 'menu:register')!
      assert.deepStrictEqual(xhr.details, {
        method: 'GET', url: 'https://api.example.com/data', headers: {}, data: null,
        responseType: 'json', timeout: 0, anonymous: false,
      })
      port.receive({ type: 'xhr:progress', requestId: xhr.requestId, loaded: 7, total: 7 })
      port.receive({
        type: 'xhr:complete',
        requestId: xhr.requestId,
        response: {
          finalUrl: 'https://api.example.com/data', status: 200, statusText: 'OK',
          responseHeaders: 'content-type: application/json', responseType: 'json',
          body: new TextEncoder().encode('{"rating":1900}').buffer,
        },
      })
      port.receive({ type: 'clipboard:result', requestId: clipboard.requestId, ok: true })
      port.receive({ type: 'menu:invoke', scriptId: 'network', commandId: menu.commandId })

      const result = (globalThis as typeof globalThis & { __gmRuntimeResult: Record<string, unknown> }).__gmRuntimeResult
      assert.strictEqual(result.loaded, 7)
      assert.deepStrictEqual(result.response, { rating: 1900 })
      assert.strictEqual(result.finalUrl, 'https://api.example.com/data')
      assert.strictEqual(result.clipboard, true)
      assert.strictEqual(result.menuRuns, 1)
      assert.strictEqual(typeof (result.request as { abort: unknown }).abort, 'function')
    }
    finally { Reflect.deleteProperty(globalThis, '__gmRuntimeResult') }
  })
})

test('modern xhr returns a promise with abort and @grant none suppresses new privileged APIs', async () => {
  await withRuntimeGlobals(async (port) => {
    Object.defineProperty(globalThis, '__modernNetwork', { configurable: true, value: {}, writable: true })
    try {
      const scripts = [
        {
          id: 'modern-network', name: 'Modern', grants: ['GM.xmlHttpRequest', 'GM.setClipboard'],
          source: `
            const request = GM.xmlHttpRequest({ url: 'https://api.example.com/text' });
            globalThis.__modernNetwork.abortType = typeof request.abort;
            globalThis.__modernNetwork.request = request.then(response => response.responseText);
            globalThis.__modernNetwork.clipboard = GM.setClipboard('modern');
          `,
        },
        {
          id: 'none-network', name: 'None', grants: ['none', 'GM_xmlhttpRequest', 'GM.setClipboard'],
          source: `globalThis.__modernNetwork.none = [typeof GM_xmlhttpRequest, typeof GM];`,
        },
      ]
      const built = execute(scripts)
      built.execution.func(...built.execution.args)
      const messages = port.messages as Array<Record<string, unknown>>
      const xhr = messages.find(message => message.type === 'xhr:start')!
      const clipboard = messages.find(message => message.type === 'clipboard:set')!
      port.receive({
        type: 'xhr:complete', requestId: xhr.requestId,
        response: {
          finalUrl: 'https://api.example.com/text', status: 200, statusText: 'OK',
          responseHeaders: '', responseType: '', body: new TextEncoder().encode('ready').buffer,
        },
      })
      port.receive({ type: 'clipboard:result', requestId: clipboard.requestId, ok: true })
      const result = (globalThis as typeof globalThis & { __modernNetwork: Record<string, unknown> }).__modernNetwork
      assert.strictEqual(result.abortType, 'function')
      assert.strictEqual(await result.request, 'ready')
      await result.clipboard
      assert.deepStrictEqual(result.none, ['undefined', 'undefined'])
    }
    finally { Reflect.deleteProperty(globalThis, '__modernNetwork') }
  })
})

test('window.onurlchange is installed only for its grant and deduplicates unchanged URLs', async () => {
  await withRuntimeGlobals(() => {
    Object.defineProperty(globalThis, '__urlChanges', { configurable: true, value: [], writable: true })
    try {
      execute([{
        id: 'urlchange', name: 'SPA helper', grants: ['window.onurlchange'],
        source: `
          window.onurlchange = event => globalThis.__urlChanges.push(event.url);
          history.pushState({}, '', '/next');
          history.replaceState({}, '', '/next');
          history.replaceState({}, '', '/final#hash');
        `,
      }]).execution.func(...execute([{
        id: 'urlchange', name: 'SPA helper', grants: ['window.onurlchange'],
        source: `
          window.onurlchange = event => globalThis.__urlChanges.push(event.url);
          history.pushState({}, '', '/next');
          history.replaceState({}, '', '/next');
          history.replaceState({}, '', '/final#hash');
        `,
      }]).execution.args)
      assert.deepStrictEqual((globalThis as typeof globalThis & { __urlChanges: string[] }).__urlChanges, [
        'https://example.com/next',
        'https://example.com/final#hash',
      ])
    }
    finally { Reflect.deleteProperty(globalThis, '__urlChanges') }
  })
})

test('rejects wildcard origins, duplicate ids, and non-JSON snapshots', () => {
  assert.throws(() => buildUserScriptMainWorldRuntime({ handshakeId: 'x', targetOrigin: '*', scripts: [] }), /targetOrigin/)
  assert.throws(() => execute([
    { id: 'duplicate', name: 'One', grants: [], source: '' },
    { id: 'duplicate', name: 'Two', grants: [], source: '' },
  ]), /Duplicate userscript id/)
  const invalidSnapshot = execute([
    { id: 'bad', name: 'Bad', grants: [], source: '', values: [['key', () => undefined]] },
  ])
  assert.strictEqual(invalidSnapshot.rejectedScripts[0].id, 'bad')
  assert.match(invalidSnapshot.rejectedScripts[0].reason, /JSON serializable/)
})
