import fs from 'node:fs/promises'
import path from 'node:path'
import {
  createScript,
  getAllScripts,
  runUserScriptTransaction,
  updateScript,
  updateScriptWithLegacyClaim,
  type UserScriptUpdateInput,
} from '../db/repositories/userScriptRepository'
import {
  replaceUserScriptResources,
  upsertUserScriptUpdateState,
} from '../db/repositories/userScriptRuntimeRepository'
import { appLogger } from '../shared/logger'
import { toChinaStandardTime } from '../shared/time'
import {
  writeUserScriptImport,
  type UserScriptImportDecision,
} from './userScriptImport'
import type { PreparedUserScriptResource } from './UserScriptResourceCache'

const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1_000
const UUID_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.js$/i
const MANAGED_IMPORT_FILE_PATTERN = /^.+--[0-9a-f]{12}--[0-9a-f]{12}\.user\.js$/i

export interface PersistUserScriptInstallOptions {
  decision: UserScriptImportDecision
  resources: readonly PreparedUserScriptResource[]
  scriptsDirectory: string
  claimLegacy?: boolean
  sourceUrl?: string | null
  sourceFilePath?: string | null
  etag?: string | null
  lastModified?: string | null
  now?: Date
}

export async function persistUserScriptInstall(options: PersistUserScriptInstallOptions): Promise<string> {
  const previousFilePath = options.decision.existing?.filePath ?? null
  let importedId: string | null = null
  await writeUserScriptImport(options.decision, {
    scriptsDirectory: options.scriptsDirectory,
    persist: (decision, filePath) => {
      importedId = runUserScriptTransaction(() => {
        const scriptId = persistScriptRecord(
          decision,
          filePath,
          options.claimLegacy ?? false,
          options.sourceUrl,
        )
        replaceUserScriptResources(scriptId, options.resources)
        if (options.sourceUrl) {
          const now = options.now ?? new Date()
          upsertUserScriptUpdateState({
            scriptId,
            lastCheckedAt: toChinaStandardTime(now),
            nextCheckAt: toChinaStandardTime(new Date(now.getTime() + UPDATE_INTERVAL_MS)),
            etag: options.etag ?? null,
            lastModified: options.lastModified ?? null,
            availableVersion: null,
            status: 'current',
            lastError: null,
          })
        } else if (decision.action === 'update' && decision.existing) {
          const now = options.now ?? new Date()
          upsertUserScriptUpdateState({
            scriptId,
            lastCheckedAt: toChinaStandardTime(now),
            nextCheckAt: toChinaStandardTime(new Date(now.getTime() + UPDATE_INTERVAL_MS)),
            etag: null,
            lastModified: null,
            availableVersion: null,
            status: 'current',
            lastError: null,
          })
        }
        return scriptId
      })
      return importedId
    },
  })
  if (!importedId) throw new Error('Userscript install did not produce an id')

  const nextFilePath = path.join(options.scriptsDirectory, options.decision.fileName)
  if (previousFilePath && previousFilePath !== nextFilePath) {
    await removeReplacedManagedFile(
      previousFilePath,
      nextFilePath,
      options.scriptsDirectory,
      importedId,
      options.sourceFilePath ?? null,
    )
  }
  return importedId
}

function persistScriptRecord(
  decision: UserScriptImportDecision,
  filePath: string,
  claimLegacy: boolean,
  sourceUrl: string | null | undefined,
): string {
  const metadata = decision.metadata
  const content: UserScriptUpdateInput = {
    description: metadata.description ?? null,
    version: metadata.version ?? null,
    match_urls_json: JSON.stringify(metadata.matches),
    include_rules_json: JSON.stringify(metadata.includes),
    exclude_rules_json: JSON.stringify(metadata.excludes),
    exclude_match_rules_json: JSON.stringify(metadata.excludeMatches),
    grant_json: JSON.stringify(metadata.grants),
    connect_json: JSON.stringify(metadata.connects),
    noframes: metadata.noframes,
    run_at: metadata.runAt ?? 'document-idle',
    update_url: metadata.updateURL ?? null,
    download_url: metadata.downloadURL ?? null,
    antifeature_json: JSON.stringify(metadata.antifeatures),
    icon_url: metadata.icon ?? null,
    code: decision.code,
    file_path: filePath,
  }
  if (sourceUrl !== undefined) content.last_install_url = sourceUrl

  if (decision.action === 'update' && decision.existing) {
    const updated = claimLegacy
      ? updateScriptWithLegacyClaim(decision.existing.id, decision.identity.namespace ?? '', content)
      : updateScript(decision.existing.id, content)
    if (!updated) throw new Error('User script update failed')
    return decision.existing.id
  }

  return createScript({
    name: metadata.name ?? decision.identity.identityName,
    namespace: decision.identity.namespace,
    identity_name: decision.identity.identityName,
    description: metadata.description ?? null,
    version: metadata.version ?? null,
    match_urls_json: JSON.stringify(metadata.matches),
    include_rules_json: JSON.stringify(metadata.includes),
    exclude_rules_json: JSON.stringify(metadata.excludes),
    exclude_match_rules_json: JSON.stringify(metadata.excludeMatches),
    grant_json: JSON.stringify(metadata.grants),
    connect_json: JSON.stringify(metadata.connects),
    noframes: metadata.noframes,
    run_at: metadata.runAt ?? 'document-idle',
    update_url: metadata.updateURL ?? null,
    download_url: metadata.downloadURL ?? null,
    last_install_url: sourceUrl ?? null,
    antifeature_json: JSON.stringify(metadata.antifeatures),
    icon_url: metadata.icon ?? null,
    code: decision.code,
    file_path: filePath,
    site_ids_json: '[]',
    enabled: true,
    auto_update_enabled: decision.autoUpdateEnabled,
  })
}

async function removeReplacedManagedFile(
  oldFilePath: string,
  newFilePath: string,
  scriptsDirectory: string,
  updatedScriptId: string,
  sourceFilePath: string | null,
): Promise<void> {
  try {
    const root = path.resolve(scriptsDirectory)
    const oldPath = path.resolve(oldFilePath)
    if (
      oldPath === path.resolve(newFilePath)
      || (sourceFilePath !== null && oldPath === path.resolve(sourceFilePath))
      || path.dirname(oldPath) !== root
    ) return
    const baseName = path.basename(oldPath)
    if (!UUID_FILE_PATTERN.test(baseName) && !MANAGED_IMPORT_FILE_PATTERN.test(baseName)) return
    const stat = await fs.lstat(oldPath)
    if (!stat.isFile() && !stat.isSymbolicLink()) return
    const stillReferenced = getAllScripts().some(script => (
      script.id !== updatedScriptId && script.file_path && path.resolve(script.file_path) === oldPath
    ))
    if (stillReferenced) return
    await fs.unlink(oldPath)
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') appLogger.warn('userscript.old-file-cleanup-failed', { oldFilePath, error })
  }
}

export function markUserScriptUpdateError(scriptId: string, error: unknown, now = new Date()): void {
  const message = error instanceof Error ? error.message : String(error)
  upsertUserScriptUpdateState({
    scriptId,
    lastCheckedAt: toChinaStandardTime(now),
    nextCheckAt: toChinaStandardTime(new Date(now.getTime() + UPDATE_INTERVAL_MS)),
    status: 'error',
    lastError: message.slice(0, 1_000),
  })
}

export function markUserScriptUpdateChecking(scriptId: string): void {
  upsertUserScriptUpdateState({ scriptId, status: 'checking', lastError: null })
}

export function markUserScriptUpdateCurrent(
  scriptId: string,
  options: { etag?: string | null; lastModified?: string | null; now?: Date } = {},
): void {
  const now = options.now ?? new Date()
  upsertUserScriptUpdateState({
    scriptId,
    lastCheckedAt: toChinaStandardTime(now),
    nextCheckAt: toChinaStandardTime(new Date(now.getTime() + UPDATE_INTERVAL_MS)),
    etag: options.etag,
    lastModified: options.lastModified,
    availableVersion: null,
    status: 'current',
    lastError: null,
  })
}

export function markUserScriptUpdateAvailable(scriptId: string, version: string | null): void {
  upsertUserScriptUpdateState({
    scriptId,
    availableVersion: version,
    status: 'available',
    lastError: null,
  })
}
