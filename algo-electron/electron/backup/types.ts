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

export interface ImportConflict {
  entity_type: string
  entity_id: string
  reason: string
}

export interface ImportPreview {
  valid: boolean
  schema_version?: number
  counts: Record<string, number>
  new_counts: Record<string, number>
  duplicate_counts: Record<string, number>
  conflicts: ImportConflict[]
  error?: string
}

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
 * 改为 `IpcOutput<…>`（`src/shared/types/common.ts`），IPC 边界的镜像类型在
 * `electron-env.d.ts`。`ImportResult` 保留——它是 `importLearningData` 的仓库层
 * 内部形状，由 `backupService.importLearningDataFromParsedExport` 映射成联合。
 */
