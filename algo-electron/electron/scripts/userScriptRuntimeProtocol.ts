export const USER_SCRIPT_RUNTIME_INIT_CHANNEL = 'userscript-runtime:init'
export const USER_SCRIPT_RUNTIME_PORT_CHANNEL = 'userscript-runtime:port'

export const USER_SCRIPT_RUNTIME_NONCE_PATTERN = /^[a-f0-9]{32}$/
export const USER_SCRIPT_RUNTIME_MAX_KEY_LENGTH = 512
export const USER_SCRIPT_RUNTIME_MAX_VALUE_BYTES = 1024 * 1024
export const USER_SCRIPT_RUNTIME_MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024
export const USER_SCRIPT_RUNTIME_MAX_RESPONSE_BYTES = 16 * 1024 * 1024
export const USER_SCRIPT_RUNTIME_MAX_SOURCE_BYTES = 4 * 1024 * 1024
export const USER_SCRIPT_RUNTIME_MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024
export const USER_SCRIPT_RUNTIME_MAX_TIMEOUT_MS = 120_000

export interface UserScriptRuntimeInitRequest {
  nonce: string
  frameUrl: string
  isMainFrame: boolean
}

export interface UserScriptRuntimeScriptSnapshot {
  id: string
  revision: string
  name: string
  namespace: string | null
  description: string | null
  version: string | null
  runAt: 'document-start' | 'document-end' | 'document-idle'
  grants: string[]
  connects: string[]
  values: Array<[string, unknown]>
  resources: UserScriptRuntimeResourceSnapshot[]
  code: string
}

export interface UserScriptRuntimeResourceSnapshot {
  name: string
  contentType: string | null
  dataBase64: string
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
  generation: number
}

export interface UserScriptRuntimeSyncEvent {
  type: 'runtime:sync'
  generation: number
  frameUrl: string
  scripts: UserScriptRuntimeScriptSnapshot[]
  inactiveScriptIds: string[]
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

export type UserScriptXhrResponseType = '' | 'text' | 'json' | 'arraybuffer' | 'blob' | 'document'

export interface UserScriptXhrRequestDetails {
  method: string
  url: string
  headers: Record<string, string>
  data: string | null
  responseType: UserScriptXhrResponseType
  timeout: number
  anonymous: boolean
}

export type UserScriptRuntimeCommand =
  | UserScriptRuntimeMutation
  | {
      type: 'xhr:start'
      scriptId: string
      requestId: string
      details: UserScriptXhrRequestDetails
    }
  | {
      type: 'xhr:abort'
      scriptId: string
      requestId: string
    }
  | {
      type: 'clipboard:set'
      scriptId: string
      requestId: string
      data: string
      dataType: 'text' | 'html'
    }
  | {
      type: 'menu:register'
      scriptId: string
      commandId: string
      name: string
    }
  | {
      type: 'menu:unregister'
      scriptId: string
      commandId: string
    }

export interface UserScriptXhrResponseSnapshot {
  finalUrl: string
  status: number
  statusText: string
  responseHeaders: string
  responseType: UserScriptXhrResponseType
  body: ArrayBuffer
}

export type UserScriptRuntimeEvent =
  | { type: 'runtime:ready'; generation: number }
  | { type: 'runtime:phase'; generation: number; phase: 'document-idle' }
  | { type: 'runtime:invalidate'; generation: number }
  | UserScriptRuntimeSyncEvent
  | { type: 'xhr:progress'; requestId: string; loaded: number; total: number }
  | { type: 'xhr:complete'; requestId: string; response: UserScriptXhrResponseSnapshot }
  | { type: 'xhr:failed'; requestId: string; reason: 'abort' | 'error' | 'timeout' | 'denied' }
  | { type: 'clipboard:result'; requestId: string; ok: boolean }
  | { type: 'menu:invoke'; scriptId: string; commandId: string }

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
  if (!hasExactKeys(value, ['frameUrl', 'generation', 'nonce'])) return false
  return typeof value.nonce === 'string'
    && USER_SCRIPT_RUNTIME_NONCE_PATTERN.test(value.nonce)
    && typeof value.frameUrl === 'string'
    && value.frameUrl.length <= 8_192
    && typeof value.generation === 'number'
    && Number.isSafeInteger(value.generation)
    && value.generation >= 0
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

export function parseUserScriptRuntimeCommand(value: unknown): UserScriptRuntimeCommand | null {
  const mutation = parseUserScriptRuntimeMutation(value)
  if (mutation) return mutation
  if (!isPlainRecord(value) || typeof value.type !== 'string') return null

  if (value.type === 'xhr:start') {
    if (!hasExactKeys(value, ['details', 'requestId', 'scriptId', 'type'])) return null
    if (!isRuntimeIdentifier(value.scriptId) || !isRequestId(value.requestId)) return null
    const details = parseXhrRequestDetails(value.details)
    return details ? { type: value.type, scriptId: value.scriptId, requestId: value.requestId, details } : null
  }
  if (value.type === 'xhr:abort') {
    if (!hasExactKeys(value, ['requestId', 'scriptId', 'type'])) return null
    return isRuntimeIdentifier(value.scriptId) && isRequestId(value.requestId)
      ? { type: value.type, scriptId: value.scriptId, requestId: value.requestId }
      : null
  }
  if (value.type === 'clipboard:set') {
    if (!hasExactKeys(value, ['data', 'dataType', 'requestId', 'scriptId', 'type'])) return null
    if (!isRuntimeIdentifier(value.scriptId) || !isRequestId(value.requestId)) return null
    if (value.dataType !== 'text' && value.dataType !== 'html') return null
    if (typeof value.data !== 'string' || byteLength(value.data) > USER_SCRIPT_RUNTIME_MAX_VALUE_BYTES) return null
    return {
      type: value.type,
      scriptId: value.scriptId,
      requestId: value.requestId,
      data: value.data,
      dataType: value.dataType,
    }
  }
  if (value.type === 'menu:register') {
    if (!hasExactKeys(value, ['commandId', 'name', 'scriptId', 'type'])) return null
    if (!isRuntimeIdentifier(value.scriptId) || !isRequestId(value.commandId)) return null
    if (
      typeof value.name !== 'string'
      || value.name.trim().length === 0
      || value.name.length > 200
      || hasAsciiControlCharacter(value.name)
    ) return null
    return { type: value.type, scriptId: value.scriptId, commandId: value.commandId, name: value.name }
  }
  if (value.type === 'menu:unregister') {
    if (!hasExactKeys(value, ['commandId', 'scriptId', 'type'])) return null
    return isRuntimeIdentifier(value.scriptId) && isRequestId(value.commandId)
      ? { type: value.type, scriptId: value.scriptId, commandId: value.commandId }
      : null
  }
  return null
}

function parseXhrRequestDetails(value: unknown): UserScriptXhrRequestDetails | null {
  if (!isPlainRecord(value)) return null
  if (!hasExactKeys(value, ['anonymous', 'data', 'headers', 'method', 'responseType', 'timeout', 'url'])) return null
  if (typeof value.method !== 'string' || !/^[A-Za-z]{1,16}$/.test(value.method)) return null
  const method = value.method.toUpperCase()
  if (method === 'CONNECT' || method === 'TRACE' || method === 'TRACK') return null
  if (typeof value.url !== 'string' || value.url.length === 0 || value.url.length > 8_192) return null
  const data = value.data
  if (data !== null && (typeof data !== 'string' || byteLength(data) > USER_SCRIPT_RUNTIME_MAX_REQUEST_BODY_BYTES)) return null
  if (!isXhrResponseType(value.responseType)) return null
  const timeout = value.timeout
  if (typeof timeout !== 'number' || !Number.isSafeInteger(timeout) || timeout < 0 || timeout > USER_SCRIPT_RUNTIME_MAX_TIMEOUT_MS) return null
  if (typeof value.anonymous !== 'boolean') return null
  const headers = parseRequestHeaders(value.headers)
  if (!headers) return null
  return {
    method,
    url: value.url,
    headers,
    data,
    responseType: value.responseType,
    timeout,
    anonymous: value.anonymous,
  }
}

function parseRequestHeaders(value: unknown): Record<string, string> | null {
  if (!isPlainRecord(value)) return null
  const entries = Object.entries(value)
  if (entries.length > 64) return null
  let totalBytes = 0
  const headers: Record<string, string> = {}
  for (const [name, headerValue] of entries) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(name)) return null
    if (typeof headerValue !== 'string' || headerValue.length > 8_192 || /[\r\n]/.test(headerValue)) return null
    totalBytes += byteLength(name) + byteLength(headerValue)
    if (totalBytes > 64 * 1024) return null
    headers[name] = headerValue
  }
  return headers
}

function isXhrResponseType(value: unknown): value is UserScriptXhrResponseType {
  return value === '' || value === 'text' || value === 'json' || value === 'arraybuffer' || value === 'blob' || value === 'document'
}

function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function hasAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
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
