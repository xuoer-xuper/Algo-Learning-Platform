export const USER_SCRIPT_RUNTIME_INIT_CHANNEL = 'userscript-runtime:init'
export const USER_SCRIPT_RUNTIME_PORT_CHANNEL = 'userscript-runtime:port'
export const USER_SCRIPT_RUNTIME_HANDOFF_KIND = '__algo_userscript_runtime_port_v1'

export const USER_SCRIPT_RUNTIME_NONCE_PATTERN = /^[a-f0-9]{32}$/
export const USER_SCRIPT_RUNTIME_MAX_KEY_LENGTH = 512
export const USER_SCRIPT_RUNTIME_MAX_VALUE_BYTES = 1024 * 1024
export const USER_SCRIPT_RUNTIME_MAX_SOURCE_BYTES = 4 * 1024 * 1024
export const USER_SCRIPT_RUNTIME_MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024

export interface UserScriptRuntimeInitRequest {
  nonce: string
  frameUrl: string
  isMainFrame: boolean
}

export interface UserScriptRuntimeScriptSnapshot {
  id: string
  name: string
  namespace: string | null
  description: string | null
  version: string | null
  runAt: 'document-start' | 'document-end' | 'document-idle'
  grants: string[]
  values: Array<[string, unknown]>
  code: string
}

export interface UserScriptRuntimeBootstrapSnapshot {
  ok: true
  nonce: string
  generation: number
  scripts: UserScriptRuntimeScriptSnapshot[]
}

export interface UserScriptRuntimeBootstrapRejected {
  ok: false
}

export type UserScriptRuntimeBootstrapResponse =
  | UserScriptRuntimeBootstrapSnapshot
  | UserScriptRuntimeBootstrapRejected

export interface UserScriptRuntimePortRequest {
  nonce: string
  frameUrl: string
}

export type UserScriptRuntimeMutation =
  | {
      type: 'value:set'
      scriptId: string
      key: string
      value: unknown
    }
  | {
      type: 'value:delete'
      scriptId: string
      key: string
    }

export function isUserScriptRuntimeInitRequest(value: unknown): value is UserScriptRuntimeInitRequest {
  if (!isPlainRecord(value)) return false
  if (!hasExactKeys(value, ['frameUrl', 'isMainFrame', 'nonce'])) return false
  return typeof value.nonce === 'string'
    && USER_SCRIPT_RUNTIME_NONCE_PATTERN.test(value.nonce)
    && typeof value.frameUrl === 'string'
    && value.frameUrl.length <= 8_192
    && typeof value.isMainFrame === 'boolean'
}

export function isUserScriptRuntimePortRequest(value: unknown): value is UserScriptRuntimePortRequest {
  if (!isPlainRecord(value)) return false
  if (!hasExactKeys(value, ['frameUrl', 'nonce'])) return false
  return typeof value.nonce === 'string'
    && USER_SCRIPT_RUNTIME_NONCE_PATTERN.test(value.nonce)
    && typeof value.frameUrl === 'string'
    && value.frameUrl.length <= 8_192
}

export function parseUserScriptRuntimeMutation(value: unknown): UserScriptRuntimeMutation | null {
  if (!isPlainRecord(value) || typeof value.type !== 'string') return null
  if (value.type === 'value:delete') {
    if (!hasExactKeys(value, ['key', 'scriptId', 'type'])) return null
    if (!isRuntimeIdentifier(value.scriptId) || !isRuntimeKey(value.key)) return null
    return { type: value.type, scriptId: value.scriptId, key: value.key }
  }
  if (value.type === 'value:set') {
    if (!hasExactKeys(value, ['key', 'scriptId', 'type', 'value'])) return null
    if (!isRuntimeIdentifier(value.scriptId) || !isRuntimeKey(value.key)) return null
    if (!isJsonSafeRuntimeValue(value.value)) return null
    return { type: value.type, scriptId: value.scriptId, key: value.key, value: value.value }
  }
  return null
}

function isRuntimeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
}

function isRuntimeKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= USER_SCRIPT_RUNTIME_MAX_KEY_LENGTH
}

function isJsonSafeRuntimeValue(value: unknown): boolean {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return false
  }
  try {
    const serialized = JSON.stringify(value)
    return serialized !== undefined
      && new TextEncoder().encode(serialized).byteLength <= USER_SCRIPT_RUNTIME_MAX_VALUE_BYTES
  }
  catch {
    return false
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}
