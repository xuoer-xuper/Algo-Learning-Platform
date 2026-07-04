import { dialog, ipcMain, type BrowserWindow, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import path from 'node:path'
import {
  createDatabaseBackup,
  exportLearningDataToFile,
  importLearningDataFromParsedExport,
  previewLearningDataImportFile,
} from '../backup/backupService'
import type { LearningDataExport } from '../backup/types'

interface RegisterBackupIpcOptions {
  getParentWindow?: () => BrowserWindow | null
}

let pendingImport: LearningDataExport | null = null

export function registerBackupIpc(options: RegisterBackupIpcOptions = {}): void {
  ipcMain.handle('backup:createDatabaseBackup', async () => {
    const parentWindow = options.getParentWindow?.()
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

  ipcMain.handle('backup:exportLearningData', async () => {
    const parentWindow = options.getParentWindow?.()
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

  ipcMain.handle('backup:previewLearningDataImport', async () => {
    const parentWindow = options.getParentWindow?.()
    const dialogOptions: OpenDialogOptions = {
      title: '导入学习数据',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    }
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    if (result.canceled || result.filePaths.length === 0) {
      pendingImport = null
      return { success: false, error: '取消导入' }
    }

    const { data, preview } = previewLearningDataImportFile(result.filePaths[0])
    pendingImport = preview.valid && data ? data : null
    return { success: preview.valid, preview, error: preview.error }
  })

  ipcMain.handle('backup:confirmLearningDataImport', (_event, overwriteConflicts: boolean) => {
    if (!pendingImport) {
      return { success: false, error: '没有待确认的导入数据', inserted: {}, updated: {}, skipped: {}, conflicts: [] }
    }

    const result = importLearningDataFromParsedExport(pendingImport, overwriteConflicts)
    if (result.success) {
      pendingImport = null
    }
    return result
  })
}
