import {
  dialog,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron'
import { getShellWindowOwner, ipcMain } from './trustedSender'
import {
  confirmImportInput,
  createInput,
  deleteInput,
  getByIdInput,
  toggleInput,
} from '../../src/shared/types/ipc/sites'
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
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/sites.ts`；
 * 字段界（标识符 200 / URL 4096 / FQDN 253 / pattern 与 selector 512 / 数组条数）
 * 与"domains 下限 1"、"isBuiltin 不在 create 形状里"的理由都写在那里。
 *
 * 这里原先有一个 `sites:update` 渠道和它的 `Partial<SiteConfigData>` 形状，已删。
 *
 * 删的理由不是"没人用所以碍眼"，是它没人用**且**权限最大：`updateSite` 不看
 * `is_builtin`，所以这个渠道能改内置站点的 `domains` 与 `loginUrlPatterns`；而
 * `resolveCredentialAutofillTarget` 正是按这两个字段决定"这一页可以填哪个站点的密码"。
 * 把 codeforces 的 domains 加上一个自己控制的域名、再配一条匹配的 loginUrlPattern，
 * 保存的 Codeforces 密码就会被填进那个域名的页面。全站点里只有这一个渠道能做到这件事，
 * 而 `src/` 下没有任何调用点（`preload.ts` 的 `updateSite` 也一并删了）。
 *
 * 将来真要做站点编辑 UI，重新加回来时记得：形状里不能有 `isBuiltin`（strict 对象
 * 拒绝多余字段就够），而且要么在 `updateSite` 里补 `is_builtin` 守卫，要么在 handler 里
 * 先查一次——参照 `site/importExport.ts` 里 `confirmImportSites` 的那道守卫。
 * `updateSite` 现在唯一的调用点就是那里，守卫也在那里。
 */
export function registerSitesIpc(options: RegisterSitesIpcOptions = {}): void {
  const getParentWindow = (event: IpcMainInvokeEvent): BrowserWindow | null =>
    options.getParentWindow?.(event) ?? getShellWindowOwner(event)?.browserWindow ?? null
  ipcMain.handle('sites:getAll', () => {
    return getAllSites()
  })

  ipcMain.handle('sites:getById', getByIdInput, (_event, id) => {
    return getSiteById(id)
  })

  ipcMain.handle('sites:create', createInput, (_event, data) => {
    const result = createSite(data)
    options.refreshUserScriptRuntime?.()
    return result
  })

  ipcMain.handle('sites:toggle', toggleInput, (_event, id, enabled) => {
    const result = toggleSite(id, enabled)
    if (result) options.refreshUserScriptRuntime?.()
    return result
  })

  ipcMain.handle('sites:delete', deleteInput, (_event, id) => {
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
      if (result.canceled || result.filePaths.length === 0)
        return { success: false, error: '取消导入' }

      const raw = fs.readFileSync(result.filePaths[0], 'utf-8')
      const data = JSON.parse(raw) as unknown
      const preview = previewImportSites(data)
      return { success: true, preview }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('sites:confirmImport', confirmImportInput, (event, sites, overwriteIds) => {
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
