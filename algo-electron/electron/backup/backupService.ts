import fs from 'node:fs'
import path from 'node:path'
import { getDb, getDbPath } from '../db/connection'
import { nowBeijing } from '../shared/time'
import {
  exportLearningData,
  importLearningData,
  parseLearningDataExport,
  previewLearningDataImport,
} from './learningDataExport'
import type {
  DatabaseBackupResult,
  ImportPreview,
  ImportResult,
  LearningDataExport,
  LearningDataExportFileResult,
} from './types'

export async function createDatabaseBackup(targetDir: string): Promise<DatabaseBackupResult> {
  try {
    fs.mkdirSync(targetDir, { recursive: true })
    const backupPath = path.join(targetDir, `AlgoLearningPlatform-backup-${backupTimestamp()}.sqlite`)
    await getDb().backup(backupPath)
    return { success: true, path: backupPath }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

export function getCurrentDatabasePath(): string {
  return getDbPath()
}

export function exportLearningDataToFile(filePath: string): LearningDataExportFileResult {
  try {
    const data = exportLearningData()
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return {
      success: true,
      path: filePath,
      counts: Object.fromEntries(
        Object.entries(data.tables).map(([table, rows]) => [table, rows.length]),
      ),
    }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

export function readLearningDataExportFile(filePath: string): LearningDataExport {
  const raw = fs.readFileSync(filePath, 'utf-8')
  return parseLearningDataExport(JSON.parse(raw) as unknown)
}

export function previewLearningDataImportFile(filePath: string): { data?: LearningDataExport; preview: ImportPreview } {
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

export function importLearningDataFromParsedExport(
  data: LearningDataExport,
  overwriteConflicts = false,
): ImportResult {
  try {
    return importLearningData(data, overwriteConflicts)
  } catch (error) {
    return {
      success: false,
      inserted: {},
      updated: {},
      skipped: {},
      conflicts: [],
      error: errorMessage(error),
    }
  }
}

function backupTimestamp(): string {
  return nowBeijing().replace(/[-:T.]/g, '').slice(0, 14)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
