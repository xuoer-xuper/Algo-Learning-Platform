import {
  buildUserScriptMainWorldRuntime,
  type UserScriptMainWorldExecution,
} from './userScriptMainWorldRuntime'
import {
  USER_SCRIPT_RUNTIME_MAX_SNAPSHOT_BYTES,
  type UserScriptRuntimeScriptSnapshot,
} from './userScriptRuntimeProtocol'
import type { UserScriptRuntimeNavigationSnapshot } from './UserScriptRuntime'

export const USER_SCRIPT_COMPILED_CATALOG_KEY = '__algoUserScriptCompiledCatalogV1'

export interface UserScriptCompiledCatalogEntry {
  func: (
    payload: UserScriptMainWorldExecution['args'][0],
    sendMessage: (message: unknown) => void,
    subscribe: (listener: (message: unknown) => void) => void,
  ) => void
  payload: UserScriptMainWorldExecution['args'][0]
  body: string
}

export type UserScriptCompiledCatalog = Map<string, UserScriptCompiledCatalogEntry>

export interface UserScriptCompiledCatalogBuildResult {
  source: string
  rejectedScriptIds: string[]
}

export function buildUserScriptCompiledCatalogPreload(
  snapshot: UserScriptRuntimeNavigationSnapshot,
): UserScriptCompiledCatalogBuildResult {
  const snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength
  if (snapshotBytes > USER_SCRIPT_RUNTIME_MAX_SNAPSHOT_BYTES) {
    throw new Error('Userscript compiled catalog exceeds the runtime snapshot limit')
  }

  const built = buildUserScriptMainWorldRuntime({
    handshakeId: `catalog:${snapshot.generation}`,
    targetOrigin: 'https://catalog.invalid',
    generation: snapshot.generation,
    scripts: snapshot.scripts.map(toMainWorldScript),
  })
  const body = built.execution.args[1]
  const compiled = new Function('payloadArg', 'sendArg', 'subscribeArg', body)
  const entry = `[${JSON.stringify(catalogGenerationKey(snapshot.generation))},{func:${compiled.toString()},payload:${JSON.stringify(built.execution.args[0])},body:${JSON.stringify(body)}}]`

  const rejectedScriptIds = built.rejectedScripts.map(script => script.id)

  return {
    source: [
      "import { contextBridge } from 'electron';",
      'contextBridge.executeInMainWorld({',
      'func: () => {',
      `Object.defineProperty(globalThis,${JSON.stringify(USER_SCRIPT_COMPILED_CATALOG_KEY)},{`,
      'configurable:true,enumerable:false,writable:false,',
      `value:new Map([${entry}])`,
      '});',
      '},',
      '});',
    ].join(''),
    rejectedScriptIds,
  }
}

export function catalogGenerationKey(generation: number): string {
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new TypeError('Userscript catalog generation must be a non-negative safe integer')
  }
  return String(generation)
}

function toMainWorldScript(script: UserScriptRuntimeScriptSnapshot) {
  return {
    id: script.id,
    revision: script.revision,
    name: script.name,
    namespace: script.namespace,
    description: script.description,
    version: script.version,
    runAt: script.runAt,
    source: script.code,
    grants: script.grants,
    values: script.values,
    resources: script.resources,
  }
}
