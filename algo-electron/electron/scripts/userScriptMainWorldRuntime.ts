import { USER_SCRIPT_RUNTIME_HANDOFF_KIND } from './userScriptRuntimeProtocol'

export const USER_SCRIPT_MAIN_WORLD_PARAMETER_NAMES = [
  'GM',
  'GM_info',
  'GM_addStyle',
  'GM_getValue',
  'GM_setValue',
  'GM_deleteValue',
  'GM_listValues',
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
      const modern = (
        descriptor.permissions.modernInfo
        || descriptor.permissions.modernAddStyle
        || descriptor.permissions.modernGetValue
        || descriptor.permissions.modernSetValue
        || descriptor.permissions.modernDeleteValue
        || descriptor.permissions.modernListValues
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
      }) : undefined;
      return [
        modern,
        descriptor.permissions.classicInfo ? info : undefined,
        descriptor.permissions.classicAddStyle ? addStyle : undefined,
        descriptor.permissions.classicGetValue ? getValue : undefined,
        descriptor.permissions.classicSetValue ? setValue : undefined,
        descriptor.permissions.classicDeleteValue ? deleteValue : undefined,
        descriptor.permissions.classicListValues ? listValues : undefined,
        descriptor.permissions.unsafeWindow ? ${page} : undefined,
      ];
    };
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
