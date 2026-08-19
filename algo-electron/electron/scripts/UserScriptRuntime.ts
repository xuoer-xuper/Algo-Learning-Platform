import {
  deleteUserScriptValue,
  listUserScriptValues,
  setUserScriptValue,
} from '../db/repositories/userScriptRuntimeRepository'
import { appLogger, type Logger } from '../shared/logger'
import type { UserScriptService } from './UserScriptService'
import {
  USER_SCRIPT_RUNTIME_MAX_SOURCE_BYTES,
  type UserScriptRuntimeScriptSnapshot,
} from './userScriptRuntimeProtocol'

interface UserScriptRuntimeDependencies {
  userScriptService: Pick<
    UserScriptService,
    'refresh' | 'getEnabledScriptsSnapshot' | 'getMatchingScriptsWithMeta'
  >
  listValues: typeof listUserScriptValues
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
  private readonly generationChangeListeners = new Set<(generation: number) => void>()
  private runtimeGeneration = 0

  public constructor(dependencies: Partial<UserScriptRuntimeDependencies> & {
    userScriptService: UserScriptRuntimeDependencies['userScriptService']
  }) {
    this.dependencies = {
      listValues: listUserScriptValues,
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
    for (const listener of this.generationChangeListeners) listener(this.runtimeGeneration)
    this.dependencies.userScriptService.refresh()
    const nextValues = new Map<string, Map<string, unknown>>()
    for (const script of this.dependencies.userScriptService.getEnabledScriptsSnapshot()) {
      try {
        nextValues.set(script.id, new Map(
          this.dependencies.listValues(script.id).map(value => [value.value_key, value.value]),
        ))
      }
      catch (error) {
        this.dependencies.logger.error('userscript.runtime-values-load-failed', {
          scriptId: script.id,
          error: error instanceof Error ? error.message : error,
        })
        nextValues.set(script.id, new Map())
      }
    }
    for (const [scriptId, values] of nextValues) this.valuesByScript.set(scriptId, values)
  }

  public getNavigationSnapshot(url: string, isMainFrame: boolean): UserScriptRuntimeNavigationSnapshot {
    const scripts = this.dependencies.userScriptService.getMatchingScriptsWithMeta(url)
      .filter(({ script }) => isMainFrame || !script.noframes)
      .flatMap(({ script }) => {
        if (new TextEncoder().encode(script.code).byteLength > USER_SCRIPT_RUNTIME_MAX_SOURCE_BYTES) {
          this.dependencies.logger.warn('userscript.runtime-source-too-large', { scriptId: script.id })
          return []
        }
        const grants = parseStringArray(script.grant_json)
        const connects = parseStringArray(script.connect_json)
        if (!grants || !connects) {
          this.dependencies.logger.warn('userscript.runtime-permissions-invalid', { scriptId: script.id })
          return []
        }
        return [{
          id: script.id,
          name: script.name,
          namespace: script.namespace,
          description: script.description,
          version: script.version,
          runAt: normalizeRunAt(script.run_at),
          grants,
          connects,
          values: Array.from(this.valuesByScript.get(script.id) ?? []),
          code: script.code,
        }]
      })
    return { generation: this.runtimeGeneration, scripts }
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
