import {
  app,
  dialog,
  net,
  shell,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type MessageBoxOptions,
  type OpenDialogOptions,
} from 'electron'
import { getShellWindowOwner, ipcMain } from './trustedSender'
import { bool, object, oneOf, pattern, text } from './payloadSchema'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  deleteScript,
  getAllScripts,
  getScriptById,
  toggleScript,
  updateScript,
} from '../db/repositories/userScriptRepository'
import {
  compareUserScriptVersions,
  decideUserScriptImport,
  resolveUserScriptImportDecision,
  type ExistingUserScriptIdentity,
  type UserScriptImportDecision,
} from '../scripts/userScriptImport'
import {
  prepareUserScriptResources,
} from '../scripts/UserScriptResourceCache'
import type { PendingUserScriptInstallRegistry } from '../downloads/userScriptNavigation'
import {
  UserScriptRemoteInstaller,
} from '../scripts/UserScriptRemoteInstaller'
import { persistUserScriptInstall } from '../scripts/UserScriptInstaller'
import { isManagedScriptArtifactName, resolveManagedScriptPath } from '../scripts/managedScriptPath'
import type { UserScriptUpdateService } from '../scripts/UserScriptUpdateService'
import { resolveUserScriptRequestTarget } from '../scripts/userScriptConnectPolicy'
import { appLogger } from '../shared/logger'

type UserScriptSaveInput = {
  name: string
  site_ids_json: string
}

interface RegisterScriptsIpcOptions {
  getParentWindow?: (event: IpcMainInvokeEvent) => BrowserWindow | null
  refreshUserScriptRuntime?: () => void
  fetchResource?: (input: string, init: RequestInit) => Promise<Response>
  allowInsecureLocalhost?: boolean
  getUserScriptInstallRegistry?: () => PendingUserScriptInstallRegistry | null
  getUserScriptRemoteInstaller?: () => UserScriptRemoteInstaller | null
  getUserScriptUpdateService?: () => UserScriptUpdateService | null
}

interface UserScriptSummary {
  id: string
  name: string
  enabled: boolean
  site_ids_json: string | null
  has_file: boolean
}

/*
 * 三个复用的界，数字全部沿用本文件原先手写检查里的值，不另立标准：
 *
 * - `scriptId()` / `installId()`：上限 200，与原 `validateScriptId`、
 *   `installId.length > 200` 一致。`scriptId` 用 `pattern(/\S/)` 而不是 `text()`，
 *   因为原检查是 `id.trim().length === 0`——纯空白要拒。`text({min:1})` 会放过 `'   '`，
 *   那是一次查不到行的 DB 查询，不是拒绝。
 * - `installId()` 保持 `text()`（只拒空串），照搬原 `installId.length === 0` 那一版：
 *   这个 id 由主进程生成并存进 registry，纯空白根本不可能匹配到任何待处理请求。
 * - 脚本名上限 200，与原 `record.name.length > 200` 一致，同样要求非纯空白。
 */
const scriptId = () => pattern(/\S/, 'non-blank-string(1..200)', { max: 200 })
const installId = () => text({ max: 200 })

export function registerScriptsIpc(options: RegisterScriptsIpcOptions = {}): void {
  const confirmingRemoteInstalls = new Set<string>()
  ipcMain.handle('scripts:getAll', () => getAllScripts().map(toUserScriptSummary))

  /*
   * schema 只管形状；`site_ids_json` 的**内容**仍由 `validateScriptSaveInput` 判。
   * 分工的理由：那串是 JSON 文本，要 parse 完才知道是不是"无重复的非空字符串数组"，
   * 这不是形状问题，本层的组合子也表达不了。schema 接手的是原先那三条形状检查——
   * 非对象、多余字段（`object` 默认拒绝，等价于原来的 `keys.length !== 2`）、
   * name 的类型与长度。
   */
  ipcMain.handle('scripts:save', [
    scriptId(),
    object({
      name: pattern(/\S/, 'non-blank-string(1..200)', { max: 200 }),
      // JSON 文本自身的上限：站点 id 按 200 算，配 32 个站点也不到 8 KiB。
      site_ids_json: text({ max: 8 * 1024 }),
    }),
  ], (_event, validatedId, data) => {
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
    const preparedResources = await prepareUserScriptResources(importDecision.metadata, {
      fetch: options.fetchResource ?? ((input, init) => net.fetch(input, init)),
      allowInsecureLocalhost: options.allowInsecureLocalhost,
    })

    const importedId = await persistUserScriptInstall({
      decision: importDecision,
      resources: preparedResources,
      scriptsDirectory,
      claimLegacy: shouldClaimLegacy,
      sourceFilePath: sourcePath,
    })
    options.refreshUserScriptRuntime?.()
    return importedId
  })

  /*
   * 形状不对现在是拒绝，不再是返回 null / false。
   *
   * `installId` 由主进程在拦截远程安装时生成，经 `activeTab.page.installId` 传给
   * `UserScriptInstallPage`，用户碰不到；形状不对说明我们自己的代码有 bug。而返回 null
   * 会和"请求已过期 / registry 里没有"混在一起——那是同一个函数体里紧跟着的另一条分支，
   * 调用方分不出是哪种。三个 renderer 调用点本来就 catch（effect 里 catch 后显示
   * "读取远程脚本失败"，`finish` 里 catch 后把消息显示出来，cancel 是 `.catch(() => false)`），
   * 不会产生无人接管的 rejection。
   */
  ipcMain.handle('scripts:getRemoteInstallPreview', [installId()], async (_event, installId) => {
    const registry = options.getUserScriptInstallRegistry?.()
    const installer = options.getUserScriptRemoteInstaller?.()
    const request = registry?.get(installId)
    if (!request || !installer) return null
    const existing = getAllScripts().map(script => ({
      id: script.id,
      namespace: script.namespace,
      identityName: script.identity_name,
      version: script.version,
      filePath: script.file_path,
    }))
    const prepared = installer.getPrepared(installId, request.sourceUrl)
    if (prepared) return prepared.preview
    return installer.prepare(request, existing, installId)
  })

  ipcMain.handle('scripts:confirmRemoteInstall', [
    installId(),
    oneOf(['install', 'copy', 'cancel'] as const),
  ], async (_event, installId, action) => {
    const registry = options.getUserScriptInstallRegistry?.()
    const installer = options.getUserScriptRemoteInstaller?.()
    const request = registry?.get(installId)
    if (!request || !installer) return null
    if (confirmingRemoteInstalls.has(installId)) return null
    confirmingRemoteInstalls.add(installId)
    try {
      if (action === 'cancel') {
        installer.clear(installId)
        registry?.consume(installId)
        return { status: 'cancelled' as const }
      }
      const prepared = installer.getPrepared(installId, request.sourceUrl)
      if (!prepared) return null
      const existingScripts = getAllScripts()
      const existingIdentities: ExistingUserScriptIdentity[] = existingScripts.map(script => ({
        id: script.id,
        namespace: script.namespace,
        identityName: script.identity_name,
        version: script.version,
        filePath: script.file_path,
      }))
      let claimLegacy = false
      let decision: UserScriptImportDecision
      if (action === 'copy') {
        decision = decideUserScriptImport({
          code: prepared.decision.code,
          sourceFileName: request.sourceFileName,
          existingScripts: existingIdentities,
          mode: 'copy',
        })
      } else {
        const resolved = resolveUserScriptImportDecision({
          code: prepared.decision.code,
          sourceFileName: request.sourceFileName,
          existingScripts: existingIdentities,
        })
        decision = resolved.decision
        claimLegacy = resolved.claimLegacy
        if (
          decision.identity.key !== prepared.decision.identity.key
          || decision.action !== prepared.preview.action
          || (decision.existing?.id ?? null) !== prepared.preview.existingScriptId
          || (decision.existing?.version ?? null) !== prepared.preview.installedVersion
          || decision.versionComparison !== prepared.preview.versionComparison
        ) {
          installer.clear(installId)
          return { status: 'stale' as const }
        }
      }
      const validatorsApply = installValidatorsApply(
        decision,
        request.sourceUrl,
        prepared.finalUrl,
        options.allowInsecureLocalhost,
      )
      const importedId = await persistUserScriptInstall({
        decision,
        resources: prepared.resources,
        scriptsDirectory: path.join(app.getPath('userData'), 'userscripts'),
        claimLegacy,
        sourceUrl: request.sourceUrl,
        etag: validatorsApply ? prepared.etag : null,
        lastModified: validatorsApply ? prepared.lastModified : null,
      })
      installer.consume(installId)
      registry?.consume(installId)
      options.refreshUserScriptRuntime?.()
      return { status: 'installed' as const, scriptId: importedId }
    }
    finally {
      confirmingRemoteInstalls.delete(installId)
    }
  })

  ipcMain.handle('scripts:cancelRemoteInstall', [installId()], (_event, installId) => {
    options.getUserScriptRemoteInstaller?.()?.clear(installId)
    return options.getUserScriptInstallRegistry?.()?.consume(installId) !== null
  })

  ipcMain.handle('scripts:checkUpdates', () => {
    return options.getUserScriptUpdateService?.()?.checkAll(true) ?? null
  })

  ipcMain.handle('scripts:openFolder', async () => {
    const scriptsDir = path.join(app.getPath('userData'), 'userscripts')
    await fs.mkdir(scriptsDir, { recursive: true })
    return shell.openPath(scriptsDir)
  })

  ipcMain.handle('scripts:getCode', [scriptId()], async (_event, id): Promise<UserScriptCodeView> => {
    const script = getScriptById(id)
    if (!script) return { status: 'not-found' }
    const managedPath = resolveManagedScriptPath(script.file_path, userScriptsDirectory())
    if (script.file_path && !managedPath) return { status: 'unmanaged' }

    const code = managedPath ? await readManagedScriptCode(managedPath) : script.code
    if (code === null) return { status: 'unreadable' }
    if (Buffer.byteLength(code, 'utf8') > MAX_VIEWABLE_SCRIPT_BYTES) {
      return { status: 'too-large', limitBytes: MAX_VIEWABLE_SCRIPT_BYTES }
    }
    return { status: 'ok', scriptId: script.id, code }
  })

  ipcMain.handle('scripts:openEditor', [scriptId()], async (_event, id): Promise<UserScriptOpenEditorResult> => {
    const script = getScriptById(id)
    if (!script) return { status: 'not-found' }
    const managedPath = resolveManagedScriptPath(script.file_path, userScriptsDirectory())
    if (!managedPath) return { status: 'unmanaged' }
    // shell.openPath resolves to '' on success and to a platform message on
    // failure; the message is not surfaced verbatim because it is OS-localized.
    const failure = await shell.openPath(managedPath)
    return failure ? { status: 'open-failed' } : { status: 'ok' }
  })

  /*
   * 这条原先只有类型标注 `(_event, id: string, enabled: boolean)`，没有任何运行时检查——
   * 是本文件里唯一一条真正裸奔的通道：`toggleScript(id, enabled)` 会把 renderer 给的任何值
   * 直接绑进 UPDATE 语句。
   */
  ipcMain.handle('scripts:toggle', [scriptId(), bool], (_event, id, enabled) => {
    const result = toggleScript(id, enabled)
    if (result) options.refreshUserScriptRuntime?.()
    return result
  })
  ipcMain.handle('scripts:delete', [scriptId()], async (_event, id) => {
    const script = getScriptById(id)
    if (!script) return false
    const managedPath = resolveManagedScriptPath(script.file_path, userScriptsDirectory())
    const result = deleteScript(script.id)
    if (!result) return false
    if (managedPath && isManagedScriptArtifactName(path.basename(managedPath))) {
      // Content-addressed names mean two rows can legitimately share one file
      // (identical code imported under different identities). Only reclaim the
      // file once no surviving row still points at it.
      const stillReferenced = getAllScripts().some(other => (
        other.file_path !== null && path.resolve(other.file_path) === managedPath
      ))
      if (!stillReferenced) {
        try { await fs.unlink(managedPath) }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            appLogger.warn('userscript.managed-file-delete-failed', { scriptId: script.id, error })
          }
        }
      }
    }
    options.refreshUserScriptRuntime?.()
    return true
  })
}

const MAX_VIEWABLE_SCRIPT_BYTES = 4 * 1024 * 1024

function userScriptsDirectory(): string {
  return path.join(app.getPath('userData'), 'userscripts')
}

async function readManagedScriptCode(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile() || stat.size > MAX_VIEWABLE_SCRIPT_BYTES) return null
    return await fs.readFile(filePath, 'utf8')
  }
  catch {
    return null
  }
}

function installValidatorsApply(
  decision: UserScriptImportDecision,
  sourceUrl: string,
  finalUrl: string,
  allowInsecureLocalhost = false,
): boolean {
  const nextCheck = decision.metadata.updateURL ?? decision.metadata.downloadURL ?? sourceUrl
  const target = resolveUserScriptRequestTarget(nextCheck, allowInsecureLocalhost)
  const source = resolveUserScriptRequestTarget(sourceUrl, allowInsecureLocalhost)
  const final = resolveUserScriptRequestTarget(finalUrl, allowInsecureLocalhost)
  if (!target || !source || !final || new URL(source.url).origin !== new URL(final.url).origin) return false
  return target.url === source.url || target.url === final.url
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


/**
 * `site_ids_json` 的内容校验。
 *
 * 形状那半截（非对象、多余字段、name 的类型与长度、site_ids_json 是不是字符串）已经由
 * 通道上的 schema 接手，所以这里只剩 schema 表达不了的部分：那串 JSON parse 出来必须是
 * 一个无重复的非空字符串数组。
 */
function validateScriptSaveInput(record: UserScriptSaveInput): UserScriptSaveInput {
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
