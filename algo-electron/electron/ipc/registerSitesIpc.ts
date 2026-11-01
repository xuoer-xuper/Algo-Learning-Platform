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
import { ERROR_CODES } from '../../src/shared/constants/errorCodes'
import type { IpcOutput } from '../../src/shared/types/common'
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

import type { SiteImportPreview } from '../../src/shared/types/sites'
import { logger } from '../shared/logger'
import { IPC_CHANNELS } from '../../src/shared/constants/channels'

const log = logger.scope('sites')

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
  ipcMain.handle(IPC_CHANNELS.SITES.GET_ALL, () => {
    return getAllSites()
  })

  ipcMain.handle(IPC_CHANNELS.SITES.GET_BY_ID, getByIdInput, (_event, id) => {
    return getSiteById(id)
  })

  ipcMain.handle(IPC_CHANNELS.SITES.CREATE, createInput, (_event, data) => {
    const result = createSite(data)
    options.refreshUserScriptRuntime?.()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.SITES.TOGGLE, toggleInput, (_event, id, enabled) => {
    const result = toggleSite(id, enabled)
    if (result) options.refreshUserScriptRuntime?.()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.SITES.DELETE, deleteInput, (_event, id) => {
    const result = deleteSite(id)
    if (result) options.refreshUserScriptRuntime?.()
    return result
  })

  ipcMain.handle(
    IPC_CHANNELS.SITES.EXPORT_CONFIG,
    async (event): Promise<IpcOutput<{ path: string; count: number }>> => {
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
        // 用户取消不是失败类别，`code` 留空（见 errorCodes.ts 的说明）。
        if (result.canceled || !result.filePath) return { success: false, error: '取消导出' }

        const data = exportSitesConfig()
        fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
        return { success: true, data: { path: result.filePath, count: data.sites.length } }
      } catch (error) {
        // 原始异常只进日志；`error` 字段是给用户的固定文案，不带内部细节。
        log.warn('export-config-failed', { error })
        return { success: false, error: '导出站点配置失败', code: ERROR_CODES.IO }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SITES.IMPORT_CONFIG,
    async (event): Promise<IpcOutput<{ preview: SiteImportPreview }>> => {
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
        const parsed = previewImportSites(data)
        // 旧形状这里把 `{valid:false, error}` 原样塞进 success:true 的 preview 字段
        // 交给渲染层；统一成联合后这类"文件结构不合法"就是失败分支，文案来自
        // previewImportSites 的固定诊断（'无效的配置数据'等），code 归 VALIDATION。
        if (!parsed.valid || !parsed.preview) {
          return {
            success: false,
            error: parsed.error ?? '站点配置文件校验未通过',
            code: ERROR_CODES.VALIDATION,
          }
        }
        return { success: true, data: { preview: parsed.preview } }
      } catch (error) {
        // 读文件与 JSON 解析都在这个 catch 里：文案对用户只说"文件读不出来"，
        // 是 IO 失败；原始解析错误进日志（`sites.import-config-failed`）。
        log.warn('import-config-failed', { error })
        return { success: false, error: '读取导入文件失败', code: ERROR_CODES.IO }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SITES.CONFIRM_IMPORT,
    confirmImportInput,
    (event, sites, overwriteIds): IpcOutput<{ imported: number; overwritten: number }> => {
      try {
        const result = confirmImportSites(sites, overwriteIds)
        options.refreshUserScriptRuntime?.()
        options.notifyProblemsUpdated?.(event)
        return { success: true, data: result }
      } catch (error) {
        log.warn('confirm-import-failed', { error })
        return { success: false, error: '导入站点配置失败', code: ERROR_CODES.IO }
      }
    },
  )
}
