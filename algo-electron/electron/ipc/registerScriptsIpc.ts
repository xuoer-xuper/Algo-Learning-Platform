import {
  app,
  dialog,
  shell,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type MessageBoxOptions,
  type OpenDialogOptions,
} from 'electron'
import { getShellWindowOwner, ipcMain } from './trustedSender'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  createScript,
  deleteScript,
  getAllScripts,
  toggleScript,
  updateScript,
  updateScriptWithLegacyClaim,
  type UserScriptUpdateInput,
} from '../db/repositories/userScriptRepository'
import {
  compareUserScriptVersions,
  decideUserScriptImport,
  writeUserScriptImport,
  type ExistingUserScriptIdentity,
  type UserScriptImportDecision,
} from '../scripts/userScriptImport'
import { appLogger } from '../shared/logger'

type UserScriptSaveInput = {
  name: string
  site_ids_json: string
}

interface RegisterScriptsIpcOptions {
  getParentWindow?: (event: IpcMainInvokeEvent) => BrowserWindow | null
  refreshUserScriptRuntime?: () => void
}

interface UserScriptSummary {
  id: string
  name: string
  enabled: boolean
  site_ids_json: string | null
  has_file: boolean
}

const UUID_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.js$/i
const MANAGED_IMPORT_FILE_PATTERN = /^.+--[0-9a-f]{12}--[0-9a-f]{12}\.user\.js$/i

export function registerScriptsIpc(options: RegisterScriptsIpcOptions = {}): void {
  ipcMain.handle('scripts:getAll', () => getAllScripts().map(toUserScriptSummary))

  ipcMain.handle('scripts:save', (_event, id: unknown, data: unknown) => {
    const validatedId = validateScriptId(id)
    const validatedData = validateScriptSaveInput(data)
    if (!updateScript(validatedId, validatedData)) {
      throw new Error('User script was not found or could not be updated')
    }
    options.refreshUserScriptRuntime?.()
    return validatedId
  })

  ipcMain.handle('scripts:importFile', async (event) => {
    const parent = getLiveParentWindow(event, options.getParentWindow)
    const openDialogOptions: OpenDialogOptions = {
      title: '选择用户脚本',
      filters: [{ name: 'JavaScript', extensions: ['js'] }],
      properties: ['openFile'],
    }
    const { canceled, filePaths } = parent
      ? await dialog.showOpenDialog(parent, openDialogOptions)
      : await dialog.showOpenDialog(openDialogOptions)
    if (canceled || filePaths.length === 0) return null

    const sourcePath = filePaths[0]
    const code = await fs.readFile(sourcePath, 'utf8')
    const scriptsDirectory = path.join(app.getPath('userData'), 'userscripts')
    const existingScripts = getAllScripts()
    const existingIdentities: ExistingUserScriptIdentity[] = existingScripts.map(script => ({
      id: script.id,
      namespace: script.namespace,
      identityName: script.identity_name,
      version: script.version,
      filePath: script.file_path,
    }))

    let decision = decideUserScriptImport({
      code,
      sourceFileName: sourcePath,
      existingScripts: existingIdentities,
    })
    let claimLegacy = false

    // A canonical import may claim one migrated legacy canonical row, but the
    // claim is performed only inside the confirmed update transaction below.
    if (
      !decision.existing
      && decision.identity.namespace !== null
      && !decision.identity.namespace.startsWith('local:')
    ) {
      const legacy = existingScripts.find(script => (
        script.namespace === null && script.identity_name === decision.identity.identityName
      ))
      if (legacy) {
        decision = {
          ...decision,
          action: 'update',
          existing: {
            id: legacy.id,
            namespace: legacy.namespace,
            identityName: legacy.identity_name,
            version: legacy.version,
            filePath: legacy.file_path,
          },
          versionComparison: compareUserScriptVersions(decision.metadata.version, legacy.version),
        }
        claimLegacy = true
      }
    }

    const response = decision.existing
      ? await showImportConfirmation(parent, decision.versionComparison)
      : 0
    if (response === 2) return null
    const importDecision = decision.existing && response === 1
      ? decideUserScriptImport({
          code,
          sourceFileName: sourcePath,
          existingScripts: existingIdentities,
          mode: 'copy',
        })
      : decision
    const shouldClaimLegacy = claimLegacy && response !== 1

    const previousFilePath = importDecision.existing?.filePath ?? null
    let importedId: string | null = null
    await writeUserScriptImport(importDecision, {
      scriptsDirectory,
      persist: (resolvedDecision, filePath) => {
        importedId = persistImportedScript(resolvedDecision, filePath, shouldClaimLegacy)
        return importedId
      },
    })

    if (!importedId) throw new Error('Userscript import did not produce an id')
    if (previousFilePath && previousFilePath !== path.join(scriptsDirectory, importDecision.fileName)) {
      await removeReplacedManagedFile(
        previousFilePath,
        path.join(scriptsDirectory, importDecision.fileName),
        scriptsDirectory,
        importedId,
        sourcePath,
      )
    }
    options.refreshUserScriptRuntime?.()
    return importedId
  })

  ipcMain.handle('scripts:openFolder', async () => {
    const scriptsDir = path.join(app.getPath('userData'), 'userscripts')
    await fs.mkdir(scriptsDir, { recursive: true })
    return shell.openPath(scriptsDir)
  })

  ipcMain.handle('scripts:toggle', (_event, id: string, enabled: boolean) => {
    const result = toggleScript(id, enabled)
    if (result) options.refreshUserScriptRuntime?.()
    return result
  })
  ipcMain.handle('scripts:delete', (_event, id: string) => {
    const result = deleteScript(id)
    if (result) options.refreshUserScriptRuntime?.()
    return result
  })
}

function toUserScriptSummary(script: ReturnType<typeof getAllScripts>[number]): UserScriptSummary {
  return {
    id: script.id,
    name: script.name,
    enabled: script.enabled,
    site_ids_json: script.site_ids_json,
    has_file: Boolean(script.file_path),
  }
}

function getLiveParentWindow(
  event: IpcMainInvokeEvent,
  resolveParentWindow?: (event: IpcMainInvokeEvent) => BrowserWindow | null,
): BrowserWindow | null {
  try {
    const parent = resolveParentWindow?.(event) ?? getShellWindowOwner(event)?.browserWindow ?? null
    return parent && !parent.isDestroyed() ? parent : null
  }
  catch {
    return null
  }
}

async function showImportConfirmation(
  parent: BrowserWindow | null,
  comparison: UserScriptImportDecision['versionComparison'],
): Promise<number> {
  const messageBoxOptions = getUserScriptImportConfirmationOptions(comparison)
  const result = parent
    ? await dialog.showMessageBox(parent, messageBoxOptions)
    : await dialog.showMessageBox(messageBoxOptions)
  return result.response
}

export function getUserScriptImportConfirmationOptions(
  comparison: UserScriptImportDecision['versionComparison'],
): MessageBoxOptions {
  const labels: Record<UserScriptImportDecision['versionComparison'], [string, number]> = {
    newer: ['更新现有脚本', 0],
    same: ['覆盖现有脚本', 0],
    older: ['仍然降级', 2],
    unknown: ['覆盖现有脚本', 2],
  }
  const [primary, defaultId] = labels[comparison]
  return {
    type: 'question',
    title: '导入用户脚本',
    message: comparison === 'older'
      ? '导入脚本版本低于当前版本，是否仍然降级？'
      : '检测到相同身份的用户脚本，如何处理？',
    buttons: [primary, '另存为本地副本', '取消'],
    defaultId,
    cancelId: 2,
    noLink: true,
  }
}

function persistImportedScript(
  decision: UserScriptImportDecision,
  filePath: string,
  claimLegacy: boolean,
): string {
  const metadata = decision.metadata
  const update: UserScriptUpdateInput = {
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

  if (decision.action === 'update' && decision.existing) {
    const updated = claimLegacy
      ? updateScriptWithLegacyClaim(decision.existing.id, decision.identity.namespace ?? '', update)
      : updateScript(decision.existing.id, update)
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
    antifeature_json: JSON.stringify(metadata.antifeatures),
    icon_url: metadata.icon ?? null,
    code: decision.code,
    file_path: filePath,
    site_ids_json: '[]',
    enabled: true,
    auto_update_enabled: decision.autoUpdateEnabled,
  })
}

function validateScriptId(id: unknown): string {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('scripts:save requires a non-empty script id')
  }
  return id
}

function validateScriptSaveInput(data: unknown): UserScriptSaveInput {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('scripts:save data must be an object')
  }
  const record = data as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.length !== 2 || keys[0] !== 'name' || keys[1] !== 'site_ids_json') {
    throw new TypeError('scripts:save accepts only name and site_ids_json')
  }
  if (typeof record.name !== 'string' || record.name.trim().length === 0 || record.name.length > 200) {
    throw new TypeError('scripts:save name must be a non-empty string of at most 200 characters')
  }
  if (typeof record.site_ids_json !== 'string') {
    throw new TypeError('scripts:save site_ids_json must be JSON')
  }

  let siteIds: unknown
  try { siteIds = JSON.parse(record.site_ids_json) }
  catch { throw new TypeError('scripts:save site_ids_json must be valid JSON') }
  if (!Array.isArray(siteIds) || siteIds.some(siteId => typeof siteId !== 'string' || siteId.length === 0)) {
    throw new TypeError('scripts:save site_ids_json must be an array of non-empty strings')
  }
  if (new Set(siteIds).size !== siteIds.length) {
    throw new TypeError('scripts:save site_ids_json must not contain duplicates')
  }

  return {
    name: record.name,
    site_ids_json: JSON.stringify(siteIds),
  }
}

async function removeReplacedManagedFile(
  oldFilePath: string,
  newFilePath: string,
  scriptsDirectory: string,
  updatedScriptId: string,
  sourceFilePath: string,
): Promise<void> {
  try {
    const root = path.resolve(scriptsDirectory)
    const oldPath = path.resolve(oldFilePath)
    if (
      oldPath === path.resolve(newFilePath)
      || oldPath === path.resolve(sourceFilePath)
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
