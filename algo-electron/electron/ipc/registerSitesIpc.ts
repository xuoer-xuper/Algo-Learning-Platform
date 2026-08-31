import { dialog, type BrowserWindow, type IpcMainInvokeEvent, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { getShellWindowOwner, ipcMain } from './trustedSender'
import { arrayOf, bool, object, optional, text } from './payloadSchema'
import fs from 'node:fs'
import {
  confirmImportSites,
  createSite,
  deleteSite,
  exportSitesConfig,
  getAllSites,
  getSiteById,
  previewImportSites,
  toggleSite,
  updateSite,
} from '../db/repositories/siteRepository'
import { errorMessage } from '../shared/errors'

interface RegisterSitesIpcOptions {
  getParentWindow?: (event: IpcMainInvokeEvent) => BrowserWindow | null
  notifyProblemsUpdated?: (event: IpcMainInvokeEvent) => void
  refreshUserScriptRuntime?: () => void
}

/*
 * 站点配置的字段界。三个 channel（create / update / confirmImport）用的是同一套字段，
 * 界写在这里一次，理由也只写一次：
 *
 * - `siteId` / `siteName` 走 `text()` 默认的 200，沿用 `registerBrowserShellIpc` 里
 *   既有的手写上限，不另立标准。
 * - `homeUrl` 上限 4096：项目里 URL 的既有口径就是这个数（`tabSessionSnapshot.ts` 的
 *   `MAX_TAB_URL_LENGTH`、`userScriptNavigation.ts` 的 `MAX_NAVIGATION_URL_LENGTH`
 *   都是 4096）。
 * - `domain` 上限 253：FQDN 的长度上限，与 `userScriptMetadata.ts`、
 *   `UserScriptHostPermissionBroker.ts` 里的既有校验一致。
 * - `urlPattern` / `selector` 上限 512：内置站点里最长的 pattern 约 50 字符、最长的
 *   选择器约 45 字符（见 `db/repositories/site/builtins.ts`），512 留足余量。
 * - 数组条数（domains 32 / patterns 64 / selectors 32）：内置站点的实际最大值分别是
 *   3 / 4 / 3，取一个量级的余量。给上限的意义不是猜用户会写多少，而是让
 *   `JSON.stringify` 进 DB 的那一列不会被一次调用撑到任意大。
 * - `cookiePolicy` / `adapter` 上限 64：两者都是短枚举串（`'session-only'`、
 *   `'vault-readable'`、平台名）。刻意不写成 `oneOf`——类型声明是 `string`，
 *   收成闭集会让新增平台时在这里静默失败。
 */
const siteId = () => text()
const siteName = () => text()
const siteHomeUrl = () => text({ max: 4096 })
const siteDomains = () => arrayOf(text({ max: 253 }), { max: 32 })
const siteUrlPatterns = () => arrayOf(text({ max: 512 }), { max: 64 })
const siteSelectors = () => arrayOf(text({ max: 512 }), { max: 32 })
const siteCookiePolicy = () => text({ max: 64 })
const siteAdapter = () => text({ max: 64 })

/*
 * `sites:create` 的形状是 `Omit<SiteConfigData, 'isBuiltin'>`。可选性不是照抄 `?`，
 * 是照抄调用点：唯一调用点（`settingsApi.ts` 的 `createSiteFromDraft`）只发
 * `{ id, name, domains, homeUrl, enabled, problemUrlPatterns }`，其余字段一律 `optional`。
 *
 * `isBuiltin` 刻意不在 shape 里：`object()` 默认拒绝多余字段，于是渲染进程没法把自建
 * 站点标成内置站点——与 `createSite` 把 `is_builtin` 写死成 0 的 SQL 是同一个结论。
 */
const siteCreateShape = () => object({
  id: siteId(),
  name: siteName(),
  domains: siteDomains(),
  homeUrl: siteHomeUrl(),
  enabled: bool,
  problemUrlPatterns: optional(siteUrlPatterns()),
  submitUrlPatterns: optional(siteUrlPatterns()),
  loginUrlPatterns: optional(siteUrlPatterns()),
  loginUsernameSelectors: optional(siteSelectors()),
  loginPasswordSelectors: optional(siteSelectors()),
  cookiePolicy: optional(siteCookiePolicy()),
  adapter: optional(siteAdapter()),
})

/*
 * `sites:update` 的形状是 `Partial<SiteConfigData>`：`updateSite` 逐字段判
 * `!== undefined` 决定进不进 SET 子句，所以每一项都是 `optional`。
 *
 * `isBuiltin` 同样不在 shape 里，理由与 create 一致（`object()` 拒绝多余字段），
 * 而且更要紧：`updateSite` 不校验 `is_builtin`，若允许这个字段传进来，渲染进程就能把
 * 内置站点改成自建、或反过来。
 */
const siteUpdateShape = () => object({
  id: optional(siteId()),
  name: optional(siteName()),
  domains: optional(siteDomains()),
  homeUrl: optional(siteHomeUrl()),
  enabled: optional(bool),
  problemUrlPatterns: optional(siteUrlPatterns()),
  submitUrlPatterns: optional(siteUrlPatterns()),
  loginUrlPatterns: optional(siteUrlPatterns()),
  loginUsernameSelectors: optional(siteSelectors()),
  loginPasswordSelectors: optional(siteSelectors()),
  cookiePolicy: optional(siteCookiePolicy()),
  adapter: optional(siteAdapter()),
})

/*
 * `sites:confirmImport` 收的是整份站点数组，所以这里要的是**完整**形状而不是 Partial：
 * `confirmImportSites` 会把每一项当成一条完整记录交给 `createSite` / `updateSite`。
 *
 * `isBuiltin` 是必填的——它和 create/update 不一样：导入预览
 * （`previewImportSites`）产出的每一项都带着这个字段，UI 原样回传。但**形状校验拦不住
 * 越权**：`confirmImportSites` 不会重跑 `parseImportedSite`，而 `updateSite` 不看
 * `is_builtin`，所以一份把内置站点 id 同时写进 `sites` 与 `overwriteIds` 的载荷，
 * 能覆盖掉内置站点行。那个缺口在 `site/importExport.ts` 里堵，不是 schema 的活
 * （见该文件里 `is_builtin` 的守卫）。
 *
 * 50 条上限：导出文件是本应用自己产出的，内置站点 7 个，加上自建的量级远不到这个数。
 */
const siteImportShape = () => arrayOf(object({
  id: siteId(),
  name: siteName(),
  domains: siteDomains(),
  homeUrl: siteHomeUrl(),
  enabled: bool,
  isBuiltin: bool,
  problemUrlPatterns: optional(siteUrlPatterns()),
  submitUrlPatterns: optional(siteUrlPatterns()),
  loginUrlPatterns: optional(siteUrlPatterns()),
  loginUsernameSelectors: optional(siteSelectors()),
  loginPasswordSelectors: optional(siteSelectors()),
  cookiePolicy: optional(siteCookiePolicy()),
  adapter: optional(siteAdapter()),
}), { max: 50 })

export function registerSitesIpc(options: RegisterSitesIpcOptions = {}): void {
  const getParentWindow = (event: IpcMainInvokeEvent): BrowserWindow | null => (
    options.getParentWindow?.(event) ?? getShellWindowOwner(event)?.browserWindow ?? null
  )
  ipcMain.handle('sites:getAll', () => {
    return getAllSites()
  })

  ipcMain.handle('sites:getById', [siteId()], (_event, id) => {
    return getSiteById(id)
  })

  ipcMain.handle('sites:create', [siteCreateShape()], (_event, data) => {
    const result = createSite(data)
    options.refreshUserScriptRuntime?.()
    return result
  })

  ipcMain.handle('sites:update', [siteId(), siteUpdateShape()], (_event, id, data) => {
    const result = updateSite(id, data)
    if (result) options.refreshUserScriptRuntime?.()
    return result
  })

  ipcMain.handle('sites:toggle', [siteId(), bool], (_event, id, enabled) => {
    const result = toggleSite(id, enabled)
    if (result) options.refreshUserScriptRuntime?.()
    return result
  })

  ipcMain.handle('sites:delete', [siteId()], (_event, id) => {
    const result = deleteSite(id)
    if (result) options.refreshUserScriptRuntime?.()
    return result
  })

  ipcMain.handle('sites:exportConfig', async (event) => {
    try {
      const parentWindow = getParentWindow(event)
      const dialogOptions: SaveDialogOptions = {
        title: '导出站点配置',
        defaultPath: 'algo-sites-config.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      }
      const result = parentWindow
        ? await dialog.showSaveDialog(parentWindow, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions)
      if (result.canceled || !result.filePath) return { success: false, error: '取消导出' }

      const data = exportSitesConfig()
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
      return { success: true, path: result.filePath, count: data.sites.length }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('sites:importConfig', async (event) => {
    try {
      const parentWindow = getParentWindow(event)
      const dialogOptions: OpenDialogOptions = {
        title: '导入站点配置',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      }
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)
      if (result.canceled || result.filePaths.length === 0) return { success: false, error: '取消导入' }

      const raw = fs.readFileSync(result.filePaths[0], 'utf-8')
      const data = JSON.parse(raw) as unknown
      const preview = previewImportSites(data)
      return { success: true, preview }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('sites:confirmImport', [
    siteImportShape(),
    arrayOf(siteId(), { max: 50 }),
  ], (event, sites, overwriteIds) => {
    try {
      const result = confirmImportSites(sites, overwriteIds)
      options.refreshUserScriptRuntime?.()
      options.notifyProblemsUpdated?.(event)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  })
}
