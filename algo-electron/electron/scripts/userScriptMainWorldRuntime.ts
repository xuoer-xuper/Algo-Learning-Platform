import { errorMessage } from '../shared/errors'

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
  'GM_getResourceText',
  'GM_getResourceURL',
  'unsafeWindow',
] as const

export interface UserScriptMainWorldScript {
  id: string
  revision?: string
  name: string
  namespace?: string | null
  description?: string | null
  version?: string | null
  runAt?: 'document-start' | 'document-end' | 'document-idle'
  source: string
  grants: readonly string[]
  values?: ReadonlyArray<readonly [string, unknown]>
  resources?: readonly UserScriptMainWorldResource[]
}

export interface UserScriptMainWorldResource {
  name: string
  contentType: string | null
  dataBase64: string
}

export interface UserScriptMainWorldBuildInput {
  handshakeId: string
  targetOrigin: string
  generation: number
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
  classicGetResourceText: boolean
  classicGetResourceUrl: boolean
  modernXmlHttpRequest: boolean
  modernSetClipboard: boolean
  modernRegisterMenuCommand: boolean
  modernUnregisterMenuCommand: boolean
  modernGetResourceText: boolean
  modernGetResourceUrl: boolean
  urlChange: boolean
  unsafeWindow: boolean
}

interface ScriptDescriptor {
  id: string
  revision: string
  name: string
  namespace: string | null
  description: string | null
  version: string | null
  runAt: 'document-start' | 'document-end' | 'document-idle'
  permissions: GrantPermissions
  values: Array<[string, unknown]>
  resources: UserScriptMainWorldResource[]
}

interface ExecutionPayload {
  handshakeId: string
  targetOrigin: string
  generation: number
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
  func: (
    payload: ExecutionPayload,
    body: string,
    sendMessageOrPort: ((message: unknown) => void) | MessagePort,
    subscribe?: (listener: (message: unknown) => void) => void,
  ) => void
  args: [ExecutionPayload, string]
}

export interface UserScriptMainWorldBuildResult {
  execution: UserScriptMainWorldExecution
  rejectedScripts: UserScriptMainWorldRejectedScript[]
}

interface CompiledScript {
  descriptor: ScriptDescriptor
  functionSource: string
  deferredSource: boolean
}

let runtimeSequence = 0

export function buildUserScriptMainWorldRuntime(
  input: UserScriptMainWorldBuildInput,
): UserScriptMainWorldBuildResult {
  const handshakeId = requireString(input.handshakeId, 'handshakeId', 200)
  const targetOrigin = requireExactOrigin(input.targetOrigin)
  const generation = requireGeneration(input.generation)
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

    let descriptor: ScriptDescriptor | null = null
    try {
      descriptor = {
        id,
        revision: requireString(script.revision ?? `initial:${id}`, 'script.revision', 200),
        name,
        namespace: optionalString(script.namespace),
        description: optionalString(script.description),
        version: optionalString(script.version),
        runAt: normalizeRunAt(script.runAt),
        permissions: resolvePermissions(script.grants),
        values: normalizeValues(script.values),
        resources: normalizeResources(script.resources),
      }
      const compiled = new Function(
        ...USER_SCRIPT_MAIN_WORLD_PARAMETER_NAMES,
        `"use strict";\n${script.source}\n`,
      )
      compiledScripts.push({ descriptor, functionSource: compiled.toString(), deferredSource: false })
    }
    catch (error) {
      if (error instanceof EvalError && descriptor) {
        compiledScripts.push({ descriptor, functionSource: script.source, deferredSource: true })
      } else {
        rejectedScripts.push({ id, name, reason: errorMessage(error) })
      }
    }
  }

  const payload: ExecutionPayload = {
    handshakeId,
    targetOrigin,
    generation,
    handlerName,
    handlerVersion,
    // Resources already live in the compiled catalog entry. Keeping them out
    // of the candidate payload avoids duplicating large base64 blobs.
    scripts: compiledScripts.map(script => ({ ...script.descriptor, resources: [] })),
  }
  return {
    execution: { func: createExecutionFunction(compiledScripts), args: [payload, createExecutionBody(compiledScripts)] },
    rejectedScripts,
  }
}

function createExecutionBody(scripts: readonly CompiledScript[]): string {
  const prefix = runtimePrefix()
  const payload = `${prefix}Payload`
  const page = `${prefix}Window`
  const send = `${prefix}Send`
  const subscribe = `${prefix}Subscribe`
  const clone = `${prefix}Clone`
  const helpers = `${prefix}Helpers`
  const makeApi = `${prefix}MakeApi`
  const pendingXhr = `${prefix}PendingXhr`
  const pendingClipboard = `${prefix}PendingClipboard`
  const menuCallbacks = `${prefix}MenuCallbacks`
  const requestSequence = `${prefix}RequestSequence`
  const nextRequestId = `${prefix}NextRequestId`
  const lifecycle = `${prefix}Lifecycle`
  const flushLifecycle = `${prefix}FlushLifecycle`
  const scriptStates = `${prefix}ScriptStates`
  const executedScripts = `${prefix}ExecutedScripts`
  const scheduleScript = `${prefix}ScheduleScript`
  const deactivateScript = `${prefix}DeactivateScript`
  const catalog = `${prefix}Catalog`
  const scheduleCatalogScript = `${prefix}ScheduleCatalogScript`
  const catalogEntries = scripts.map((script) => {
    const executable = script.deferredSource
      ? `new Function(...${JSON.stringify(USER_SCRIPT_MAIN_WORLD_PARAMETER_NAMES)}, ${JSON.stringify(`"use strict";\n${script.functionSource}\n`)})`
      : `(${script.functionSource})`
    return `[${JSON.stringify(scriptKey(script.descriptor))},{descriptor:${JSON.stringify(script.descriptor)},executable:${executable}}]`
  }).join(',')

  const body = `
    "use strict";
    const ${payload} = payloadArg;
    const ${send} = sendArg;
    const ${subscribe} = subscribeArg;
    const ${page} = globalThis;
    if (typeof ${send} !== 'function' || typeof ${subscribe} !== 'function') return;
    const ${pendingXhr} = new Map();
    const ${pendingClipboard} = new Map();
    const ${menuCallbacks} = new Map();
    const ${scriptStates} = new Map();
    const ${executedScripts} = new Set();
    const ${catalog} = new Map([${catalogEntries}]);
    let ${requestSequence} = 0;
    const ${nextRequestId} = (kind) => kind + '-' + (++${requestSequence});
    const ${lifecycle} = {
      status: 'pending',
      endReached: ${page}.document?.readyState !== 'loading',
      idleReached: false,
      endRuns: [],
      idleRuns: [],
      urlChangeInstalled: false,
    };
    const ${flushLifecycle} = () => {
      if (${lifecycle}.status === 'invalid') return;
      if (${lifecycle}.endReached && (${lifecycle}.status === 'pending' || ${lifecycle}.status === 'active')) {
        for (const entry of ${lifecycle}.endRuns.splice(0)) entry.run();
      }
      if (${lifecycle}.idleReached && ${lifecycle}.status === 'active') {
        ${lifecycle}.endReached = true;
        for (const entry of ${lifecycle}.endRuns.splice(0)) entry.run();
        for (const entry of ${lifecycle}.idleRuns.splice(0)) entry.run();
      }
    };
    if (!${lifecycle}.endReached && ${page}.document?.addEventListener) {
      ${page}.document.addEventListener('DOMContentLoaded', () => {
        ${lifecycle}.endReached = true;
        ${flushLifecycle}();
      }, { once: true });
    }
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
      getResource(resources, name) {
        const resource = resources.get(String(name));
        if (!resource) throw new Error('Unknown userscript resource: ' + String(name));
        return resource;
      },
      getResourceText(targetPage, resources, name) {
        const resource = this.getResource(resources, name);
        if (resource.text === undefined) {
          const binary = targetPage.atob(resource.dataBase64);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
          resource.text = new targetPage.TextDecoder().decode(bytes);
        }
        return resource.text;
      },
      getResourceUrl(resources, name) {
        const resource = this.getResource(resources, name);
        return 'data:' + (resource.contentType || 'application/octet-stream') + ';base64,' + resource.dataBase64;
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
        pending.set(requestId, { scriptId, callback, resolvePromise, rejectPromise });
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
      permissions(grants) {
        const set = new Set(grants);
        const has = (name) => !set.has('none') && set.has(name);
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
          classicGetResourceText: has('GM_getResourceText'),
          classicGetResourceUrl: has('GM_getResourceURL'),
          modernXmlHttpRequest: has('GM.xmlHttpRequest'),
          modernSetClipboard: has('GM.setClipboard'),
          modernRegisterMenuCommand: has('GM.registerMenuCommand'),
          modernUnregisterMenuCommand: has('GM.unregisterMenuCommand'),
          modernGetResourceText: has('GM.getResourceText'),
          modernGetResourceUrl: has('GM.getResourceUrl') || has('GM.getResourceURL'),
          urlChange: has('window.onurlchange'),
          unsafeWindow: has('unsafeWindow'),
        };
      },
      compileCandidate(candidate) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
        if (typeof candidate.id !== 'string' || candidate.id.length === 0 || candidate.id.length > 200) return null;
        if (typeof candidate.revision !== 'string' || candidate.revision.length === 0 || candidate.revision.length > 200) return null;
        if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0 || candidate.name.length > 500) return null;
        if (typeof candidate.code !== 'string' || candidate.code.length > 4 * 1024 * 1024) return null;
        if (!Array.isArray(candidate.grants) || candidate.grants.some(grant => typeof grant !== 'string')) return null;
        if (!Array.isArray(candidate.values)) return null;
        if (candidate.resources !== undefined && !Array.isArray(candidate.resources)) return null;
        const values = [];
        const valueKeys = new Set();
        for (const entry of candidate.values) {
          if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || valueKeys.has(entry[0])) return null;
          valueKeys.add(entry[0]);
          values.push([entry[0], ${clone}(entry[1])]);
        }
        const resources = [];
        const resourceNames = new Set();
        for (const resource of candidate.resources || []) {
          if (!resource || typeof resource !== 'object' || Array.isArray(resource)) return null;
          if (typeof resource.name !== 'string' || resource.name.length === 0 || resourceNames.has(resource.name)) return null;
          if (resource.contentType !== null && typeof resource.contentType !== 'string') return null;
          if (typeof resource.dataBase64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(resource.dataBase64)) return null;
          resourceNames.add(resource.name);
          resources.push({ name: resource.name, contentType: resource.contentType, dataBase64: resource.dataBase64 });
        }
        if (candidate.runAt !== 'document-start' && candidate.runAt !== 'document-end' && candidate.runAt !== 'document-idle') return null;
        const descriptor = {
          id: candidate.id,
          revision: candidate.revision,
          name: candidate.name,
          namespace: typeof candidate.namespace === 'string' ? candidate.namespace : null,
          description: typeof candidate.description === 'string' ? candidate.description : null,
          version: typeof candidate.version === 'string' ? candidate.version : null,
          runAt: candidate.runAt,
          permissions: this.permissions(candidate.grants),
          values,
          resources,
        };
        try {
          const executable = new Function(
            ...${JSON.stringify(USER_SCRIPT_MAIN_WORLD_PARAMETER_NAMES)},
            '"use strict";\\n' + candidate.code + '\\n',
          );
          return { descriptor, executable };
        } catch { return null; }
      },
      installUrlChange(targetPage) {
        if (${lifecycle}.urlChangeInstalled) return;
        if (!targetPage.location || !targetPage.history || typeof targetPage.addEventListener !== 'function') return;
        ${lifecycle}.urlChangeInstalled = true;
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
      const resources = new Map(descriptor.resources.map(resource => [resource.name, { ...resource }]));
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
      const getResourceText = Object.freeze(${helpers}.getResourceText.bind(${helpers}, ${page}, resources));
      const getResourceUrl = Object.freeze(${helpers}.getResourceUrl.bind(${helpers}, resources));
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
        || descriptor.permissions.modernGetResourceText
        || descriptor.permissions.modernGetResourceUrl
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
        ...(descriptor.permissions.modernGetResourceText ? {
          getResourceText: Object.freeze(${helpers}.asyncValue.bind(undefined, getResourceText)),
        } : {}),
        ...(descriptor.permissions.modernGetResourceUrl ? {
          getResourceUrl: Object.freeze(${helpers}.asyncValue.bind(undefined, getResourceUrl)),
        } : {}),
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
        descriptor.permissions.classicGetResourceText ? getResourceText : undefined,
        descriptor.permissions.classicGetResourceUrl ? getResourceUrl : undefined,
        descriptor.permissions.unsafeWindow ? ${page} : undefined,
      ];
    };
    const ${scheduleScript} = (descriptor, executable) => {
      if (${lifecycle}.status === 'invalid') return;
      const current = ${scriptStates}.get(descriptor.id);
      if (current && current.revision === descriptor.revision) return;
      ${scriptStates}.set(descriptor.id, { revision: descriptor.revision });
      const executionKey = descriptor.id + '\\0' + descriptor.revision;
      const api = ${makeApi}(descriptor);
      const run = () => {
        const active = ${scriptStates}.get(descriptor.id);
        if (
          ${lifecycle}.status === 'invalid'
          || (
            ${lifecycle}.status !== 'active'
            && !(descriptor.runAt === 'document-start'
              || (descriptor.runAt === 'document-end' && ${lifecycle}.endReached))
          )
          || !active
          || active.revision !== descriptor.revision
          || ${executedScripts}.has(executionKey)
        ) return;
        ${executedScripts}.add(executionKey);
        try { executable.call(${page}, ...api); }
        catch { /* isolate one script without leaking source or error text */ }
      };
      const entry = { scriptId: descriptor.id, revision: descriptor.revision, run };
      if (descriptor.permissions.urlChange) ${helpers}.installUrlChange(${page});
      if (descriptor.runAt === 'document-start') run();
      else if (descriptor.runAt === 'document-end') ${lifecycle}.endRuns.push(entry);
      else ${lifecycle}.idleRuns.push(entry);
      ${flushLifecycle}();
    };
  const ${scheduleCatalogScript} = (candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return;
      if (typeof candidate.id !== 'string' || candidate.id.length === 0 || candidate.id.length > 200) return;
      if (typeof candidate.revision !== 'string' || candidate.revision.length === 0 || candidate.revision.length > 200) return;
      const entry = ${catalog}.get(candidate.id + '\\0' + candidate.revision);
      if (!entry) {
        const fallback = ${helpers}.compileCandidate(candidate);
        if (fallback) ${scheduleScript}(fallback.descriptor, fallback.executable);
        return;
      }
      if (!Array.isArray(candidate.values)) return;
      const values = [];
      const valueKeys = new Set();
      for (const value of candidate.values) {
        if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'string' || valueKeys.has(value[0])) return;
        valueKeys.add(value[0]);
        values.push([value[0], ${clone}(value[1])]);
      }
      const descriptor = { ...entry.descriptor, values };
      ${scheduleScript}(descriptor, entry.executable);
    };
    const ${deactivateScript} = (scriptId) => {
      if (typeof scriptId !== 'string') return;
      ${scriptStates}.delete(scriptId);
      ${lifecycle}.endRuns = ${lifecycle}.endRuns.filter(entry => entry.scriptId !== scriptId);
      ${lifecycle}.idleRuns = ${lifecycle}.idleRuns.filter(entry => entry.scriptId !== scriptId);
      for (const [requestId, state] of ${pendingXhr}) {
        if (state.scriptId === scriptId) ${pendingXhr}.delete(requestId);
      }
      for (const [requestId, state] of ${pendingClipboard}) {
        if (state.scriptId === scriptId) ${pendingClipboard}.delete(requestId);
      }
      for (const key of ${menuCallbacks}.keys()) {
        if (key.startsWith(scriptId + '\\0')) ${menuCallbacks}.delete(key);
      }
    };
    ${subscribe}((message) => {
      if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;
      if (message.type === 'runtime:ready' && message.generation === ${payload}.generation) {
        if (${lifecycle}.status === 'pending') {
          ${lifecycle}.status = 'active';
          ${flushLifecycle}();
        }
      } else if (message.type === 'runtime:phase'
        && message.generation === ${payload}.generation
        && message.phase === 'document-idle') {
        ${lifecycle}.idleReached = true;
        ${flushLifecycle}();
      } else if (message.type === 'runtime:invalidate' && message.generation === ${payload}.generation) {
        ${lifecycle}.status = 'invalid';
        ${lifecycle}.endRuns.length = 0;
        ${lifecycle}.idleRuns.length = 0;
        ${scriptStates}.clear();
        ${menuCallbacks}.clear();
      } else if (message.type === 'runtime:sync' && message.generation === ${payload}.generation) {
        let sameOrigin = false;
        try { sameOrigin = new URL(message.frameUrl).origin === ${payload}.targetOrigin; }
        catch { /* reject malformed sync URLs */ }
        if (!sameOrigin || !Array.isArray(message.scripts) || !Array.isArray(message.inactiveScriptIds)) return;
        for (const scriptId of message.inactiveScriptIds) ${deactivateScript}(scriptId);
        for (const candidate of message.scripts) {
          ${scheduleCatalogScript}(candidate);
        }
      } else if (message.type === 'xhr:progress' || message.type === 'xhr:complete' || message.type === 'xhr:failed') {
        ${helpers}.handleXhrEvent(${page}, ${pendingXhr}, message);
      } else if (message.type === 'clipboard:result') {
        ${helpers}.handleClipboardEvent(${pendingClipboard}, message);
      } else if (message.type === 'menu:invoke') {
        ${helpers}.handleMenuEvent(${menuCallbacks}, message);
      }
    });
    for (const candidate of ${payload}.scripts) ${scheduleCatalogScript}(candidate);
  `
  return body
}

function executeSerializedRuntime(
  payload: ExecutionPayload,
  body: string,
  sendMessageOrPort: ((message: unknown) => void) | MessagePort,
  subscribe?: (listener: (message: unknown) => void) => void,
): void {
  let sendMessage: (message: unknown) => void
  if (typeof sendMessageOrPort === 'function') {
    sendMessage = sendMessageOrPort
  } else if (sendMessageOrPort && typeof sendMessageOrPort.postMessage === 'function') {
    sendMessage = message => sendMessageOrPort.postMessage(message)
    subscribe ??= listener => {
      sendMessageOrPort.addEventListener('message', event => listener(event.data))
      sendMessageOrPort.start()
    }
  } else {
    return
  }
  if (typeof subscribe !== 'function') return
  const execute = new Function('payloadArg', 'sendArg', 'subscribeArg', body) as (
    payload: ExecutionPayload,
    sendMessage: (message: unknown) => void,
    subscribe: (listener: (message: unknown) => void) => void,
  ) => void
  execute(payload, sendMessage, subscribe)
}

function createExecutionFunction(_scripts: readonly CompiledScript[]): UserScriptMainWorldExecution['func'] {
  return executeSerializedRuntime as UserScriptMainWorldExecution['func']
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
    classicGetResourceText: has('GM_getResourceText'),
    classicGetResourceUrl: has('GM_getResourceURL'),
    modernGetResourceText: has('GM.getResourceText'),
    modernGetResourceUrl: has('GM.getResourceUrl') || has('GM.getResourceURL'),
    urlChange: has('window.onurlchange'),
    unsafeWindow: has('unsafeWindow'),
  }
}

function normalizeResources(
  resources: UserScriptMainWorldScript['resources'],
): UserScriptMainWorldResource[] {
  if (resources === undefined) return []
  const names = new Set<string>()
  return resources.map((resource) => {
    const name = requireString(resource?.name, 'resource.name', 512)
    if (names.has(name)) throw new TypeError(`Duplicate userscript resource name: ${name}`)
    names.add(name)
    if (resource.contentType !== null && typeof resource.contentType !== 'string') {
      throw new TypeError('Userscript resource contentType must be a string or null')
    }
    if (typeof resource.dataBase64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(resource.dataBase64)) {
      throw new TypeError('Userscript resource data must be base64')
    }
    return {
      name,
      contentType: resource.contentType,
      dataBase64: resource.dataBase64,
    }
  })
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

function scriptKey(script: Pick<ScriptDescriptor, 'id' | 'revision'>): string {
  return `${script.id}\u0000${script.revision}`
}

function normalizeRunAt(
  value: UserScriptMainWorldScript['runAt'],
): 'document-start' | 'document-end' | 'document-idle' {
  if (value === 'document-end' || value === 'document-idle') return value
  return 'document-start'
}

function requireGeneration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('generation must be a non-negative safe integer')
  }
  return value
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
