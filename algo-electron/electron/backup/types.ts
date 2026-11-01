export const LEARNING_DATA_EXPORT_VERSION = 1
export const LEARNING_DATA_EXPORT_APP = 'algo-learning-platform'

export type ExportRow = Record<string, string | number | null>

export interface LearningDataExport {
  app: typeof LEARNING_DATA_EXPORT_APP
  schema_version: typeof LEARNING_DATA_EXPORT_VERSION
  exported_at: string
  metadata: {
    excluded: string[]
    excluded_tables: string[]
    excluded_fields: string[]
    complete_backup_hint: string
  }
  tables: {
    problems: ExportRow[]
    problem_visits: ExportRow[]
    submissions: ExportRow[]
    user_daily_stats: ExportRow[]
    platform_accounts: ExportRow[]
    rating_history: ExportRow[]
  }
}

import type {
  LearningDataImportConflict,
  LearningDataImportPreview,
} from '../../src/shared/types/backup'

/*
 * 仓库内部名沿用旧名（ImportConflict/ImportPreview），形状收口到 shared 的
 * LearningDataImport*（阶段 2 R2）——此前与 site 域的同名类型是两份独立定义，
 * 现在只剩 shared 一份形状、这里的两个别名。
 */
export type ImportConflict = LearningDataImportConflict

export type ImportPreview = LearningDataImportPreview

export interface ImportResult {
  success: boolean
  inserted: Record<string, number>
  updated: Record<string, number>
  skipped: Record<string, number>
  conflicts: ImportConflict[]
  error?: string
}

/*
 * 旧形状 `DatabaseBackupResult` / `LearningDataExportFileResult`（散装
 * `{ success, path?, error? }`）已随阶段 1 R4 删除：backupService 的对外返回
 * 改为 `IpcOutput<…>`（`src/shared/types/common.ts`）；跨进程形状现在单一来源在
 * `src/shared/types/backup.ts`（阶段 2 R2 收口，`electron-env.d.ts` 已删除）。`ImportResult` 保留——它是 `importLearningData` 的仓库层
 * 内部形状，由 `backupService.importLearningDataFromParsedExport` 映射成联合。
 */
