import { dialog, type BrowserWindow, type IpcMainInvokeEvent, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { getShellWindowOwner, ipcMain } from './trustedSender'
import { bool } from './payloadSchema'
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

  /*
   * 只收一个 `boolean`，没有界要挑。
   *
   * 要导入的数据本身不走这个 channel：它由 `backup:previewLearningDataImport` 从
   * 用户选中的文件里读出、按 `ownerId` 存在主进程的 `pendingImports` 里。渲染进程发过来的
   * 只是"冲突时是否覆盖"这一个开关——也就是说这里没有"结构化对象"要校验，
   * 而 `bool` 不接受 `0/1/'true'` 这类等价物正好对上开关的语义。
   */
  ipcMain.handle('backup:confirmLearningDataImport', [bool], (event, overwriteConflicts) => {
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
