import {
  dialog,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron'
import { getShellWindowOwner, ipcMain } from './trustedSender'
import { confirmLearningDataImportInput } from '../../src/shared/types/ipc/backup'
import { ERROR_CODES } from '../../src/shared/constants/errorCodes'
import type { IpcOutput } from '../../src/shared/types/common'
import path from 'node:path'
import {
  createDatabaseBackup,
  exportLearningDataToFile,
  importLearningDataFromParsedExport,
  previewLearningDataImportFile,
  type LearningDataImportCounts,
} from '../backup/backupService'
import type { ImportPreview, LearningDataExport } from '../backup/types'
import { IPC_CHANNELS } from '../../src/shared/constants/channels'

interface RegisterBackupIpcOptions {
  getParentWindow?: (event: IpcMainInvokeEvent) => BrowserWindow | null
}

const pendingImports = new Map<string, LearningDataExport>()

function getOwnerId(event: IpcMainInvokeEvent): string | null {
  return getShellWindowOwner(event)?.id ?? null
}

function getParentWindow(
  event: IpcMainInvokeEvent,
  options: RegisterBackupIpcOptions,
): BrowserWindow | null {
  return options.getParentWindow?.(event) ?? getShellWindowOwner(event)?.browserWindow ?? null
}

export function registerBackupIpc(options: RegisterBackupIpcOptions = {}): void {
  ipcMain.handle(
    IPC_CHANNELS.BACKUP.CREATE_DATABASE_BACKUP,
    async (event): Promise<IpcOutput<{ path: string }>> => {
      const parentWindow = getParentWindow(event, options)
      const dialogOptions: OpenDialogOptions = {
        title: '选择数据库备份目录',
        properties: ['openDirectory', 'createDirectory'],
      }
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)
      // 用户取消不是失败类别，`code` 留空（见 errorCodes.ts 的说明）。
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '取消备份' }
      }
      return createDatabaseBackup(result.filePaths[0])
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.BACKUP.EXPORT_LEARNING_DATA,
    async (event): Promise<IpcOutput<{ path: string; counts: Record<string, number> }>> => {
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

      const filePath =
        path.extname(result.filePath).toLowerCase() === '.json'
          ? result.filePath
          : `${result.filePath}.json`
      return exportLearningDataToFile(filePath)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.BACKUP.PREVIEW_LEARNING_DATA_IMPORT,
    async (event): Promise<IpcOutput<{ preview: ImportPreview }>> => {
      const ownerId = getOwnerId(event)
      if (!ownerId) {
        return {
          success: false,
          error: '无法确定导入窗口，导入已取消',
          code: ERROR_CODES.FORBIDDEN,
        }
      }
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
      // `preview.error` 是对用户自己那份文件的结构诊断（"不是合法 JSON"之类），
      // 属于用户输入域的诊断信息而非内部异常细节，保留原文；解析/读文件的异常
      // 本体在 learningDataExport.ts 的 catch 里，不会出现在这里。
      if (!preview.valid) {
        return {
          success: false,
          error: preview.error ?? '导入文件校验未通过',
          code: ERROR_CODES.VALIDATION,
        }
      }
      return { success: true, data: { preview } }
    },
  )

  /*
   * 只收一个 `boolean`，没有界要挑。
   *
   * 要导入的数据本身不走这个 channel：它由 `backup:previewLearningDataImport` 从
   * 用户选中的文件里读出、按 `ownerId` 存在主进程的 `pendingImports` 里。渲染进程发过来的
   * 只是"冲突时是否覆盖"这一个开关——也就是说这里没有"结构化对象"要校验。
   * schema 元组见 `src/shared/types/ipc/backup.ts`。
   */
  ipcMain.handle(
    IPC_CHANNELS.BACKUP.CONFIRM_LEARNING_DATA_IMPORT,
    confirmLearningDataImportInput,
    (event, overwriteConflicts): IpcOutput<LearningDataImportCounts> => {
      const ownerId = getOwnerId(event)
      const pendingImport = ownerId ? (pendingImports.get(ownerId) ?? null) : null
      if (!pendingImport) {
        return {
          success: false,
          error: '没有待确认的导入数据，请先选择要导入的文件',
          code: ERROR_CODES.NOT_FOUND,
        }
      }

      const result = importLearningDataFromParsedExport(pendingImport, overwriteConflicts)
      if (result.success === true && ownerId) pendingImports.delete(ownerId)
      return result
    },
  )
}
