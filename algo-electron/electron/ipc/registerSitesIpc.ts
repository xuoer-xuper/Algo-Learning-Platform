import { dialog, ipcMain, type BrowserWindow, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
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
  type SiteConfigData,
} from '../db/repositories/siteRepository'

interface RegisterSitesIpcOptions {
  getParentWindow?: () => BrowserWindow | null
  notifyProblemsUpdated?: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerSitesIpc(options: RegisterSitesIpcOptions = {}): void {
  ipcMain.handle('sites:getAll', () => {
    return getAllSites()
  })

  ipcMain.handle('sites:getById', (_event, id: string) => {
    return getSiteById(id)
  })

  ipcMain.handle('sites:create', (_event, data: Omit<SiteConfigData, 'isBuiltin'>) => {
    return createSite(data)
  })

  ipcMain.handle('sites:update', (_event, id: string, data: Partial<SiteConfigData>) => {
    return updateSite(id, data)
  })

  ipcMain.handle('sites:toggle', (_event, id: string, enabled: boolean) => {
    return toggleSite(id, enabled)
  })

  ipcMain.handle('sites:delete', (_event, id: string) => {
    return deleteSite(id)
  })

  ipcMain.handle('sites:exportConfig', async () => {
    try {
      const parentWindow = options.getParentWindow?.()
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

  ipcMain.handle('sites:importConfig', async () => {
    try {
      const parentWindow = options.getParentWindow?.()
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

  ipcMain.handle('sites:confirmImport', (_event, sites: SiteConfigData[], overwriteIds: string[]) => {
    try {
      const result = confirmImportSites(sites, overwriteIds)
      options.notifyProblemsUpdated?.()
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  })
}
