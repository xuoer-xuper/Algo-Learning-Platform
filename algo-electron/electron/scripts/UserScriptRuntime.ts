import { createHash } from 'node:crypto'
import {
  deleteUserScriptValue,
  listUserScriptResources,
  listUserScriptValues,
  setUserScriptValue,
  type UserScriptResource,
} from '../db/repositories/userScriptRuntimeRepository'
import { appLogger, type Logger } from '../shared/logger'
import type { UserScriptService } from './UserScriptService'
import { parseScriptMetadata, type UserScriptResourceReference } from './userScriptMetadata'
import { selectUserScriptIntegrity } from './UserScriptResourceCache'
import {
  USER_SCRIPT_RUNTIME_MAX_SOURCE_BYTES,
  type UserScriptRuntimeResourceSnapshot,
  type UserScriptRuntimeScriptSnapshot,
} from './userScriptRuntimeProtocol'
import { errorMessage } from '../shared/errors'

interface UserScriptRuntimeDependencies {
  userScriptService: Pick<
    UserScriptService,
    'refresh' | 'getEnabledScriptsSnapshot' | 'getMatchingScriptsWithMeta'
  >
  listValues: typeof listUserScriptValues
  listResources: typeof listUserScriptResources
  setValue: typeof setUserScriptValue
  deleteValue: typeof deleteUserScriptValue
  logger: Logger
}

export interface UserScriptRuntimeNavigationSnapshot {
  generation: number
  scripts: UserScriptRuntimeScriptSnapshot[]
}

export class UserScriptRuntime {
  private readonly dependencies: UserScriptRuntimeDependencies
  private readonly valuesByScript = new Map<string, Map<string, unknown>>()
  private readonly resourcesByScript = new Map<string, UserScriptResource[]>()
  private readonly generationChangeListeners = new Set<(generation: number) => void>()
  private runtimeGeneration = 0

  public constructor(dependencies: Partial<UserScriptRuntimeDependencies> & {
    userScriptService: UserScriptRuntimeDependencies['userScriptService']
  }) {
    this.dependencies = {
      listValues: listUserScriptValues,
      listResources: listUserScriptResources,
      setValue: setUserScriptValue,
      deleteValue: deleteUserScriptValue,
      logger: appLogger,
      ...dependencies,
    }
  }

  public get generation(): number {
    return this.runtimeGeneration
  }

  public refresh(): void {
    this.runtimeGeneration += 1
    this.valuesByScript.clear()
    this.resourcesByScript.clear()
    try {
      this.dependencies.userScriptService.refresh()
      const nextValues = new Map<string, Map<string, unknown>>()
      const nextResources = new Map<string, UserScriptResource[]>()
      for (const script of this.dependencies.userScriptService.getEnabledScriptsSnapshot()) {
        try {
          nextValues.set(script.id, new Map(
            this.dependencies.listValues(script.id).map(value => [value.value_key, value.value]),
          ))
        }
        catch (error) {
          this.dependencies.logger.error('userscript.runtime-values-load-failed', {
            scriptId: script.id,
            error: errorMessage(error),
          })
          nextValues.set(script.id, new Map())
        }
        try {
          nextResources.set(script.id, this.dependencies.listResources(script.id))
        }
        catch (error) {
          this.dependencies.logger.error('userscript.runtime-resources-load-failed', {
            scriptId: script.id,
            error: errorMessage(error),
          })
          nextResources.set(script.id, [])
        }
      }
      for (const [scriptId, values] of nextValues) this.valuesByScript.set(scriptId, values)
      for (const [scriptId, resources] of nextResources) this.resourcesByScript.set(scriptId, resources)
    }
    finally {
      for (const listener of this.generationChangeListeners) listener(this.runtimeGeneration)
    }
  }

  public getNavigationSnapshot(url: string, isMainFrame: boolean): UserScriptRuntimeNavigationSnapshot {
    const scripts = this.dependencies.userScriptService.getMatchingScriptsWithMeta(url)
      .filter(({ script }) => isMainFrame || !script.noframes)
      .flatMap(({ script, requires, resources }) => this.buildScriptSnapshot(script, { requires, resources }))
    return { generation: this.runtimeGeneration, scripts }
  }

  public getCatalogSnapshot(): UserScriptRuntimeNavigationSnapshot {
    return {
      generation: this.runtimeGeneration,
      scripts: this.dependencies.userScriptService.getEnabledScriptsSnapshot()
        .flatMap((script) => {
          const metadata = parseScriptMetadata(script.code)
          return this.buildScriptSnapshot(script, metadata)
        }),
    }
  }

  public setValue(scriptId: string, key: string, value: unknown): void {
    this.requireEnabledScript(scriptId)
    this.dependencies.setValue(scriptId, key, value)
    this.valuesByScript.get(scriptId)?.set(key, structuredClone(value))
  }

  public deleteValue(scriptId: string, key: string): void {
    this.requireEnabledScript(scriptId)
    this.dependencies.deleteValue(scriptId, key)
    this.valuesByScript.get(scriptId)?.delete(key)
  }

  public addGenerationChangeListener(listener: (generation: number) => void): () => void {
    this.generationChangeListeners.add(listener)
    return () => { this.generationChangeListeners.delete(listener) }
  }

  private requireEnabledScript(scriptId: string): void {
    if (!this.valuesByScript.has(scriptId)) throw new Error('Userscript is not enabled in the runtime cache')
  }

  private buildScriptSnapshot(
    script: ReturnType<UserScriptRuntimeDependencies['userScriptService']['getEnabledScriptsSnapshot']>[number],
    metadata: {
      requires: UserScriptResourceReference[]
      resources: Array<UserScriptResourceReference & { name: string }>
    },
  ): UserScriptRuntimeScriptSnapshot[] {
    const materialized = materializeResources(metadata, this.resourcesByScript.get(script.id) ?? [])
    if (!materialized) {
      this.dependencies.logger.warn('userscript.runtime-resource-cache-invalid', { scriptId: script.id })
      return []
    }
    const code = [...materialized.requires, script.code].join('\n;\n')
    if (new TextEncoder().encode(code).byteLength > USER_SCRIPT_RUNTIME_MAX_SOURCE_BYTES) {
      this.dependencies.logger.warn('userscript.runtime-source-too-large', { scriptId: script.id })
      return []
    }
    const grants = parseStringArray(script.grant_json)
    const connects = parseStringArray(script.connect_json)
    if (!grants || !connects) {
      this.dependencies.logger.warn('userscript.runtime-permissions-invalid', { scriptId: script.id })
      return []
    }
    const runAt = normalizeRunAt(script.run_at)
    return [{
      id: script.id,
      revision: scriptRevision(script, { grants, connects, runAt }, code, materialized.resources),
      name: script.name,
      namespace: script.namespace,
      description: script.description,
      version: script.version,
      runAt,
      grants,
      connects,
      values: Array.from(this.valuesByScript.get(script.id) ?? []),
      resources: materialized.resources,
      code,
    }]
  }
}

function scriptRevision(
  script: { id: string; name: string; namespace: string | null; description: string | null; version: string | null; noframes: boolean; code: string },
  contract: { grants: string[]; connects: string[]; runAt: 'document-start' | 'document-end' | 'document-idle' },
  code: string,
  resources: UserScriptRuntimeResourceSnapshot[],
): string {
  return createHash('sha256').update(JSON.stringify({
    id: script.id,
    name: script.name,
    namespace: script.namespace,
    description: script.description,
    version: script.version,
    noframes: script.noframes,
    runAt: contract.runAt,
    grants: contract.grants,
    connects: contract.connects,
    code,
    resources,
  }), 'utf8').digest('hex').slice(0, 32)
}

function materializeResources(
  metadata: {
    requires: UserScriptResourceReference[]
    resources: Array<UserScriptResourceReference & { name: string }>
  },
  cached: readonly UserScriptResource[],
): { requires: string[]; resources: UserScriptRuntimeResourceSnapshot[] } | null {
  const requires = cached.filter(resource => resource.resource_kind === 'require')
  const resources = cached.filter(resource => resource.resource_kind === 'resource')
  if (requires.length !== metadata.requires.length || resources.length !== metadata.resources.length) return null

  const requireSource: string[] = []
  for (let index = 0; index < metadata.requires.length; index += 1) {
    const declaration = metadata.requires[index]
    const cachedResource = requires[index]
    if (!matchesCachedResource(cachedResource, declaration, `require-${index}`, index)) return null
    if (!cachedResource.content_blob || cachedResource.content_encoding !== 'utf8') return null
    try { requireSource.push(new TextDecoder('utf-8', { fatal: true }).decode(cachedResource.content_blob)) }
    catch { return null }
  }

  const snapshots: UserScriptRuntimeResourceSnapshot[] = []
  const names = new Set<string>()
  for (let index = 0; index < metadata.resources.length; index += 1) {
    const declaration = metadata.resources[index]
    const cachedResource = resources[index]
    if (names.has(declaration.name)) return null
    names.add(declaration.name)
    if (!matchesCachedResource(cachedResource, declaration, declaration.name, index)) return null
    if (!cachedResource.content_blob) return null
    snapshots.push({
      name: declaration.name,
      contentType: cachedResource.content_type,
      dataBase64: Buffer.from(cachedResource.content_blob).toString('base64'),
    })
  }
  return { requires: requireSource, resources: snapshots }
}

function matchesCachedResource(
  cached: UserScriptResource | undefined,
  declaration: UserScriptResourceReference,
  key: string,
  order: number,
): boolean {
  if (
    !cached
    || cached.resource_key !== key
    || cached.declaration_order !== order
    || cached.source_url !== declaration.url
    || cached.fetched_at === null
  ) return false
  try {
    return cached.integrity === (selectUserScriptIntegrity(declaration.integrity)?.canonical ?? null)
  }
  catch {
    return false
  }
}

function normalizeRunAt(value: string): 'document-start' | 'document-end' | 'document-idle' {
  if (value === 'document-start' || value === 'document-end') return value
  return 'document-idle'
}

function parseStringArray(value: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) return null
    return parsed
  }
  catch {
    return null
  }
}
