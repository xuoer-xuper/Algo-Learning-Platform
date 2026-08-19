import { USER_SCRIPT_RUNTIME_HANDOFF_KIND } from './userScriptRuntimeProtocol'

export const USER_SCRIPT_MAIN_WORLD_PARAMETER_NAMES = [
  'GM',
  'GM_info',
  'GM_addStyle',
  'GM_getValue',
  'GM_setValue',
  'GM_deleteValue',
  'GM_listValues',
  'GM_xmlhttpRequest',
  'GM_setClipboard',
  'GM_registerMenuCommand',
  'GM_unregisterMenuCommand',
  'unsafeWindow',
] as const

export interface UserScriptMainWorldScript {
  id: string
  name: string
  namespace?: string | null
  description?: string | null
  version?: string | null
  runAt?: 'document-start' | 'document-end' | 'document-idle'
  source: string
  grants: readonly string[]
  values?: ReadonlyArray<readonly [string, unknown]>
}

export interface UserScriptMainWorldBuildInput {
  handshakeId: string
  targetOrigin: string
  scripts: readonly UserScriptMainWorldScript[]
  handlerName?: string
  handlerVersion?: string
}

interface GrantPermissions {
  classicInfo: boolean
  classicAddStyle: boolean
  classicGetValue: boolean
  classicSetValue: boolean
  classicDeleteValue: boolean
  classicListValues: boolean
  modernInfo: boolean
  modernAddStyle: boolean
  modernGetValue: boolean
  modernSetValue: boolean
  modernDeleteValue: boolean
  modernListValues: boolean
  classicXmlHttpRequest: boolean
  classicSetClipboard: boolean
  classicRegisterMenuCommand: boolean
  classicUnregisterMenuCommand: boolean
  modernXmlHttpRequest: boolean
  modernSetClipboard: boolean
  modernRegisterMenuCommand: boolean
  modernUnregisterMenuCommand: boolean
  urlChange: boolean
  unsafeWindow: boolean
}

interface ScriptDescriptor {
  id: string
  name: string
  namespace: string | null
  description: string | null
  version: string | null
  runAt: 'document-start' | 'document-end' | 'document-idle'
  permissions: GrantPermissions
  values: Array<[string, unknown]>
}

interface ExecutionPayload {
  handshakeId: string
  targetOrigin: string
  handlerName: string
  handlerVersion: string
  scripts: ScriptDescriptor[]
}

export interface UserScriptMainWorldRejectedScript {
  id: string
  name: string
  reason: string
}

export interface UserScriptMainWorldExecution {
  func: (payload: ExecutionPayload) => void
  args: [ExecutionPayload]
}

export interface UserScriptMainWorldBuildResult {
  execution: UserScriptMainWorldExecution
  rejectedScripts: UserScriptMainWorldRejectedScript[]
}

interface CompiledScript {
  descriptor: ScriptDescriptor
  functionSource: string
}

let runtimeSequence = 0

export function buildUserScriptMainWorldRuntime(
  input: UserScriptMainWorldBuildInput,
): UserScriptMainWorldBuildResult {
  const handshakeId = requireString(input.handshakeId, 'handshakeId', 200)
  const targetOrigin = requireExactOrigin(input.targetOrigin)
  const handlerName = requireString(input.handlerName ?? 'Algo Learning Platform', 'handlerName', 200)
  const handlerVersion = requireString(input.handlerVersion ?? '', 'handlerVersion', 100, true)
  const compiledScripts: CompiledScript[] = []
  const rejectedScripts: UserScriptMainWorldRejectedScript[] = []
  const ids = new Set<string>()

  for (const script of input.scripts) {
    const id = requireString(script.id, 'script.id', 200)
    const name = requireString(script.name, 'script.name', 500)
    if (ids.has(id)) throw new TypeError(`Duplicate userscript id: ${id}`)
    ids.add(id)
    if (typeof script.source !== 'string') throw new TypeError(`Userscript ${id} source must be a string`)
    if (!Array.isArray(script.grants) || script.grants.some(grant => typeof grant !== 'string')) {
      throw new TypeError(`Userscript ${id} grants must be a string array`)
    }

    try {
      const compiled = new Function(
        ...USER_SCRIPT_MAIN_WORLD_PARAMETER_NAMES,
        `"use strict";\n${script.source}\n`,
      )
      compiledScripts.push({
        descriptor: {
          id,
          name,
          namespace: optionalString(script.namespace),
          description: optionalString(script.description),
          version: optionalString(script.version),
          runAt: normalizeRunAt(script.runAt),
          permissions: resolvePermissions(script.grants),
          values: normalizeValues(script.values),
        },
        functionSource: compiled.toString(),
      })
    }
    catch (error) {
      rejectedScripts.push({ id, name, reason: errorMessage(error) })
    }
  }

  const payload: ExecutionPayload = {
    handshakeId,
    targetOrigin,
    handlerName,
    handlerVersion,
    scripts: compiledScripts.map(script => script.descriptor),
  }
  return {
    execution: { func: createExecutionFunction(compiledScripts), args: [payload] },
    rejectedScripts,
  }
}

function createExecutionFunction(scripts: readonly CompiledScript[]): UserScriptMainWorldExecution['func'] {
  const prefix = runtimePrefix()
  const payload = `${prefix}Payload`
  const page = `${prefix}Window`
  const channel = `${prefix}Channel`
  const send = `${prefix}Send`
  const clone = `${prefix}Clone`
  const helpers = `${prefix}Helpers`
  const makeApi = `${prefix}MakeApi`
  const pendingXhr = `${prefix}PendingXhr`
  const pendingClipboard = `${prefix}PendingClipboard`
  const menuCallbacks = `${prefix}MenuCallbacks`
  const requestSequence = `${prefix}RequestSequence`
  const nextRequestId = `${prefix}NextRequestId`
  const runs = scripts.map((script, index) => `
    {
      const descriptor = ${payload}.scripts[${index}];
      const api = ${makeApi}(descriptor);
      const run = () => {
        try {
          (${script.functionSource}).call(${page}, ...api);
        } catch { /* isolate one script without leaking source or error text */ }
      };
      if (descriptor.runAt === 'document-start') {
        run();
      } else if (descriptor.runAt === 'document-end') {
        if (${page}.document?.readyState === 'loading') {
          ${page}.document.addEventListener('DOMContentLoaded', run, { once: true });
        } else {
          run();
        }
      } else if (${page}.document?.readyState === 'complete') {
        ${page}.setTimeout(run, 0);
      } else {
        ${page}.addEventListener('load', () => ${page}.setTimeout(run, 0), { once: true });
      }
    }
  `).join('\n')

  const body = `
    "use strict";
    const ${page} = globalThis;
    const ${channel} = new ${page}.MessageChannel();
    const ${send} = ${channel}.port1.postMessage.bind(${channel}.port1);
    const ${pendingXhr} = new Map();
    const ${pendingClipboard} = new Map();
    const ${menuCallbacks} = new Map();
    let ${requestSequence} = 0;
    const ${nextRequestId} = (kind) => kind + '-' + (++${requestSequence});
    if (typeof ${channel}.port1.start === 'function') ${channel}.port1.start();
    ${page}.postMessage(
      { type: ${JSON.stringify(USER_SCRIPT_RUNTIME_HANDOFF_KIND)}, handshakeId: ${payload}.handshakeId },
      ${payload}.targetOrigin,
      [${channel}.port2],
    );
    const ${clone} = (value) => {
      if (value === undefined) return undefined;
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new TypeError('Userscript values must be JSON serializable');
      return JSON.parse(serialized);
    };
    const ${helpers} = {
      addStyle(targetPage, css) {
        const documentObject = targetPage.document;
        if (!documentObject || typeof documentObject.createElement !== 'function') {
          throw new Error('GM_addStyle requires a document');
        }
        const style = documentObject.createElement('style');
        style.textContent = String(css);
        const parent = documentObject.head || documentObject.documentElement;
        if (!parent || typeof parent.appendChild !== 'function') {
          throw new Error('GM_addStyle could not find a style container');
        }
        parent.appendChild(style);
        return style;
      },
      getValue(state, cloneValue, key, defaultValue) {
        const normalizedKey = String(key);
        return state.has(normalizedKey) ? cloneValue(state.get(normalizedKey)) : defaultValue;
      },
      setValue(state, cloneValue, sendMessage, scriptId, key, value) {
        const normalizedKey = String(key);
        const storedValue = cloneValue(value);
        state.set(normalizedKey, storedValue);
        sendMessage({ type: 'value:set', scriptId, key: normalizedKey, value: storedValue });
      },
      deleteValue(state, sendMessage, scriptId, key) {
        const normalizedKey = String(key);
        state.delete(normalizedKey);
        sendMessage({ type: 'value:delete', scriptId, key: normalizedKey });
      },
      listValues(state) {
        return Array.from(state.keys());
      },
      callHandler(handler, value) {
        if (typeof handler !== 'function') return;
        try { handler(value); } catch { /* isolate callback failures */ }
      },
      normalizeXhrDetails(details) {
        if (!details || typeof details !== 'object' || Array.isArray(details)) {
          throw new TypeError('GM_xmlhttpRequest details must be an object');
        }
        const headers = {};
        if (details.headers !== undefined) {
          if (!details.headers || typeof details.headers !== 'object' || Array.isArray(details.headers)) {
            throw new TypeError('GM_xmlhttpRequest headers must be an object');
          }
          for (const [name, value] of Object.entries(details.headers)) headers[String(name)] = String(value);
        }
        const allowedResponseTypes = new Set(['', 'text', 'json', 'arraybuffer', 'blob', 'document']);
        const responseType = details.responseType === undefined ? '' : String(details.responseType).toLowerCase();
        return {
          method: details.method === undefined ? 'GET' : String(details.method),
          url: String(details.url || ''),
          headers,
          data: details.data === undefined || details.data === null ? null : String(details.data),
          responseType: allowedResponseTypes.has(responseType) ? responseType : '',
          timeout: Number.isSafeInteger(details.timeout) && details.timeout >= 0 ? details.timeout : 0,
          anonymous: details.anonymous === true,
        };
      },
      createXhr(sendMessage, pending, nextId, scriptId, details, modern) {
        const normalized = this.normalizeXhrDetails(details);
        const requestId = nextId('xhr');
        let resolvePromise;
        let rejectPromise;
        const promise = modern ? new Promise((resolve, reject) => {
          resolvePromise = resolve;
          rejectPromise = reject;
        }) : null;
        const abort = () => {
          if (!pending.has(requestId)) return;
          sendMessage({ type: 'xhr:abort', scriptId, requestId });
        };
        pending.set(requestId, { scriptId, details, resolvePromise, rejectPromise });
        const started = {
          finalUrl: normalized.url,
          readyState: 1,
          status: 0,
          statusText: '',
          responseHeaders: '',
          response: null,
          responseText: '',
          responseXML: null,
        };
        this.callHandler(details.onreadystatechange, started);
        this.callHandler(details.onloadstart, started);
        sendMessage({ type: 'xhr:start', scriptId, requestId, details: normalized });
        if (!modern) return Object.freeze({ abort });
        Object.defineProperty(promise, 'abort', { value: abort, enumerable: true });
        return promise;
      },
      xhrResponse(targetPage, snapshot) {
        const body = snapshot.body instanceof ArrayBuffer ? snapshot.body : new Uint8Array(snapshot.body || []).buffer;
        const text = new targetPage.TextDecoder().decode(body);
        let response = text;
        let responseXML = null;
        if (snapshot.responseType === 'json') {
          try { response = text.length > 0 ? JSON.parse(text) : null; } catch { response = null; }
        } else if (snapshot.responseType === 'arraybuffer') {
          response = body;
        } else if (snapshot.responseType === 'blob') {
          response = new targetPage.Blob([body]);
        } else if (snapshot.responseType === 'document') {
          responseXML = typeof targetPage.DOMParser === 'function'
            ? new targetPage.DOMParser().parseFromString(text, 'text/html')
            : null;
          response = responseXML;
        }
        return {
          finalUrl: snapshot.finalUrl,
          readyState: 4,
          status: snapshot.status,
          statusText: snapshot.statusText,
          responseHeaders: snapshot.responseHeaders,
          response,
          responseText: snapshot.responseType === 'arraybuffer' || snapshot.responseType === 'blob' ? '' : text,
          responseXML,
        };
      },
      handleXhrEvent(targetPage, pending, event) {
        const state = pending.get(event.requestId);
        if (!state) return;
        if (event.type === 'xhr:progress') {
          const progress = {
            lengthComputable: event.total > 0,
            loaded: event.loaded,
            total: event.total,
            readyState: 3,
            status: 0,
          };
          this.callHandler(state.details.onreadystatechange, progress);
          this.callHandler(state.details.onprogress, progress);
          return;
        }
        pending.delete(event.requestId);
        if (event.type === 'xhr:complete') {
          const response = this.xhrResponse(targetPage, event.response);
          this.callHandler(state.details.onreadystatechange, response);
          this.callHandler(state.details.onload, response);
          state.resolvePromise?.(response);
          return;
        }
        const failed = {
          finalUrl: '', readyState: 4, status: 0, statusText: '', responseHeaders: '',
          response: null, responseText: '', responseXML: null,
        };
        this.callHandler(state.details.onreadystatechange, failed);
        const callback = event.reason === 'abort'
          ? state.details.onabort
          : event.reason === 'timeout'
            ? state.details.ontimeout
            : state.details.onerror;
        this.callHandler(callback, failed);
        state.rejectPromise?.(new Error('GM.xmlHttpRequest failed: ' + event.reason));
      },
      createClipboard(sendMessage, pending, nextId, scriptId, data, info, callback, modern) {
        const requestId = nextId('clipboard');
        const dataType = info === 'html' || (info && typeof info === 'object' && info.type === 'html') ? 'html' : 'text';
        let resolvePromise;
        let rejectPromise;
        const promise = modern ? new Promise((resolve, reject) => {
          resolvePromise = resolve;
          rejectPromise = reject;
        }) : null;
        pending.set(requestId, { callback, resolvePromise, rejectPromise });
        sendMessage({ type: 'clipboard:set', scriptId, requestId, data: String(data), dataType });
        return promise;
      },
      handleClipboardEvent(pending, event) {
        const state = pending.get(event.requestId);
        if (!state) return;
        pending.delete(event.requestId);
        this.callHandler(state.callback, event.ok);
        if (event.ok) state.resolvePromise?.();
        else state.rejectPromise?.(new Error('GM.setClipboard failed'));
      },
      registerMenu(sendMessage, callbacks, nextId, scriptId, name, callback) {
        if (typeof callback !== 'function') throw new TypeError('GM_registerMenuCommand callback must be a function');
        const commandId = nextId('menu');
        callbacks.set(scriptId + '\\0' + commandId, callback);
        sendMessage({ type: 'menu:register', scriptId, commandId, name: String(name) });
        return commandId;
      },
      unregisterMenu(sendMessage, callbacks, scriptId, commandId) {
        const normalized = String(commandId);
        callbacks.delete(scriptId + '\\0' + normalized);
        sendMessage({ type: 'menu:unregister', scriptId, commandId: normalized });
      },
      handleMenuEvent(callbacks, event) {
        this.callHandler(callbacks.get(event.scriptId + '\\0' + event.commandId));
      },
      installUrlChange(targetPage) {
        if (!targetPage.location || !targetPage.history || typeof targetPage.addEventListener !== 'function') return;
        let handler = typeof targetPage.onurlchange === 'function' ? targetPage.onurlchange : null;
        try {
          Object.defineProperty(targetPage, 'onurlchange', {
            configurable: true,
            enumerable: true,
            get: () => handler,
            set: value => { handler = typeof value === 'function' ? value : null; },
          });
        } catch { /* keep an existing non-configurable property */ }
        let lastUrl = String(targetPage.location.href);
        const emit = () => {
          const url = String(targetPage.location.href);
          if (url === lastUrl) return;
          lastUrl = url;
          const event = typeof targetPage.Event === 'function' ? new targetPage.Event('urlchange') : { type: 'urlchange' };
          try { Object.defineProperty(event, 'url', { value: url, enumerable: true }); } catch { /* ignore */ }
          this.callHandler(targetPage.onurlchange, event);
          try { targetPage.dispatchEvent?.(event); } catch { /* ignore */ }
        };
        for (const methodName of ['pushState', 'replaceState']) {
          const original = targetPage.history[methodName];
          if (typeof original !== 'function') continue;
          targetPage.history[methodName] = function (...args) {
            const result = original.apply(this, args);
            emit();
            return result;
          };
        }
        targetPage.addEventListener('popstate', emit);
        targetPage.addEventListener('hashchange', emit);
      },
      asyncValue(operation, ...args) {
        return Promise.resolve(operation(...args));
      },
      asyncVoid(operation, ...args) {
        operation(...args);
        return Promise.resolve();
      },
    };
    const ${makeApi} = (descriptor) => {
      const state = new Map(descriptor.values.map(([key, value]) => [key, ${clone}(value)]));
      const info = Object.freeze({
        script: Object.freeze({
          name: descriptor.name,
          namespace: descriptor.namespace,
          description: descriptor.description,
          version: descriptor.version,
        }),
        scriptHandler: ${payload}.handlerName,
        version: ${payload}.handlerVersion,
      });
      const addStyle = Object.freeze(${helpers}.addStyle.bind(undefined, ${page}));
      const getValue = Object.freeze(${helpers}.getValue.bind(undefined, state, ${clone}));
      const setValue = Object.freeze(${helpers}.setValue.bind(undefined, state, ${clone}, ${send}, descriptor.id));
      const deleteValue = Object.freeze(${helpers}.deleteValue.bind(undefined, state, ${send}, descriptor.id));
      const listValues = Object.freeze(${helpers}.listValues.bind(undefined, state));
      const xmlHttpRequest = Object.freeze((details, modern = false) => (
        ${helpers}.createXhr(${send}, ${pendingXhr}, ${nextRequestId}, descriptor.id, details, modern)
      ));
      const setClipboard = Object.freeze(${helpers}.createClipboard.bind(${helpers}, ${send}, ${pendingClipboard}, ${nextRequestId}, descriptor.id));
      const registerMenuCommand = Object.freeze(${helpers}.registerMenu.bind(${helpers}, ${send}, ${menuCallbacks}, ${nextRequestId}, descriptor.id));
      const unregisterMenuCommand = Object.freeze(${helpers}.unregisterMenu.bind(${helpers}, ${send}, ${menuCallbacks}, descriptor.id));
      const modern = (
        descriptor.permissions.modernInfo
        || descriptor.permissions.modernAddStyle
        || descriptor.permissions.modernGetValue
        || descriptor.permissions.modernSetValue
        || descriptor.permissions.modernDeleteValue
        || descriptor.permissions.modernListValues
        || descriptor.permissions.modernXmlHttpRequest
        || descriptor.permissions.modernSetClipboard
        || descriptor.permissions.modernRegisterMenuCommand
        || descriptor.permissions.modernUnregisterMenuCommand
      ) ? Object.freeze({
        ...(descriptor.permissions.modernInfo ? { info } : {}),
        ...(descriptor.permissions.modernAddStyle ? {
          addStyle: Object.freeze(${helpers}.asyncValue.bind(undefined, addStyle)),
        } : {}),
        ...(descriptor.permissions.modernGetValue ? {
          getValue: Object.freeze(${helpers}.asyncValue.bind(undefined, getValue)),
        } : {}),
        ...(descriptor.permissions.modernSetValue ? {
          setValue: Object.freeze(${helpers}.asyncVoid.bind(undefined, setValue)),
        } : {}),
        ...(descriptor.permissions.modernDeleteValue ? {
          deleteValue: Object.freeze(${helpers}.asyncVoid.bind(undefined, deleteValue)),
        } : {}),
        ...(descriptor.permissions.modernListValues ? {
          listValues: Object.freeze(${helpers}.asyncValue.bind(undefined, listValues)),
        } : {}),
        ...(descriptor.permissions.modernXmlHttpRequest ? {
          xmlHttpRequest: Object.freeze(details => xmlHttpRequest(details, true)),
        } : {}),
        ...(descriptor.permissions.modernSetClipboard ? {
          setClipboard: Object.freeze((data, info) => setClipboard(data, info, undefined, true)),
        } : {}),
        ...(descriptor.permissions.modernRegisterMenuCommand ? { registerMenuCommand } : {}),
        ...(descriptor.permissions.modernUnregisterMenuCommand ? { unregisterMenuCommand } : {}),
      }) : undefined;
      return [
        modern,
        descriptor.permissions.classicInfo ? info : undefined,
        descriptor.permissions.classicAddStyle ? addStyle : undefined,
        descriptor.permissions.classicGetValue ? getValue : undefined,
        descriptor.permissions.classicSetValue ? setValue : undefined,
        descriptor.permissions.classicDeleteValue ? deleteValue : undefined,
        descriptor.permissions.classicListValues ? listValues : undefined,
        descriptor.permissions.classicXmlHttpRequest ? xmlHttpRequest : undefined,
        descriptor.permissions.classicSetClipboard ? setClipboard : undefined,
        descriptor.permissions.classicRegisterMenuCommand ? registerMenuCommand : undefined,
        descriptor.permissions.classicUnregisterMenuCommand ? unregisterMenuCommand : undefined,
        descriptor.permissions.unsafeWindow ? ${page} : undefined,
      ];
    };
    ${channel}.port1.onmessage = (event) => {
      const message = event?.data;
      if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;
      if (message.type === 'xhr:progress' || message.type === 'xhr:complete' || message.type === 'xhr:failed') {
        ${helpers}.handleXhrEvent(${page}, ${pendingXhr}, message);
      } else if (message.type === 'clipboard:result') {
        ${helpers}.handleClipboardEvent(${pendingClipboard}, message);
      } else if (message.type === 'menu:invoke') {
        ${helpers}.handleMenuEvent(${menuCallbacks}, message);
      }
    };
    if (${payload}.scripts.some(descriptor => descriptor.permissions.urlChange)) {
      ${helpers}.installUrlChange(${page});
    }
    ${runs}
  `
  return new Function(payload, body) as UserScriptMainWorldExecution['func']
}

function resolvePermissions(grants: readonly string[]): GrantPermissions {
  const set = new Set(grants)
  const has = (name: string): boolean => !set.has('none') && set.has(name)
  return {
    classicInfo: has('GM_info'),
    classicAddStyle: has('GM_addStyle'),
    classicGetValue: has('GM_getValue'),
    classicSetValue: has('GM_setValue'),
    classicDeleteValue: has('GM_deleteValue'),
    classicListValues: has('GM_listValues'),
    modernInfo: has('GM.info'),
    modernAddStyle: has('GM.addStyle'),
    modernGetValue: has('GM.getValue'),
    modernSetValue: has('GM.setValue'),
    modernDeleteValue: has('GM.deleteValue'),
    modernListValues: has('GM.listValues'),
    classicXmlHttpRequest: has('GM_xmlhttpRequest'),
    classicSetClipboard: has('GM_setClipboard'),
    classicRegisterMenuCommand: has('GM_registerMenuCommand'),
    classicUnregisterMenuCommand: has('GM_unregisterMenuCommand'),
    modernXmlHttpRequest: has('GM.xmlHttpRequest'),
    modernSetClipboard: has('GM.setClipboard'),
    modernRegisterMenuCommand: has('GM.registerMenuCommand'),
    modernUnregisterMenuCommand: has('GM.unregisterMenuCommand'),
    urlChange: has('window.onurlchange'),
    unsafeWindow: has('unsafeWindow'),
  }
}

function normalizeValues(values: UserScriptMainWorldScript['values']): Array<[string, unknown]> {
  if (values === undefined) return []
  const keys = new Set<string>()
  return values.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
      throw new TypeError('Userscript value snapshots must be [string, value] tuples')
    }
    const [key, value] = entry
    if (keys.has(key)) throw new TypeError(`Duplicate userscript value key: ${key}`)
    keys.add(key)
    return [key, cloneJson(value)]
  })
}

function cloneJson(value: unknown): unknown {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new TypeError('Userscript values must be JSON serializable')
  return JSON.parse(serialized) as unknown
}

function optionalString(value: string | null | undefined): string | null {
  return typeof value === 'string' ? value : null
}

function normalizeRunAt(
  value: UserScriptMainWorldScript['runAt'],
): 'document-start' | 'document-end' | 'document-idle' {
  if (value === 'document-end' || value === 'document-idle') return value
  return 'document-start'
}

function requireString(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.trim().length === 0)) {
    throw new TypeError(`${field} must be a ${allowEmpty ? '' : 'non-empty '}string of at most ${max} characters`)
  }
  return value
}

function requireExactOrigin(value: unknown): string {
  const origin = requireString(value, 'targetOrigin', 2_048)
  if (origin === '*') throw new TypeError('targetOrigin must not be a wildcard')
  let parsed: URL
  try { parsed = new URL(origin) }
  catch { throw new TypeError('targetOrigin must be a valid origin') }
  if (parsed.origin !== origin || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
    throw new TypeError('targetOrigin must be an exact HTTP(S) origin')
  }
  return origin
}

function runtimePrefix(): string {
  runtimeSequence += 1
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '')
    ?? Math.random().toString(36).slice(2)
  return `__algoUserscript${runtimeSequence.toString(36)}${random}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
