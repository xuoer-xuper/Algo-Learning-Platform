import fs from 'node:fs'
import path from 'node:path'
import { getDb, getDbPath } from '../db/connection'
import { nowBeijing } from '../shared/time'
import { ERROR_CODES } from '../../src/shared/constants/errorCodes'
import type { IpcOutput } from '../../src/shared/types/common'
import { logger } from '../shared/logger'
import {
  exportLearningData,
  importLearningData,
  parseLearningDataExport,
  previewLearningDataImport,
} from './learningDataExport'
import type { ImportConflict, ImportPreview, LearningDataExport } from './types'
import { errorMessage } from '../shared/errors'

const log = logger.scope('backup')

/** 学习数据导入计数包：inserted/updated/skipped 按表名计数，conflicts 是逐条冲突明细。 */
export interface LearningDataImportCounts {
  inserted: Record<string, number>
  updated: Record<string, number>
  skipped: Record<string, number>
  conflicts: ImportConflict[]
}

export async function createDatabaseBackup(
  targetDir: string,
): Promise<IpcOutput<{ path: string }>> {
  try {
    fs.mkdirSync(targetDir, { recursive: true })
    const backupPath = path.join(
      targetDir,
      `AlgoLearningPlatform-backup-${backupTimestamp()}.sqlite`,
    )
    await getDb().backup(backupPath)
    return { success: true, data: { path: backupPath } }
  } catch (error) {
    // 原始异常只进日志；`error` 字段是给用户的固定文案，不带内部细节。
    log.warn('create-database-backup-failed', { error })
    return { success: false, error: '创建数据库备份失败', code: ERROR_CODES.IO }
  }
}

export function getCurrentDatabasePath(): string {
  return getDbPath()
}

export function exportLearningDataToFile(
  filePath: string,
): IpcOutput<{ path: string; counts: Record<string, number> }> {
  try {
    const data = exportLearningData()
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return {
      success: true,
      data: {
        path: filePath,
        counts: Object.fromEntries(
          Object.entries(data.tables).map(([table, rows]) => [table, rows.length]),
        ),
      },
    }
  } catch (error) {
    log.warn('export-learning-data-failed', { error })
    return { success: false, error: '导出学习数据失败', code: ERROR_CODES.IO }
  }
}

export function readLearningDataExportFile(filePath: string): LearningDataExport {
  const raw = fs.readFileSync(filePath, 'utf-8')
  return parseLearningDataExport(JSON.parse(raw) as unknown)
}

export function previewLearningDataImportFile(filePath: string): {
  data?: LearningDataExport
  preview: ImportPreview
} {
  try {
    const data = readLearningDataExportFile(filePath)
    return { data, preview: previewLearningDataImport(data) }
  } catch (error) {
    return {
      preview: {
        valid: false,
        counts: {},
        new_counts: {},
        duplicate_counts: {},
        conflicts: [],
        error: errorMessage(error),
      },
    }
  }
}

/**
 * 执行导入并把仓库层的 `ImportResult` 映射成 IPC 输出联合。
 *
 * 失败时不再把空计数包塞进失败分支（旧形状里 `inserted: {}` 这类占位字段零信息）：
 * 冲突明细属于成功侧的 `data`；失败侧只留 `error` 文案与 `code`——冲突未确认走
 * `CONFLICT`，其余（含未捕获异常）归 `IO`。
 */
export function importLearningDataFromParsedExport(
  data: LearningDataExport,
  overwriteConflicts = false,
): IpcOutput<LearningDataImportCounts> {
  try {
    const result = importLearningData(data, overwriteConflicts)
    if (result.success === true) {
      return {
        success: true,
        data: {
          inserted: result.inserted,
          updated: result.updated,
          skipped: result.skipped,
          conflicts: result.conflicts,
        },
      }
    }
    return {
      success: false,
      error: result.error ?? '导入学习数据失败',
      code: result.conflicts.length > 0 ? ERROR_CODES.CONFLICT : ERROR_CODES.IO,
    }
  } catch (error) {
    log.warn('import-learning-data-failed', { error })
    return { success: false, error: '导入学习数据失败', code: ERROR_CODES.IO }
  }
}

function backupTimestamp(): string {
  return nowBeijing()
    .replace(/[-:T.]/g, '')
    .slice(0, 14)
}
