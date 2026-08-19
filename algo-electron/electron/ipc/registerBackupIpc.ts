import { dialog, type BrowserWindow, type IpcMainInvokeEvent, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { getShellWindowOwner, ipcMain } from './trustedSender'
import path from 'node:path'
import {
  createDatabaseBackup,
  exportLearningDataToFile,
  importLearningDataFromParsedExport,
  previewLearningDataImportFile,
} from '../backup/backupService'
import type { LearningDataExport } from '../backup/types'

interface RegisterBackupIpcOptions {
  getParentWindow?: (event: IpcMainInvokeEvent) => BrowserWindow | null
}

const pendingImports = new Map<string, LearningDataExport>()

function getOwnerId(event: IpcMainInvokeEvent): string | null {
  return getShellWindowOwner(event)?.id ?? null
}

function getParentWindow(event: IpcMainInvokeEvent, options: RegisterBackupIpcOptions): BrowserWindow | null {
  return options.getParentWindow?.(event) ?? getShellWindowOwner(event)?.browserWindow ?? null
}

export function registerBackupIpc(options: RegisterBackupIpcOptions = {}): void {
  ipcMain.handle('backup:createDatabaseBackup', async (event) => {
    const parentWindow = getParentWindow(event, options)
    const dialogOptions: OpenDialogOptions = {
      title: '选择数据库备份目录',
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '取消备份' }
    }
    return createDatabaseBackup(result.filePaths[0])
  })

  ipcMain.handle('backup:exportLearningData', async (event) => {
    const parentWindow = getParentWindow(event, options)
    const dialogOptions: SaveDialogOptions = {
      title: '导出学习数据',
      defaultPath: `algo-learning-data-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    }
    const result = parentWindow
      ? await dialog.showSaveDialog(parentWindow, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions)
    if (result.canceled || !result.filePath) {
      return { success: false, error: '取消导出' }
    }

    const filePath = path.extname(result.filePath).toLowerCase() === '.json'
      ? result.filePath
      : `${result.filePath}.json`
    return exportLearningDataToFile(filePath)
  })

  ipcMain.handle('backup:previewLearningDataImport', async (event) => {
    const ownerId = getOwnerId(event)
    if (!ownerId) return { success: false, error: '无法确定导入窗口' }
    const parentWindow = getParentWindow(event, options)
    const dialogOptions: OpenDialogOptions = {
      title: '导入学习数据',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    }
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    if (result.canceled || result.filePaths.length === 0) {
      pendingImports.delete(ownerId)
      return { success: false, error: '取消导入' }
    }

    const { data, preview } = previewLearningDataImportFile(result.filePaths[0])
    if (preview.valid && data) {
      pendingImports.set(ownerId, data)
      event.sender.once('destroyed', () => pendingImports.delete(ownerId))
    } else {
      pendingImports.delete(ownerId)
    }
    return { success: preview.valid, preview, error: preview.error }
  })

  ipcMain.handle('backup:confirmLearningDataImport', (event, overwriteConflicts: boolean) => {
    const ownerId = getOwnerId(event)
    const pendingImport = ownerId ? pendingImports.get(ownerId) ?? null : null
    if (!pendingImport) {
      return { success: false, error: '没有待确认的导入数据', inserted: {}, updated: {}, skipped: {}, conflicts: [] }
    }

    const result = importLearningDataFromParsedExport(pendingImport, overwriteConflicts)
    if (result.success && ownerId) pendingImports.delete(ownerId)
    return result
  })
}
