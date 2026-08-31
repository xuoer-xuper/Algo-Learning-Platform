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
/*
 * `domains` 要下限 1，不是形式主义：`createSiteFromDraft` 把输入框按逗号切开再
 * `.filter(Boolean)`，用户只填一个 `,` 就得到 `[]`——而面板那一侧只判了原始串非空
 * （`!domainsStr`），`","` 是真值，放行。落库之后 `findMatchingEnabledSite` 用
 * `.some()` 判定域名，空数组恒为假，于是这条站点在设置页显示"已启用"、实际永远匹配不上。
 *
 * update 侧同样按 1 起：`updateSite` 逐字段判 `!== undefined`，传 `domains: []`
 * 会把一条正常工作的站点的域名清空，症状和上面一样但更隐蔽（原本是好的）。
 */
const siteDomains = () => arrayOf(text({ max: 253 }), { min: 1, max: 32 })
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
 * 这里原先有一个 `sites:update` 渠道和它的 `Partial<SiteConfigData>` 形状，已删。
 *
 * 删的理由不是"没人用所以碍眼"，是它没人用**且**权限最大：`updateSite` 不看
 * `is_builtin`，所以这个渠道能改内置站点的 `domains` 与 `loginUrlPatterns`；而
 * `resolveCredentialAutofillTarget` 正是按这两个字段决定"这一页可以填哪个站点的密码"。
 * 把 codeforces 的 domains 加上一个自己控制的域名、再配一条匹配的 loginUrlPattern，
 * 保存的 Codeforces 密码就会被填进那个域名的页面。全站点里只有这一个渠道能做到这件事，
 * 而 `src/` 下没有任何调用点（`preload.ts` 的 `updateSite` 也一并删了）。
 *
 * 将来真要做站点编辑 UI，重新加回来时记得：形状里不能有 `isBuiltin`（`object()` 默认
 * 拒绝多余字段就够），而且要么在 `updateSite` 里补 `is_builtin` 守卫，要么在 handler 里
 * 先查一次——参照 `site/importExport.ts` 里 `confirmImportSites` 的那道守卫。
 * `updateSite` 现在唯一的调用点就是那里，守卫也在那里。
 */

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
