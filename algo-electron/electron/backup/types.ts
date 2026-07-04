export const LEARNING_DATA_EXPORT_VERSION = 1
export const LEARNING_DATA_EXPORT_APP = 'algo-learning-platform'

export type ExportRow = Record<string, string | number | null>

export interface LearningDataExport {
  app: typeof LEARNING_DATA_EXPORT_APP
  schema_version: typeof LEARNING_DATA_EXPORT_VERSION
  exported_at: string
  metadata: {
    excluded: string[]
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

export interface DatabaseBackupResult {
  success: boolean
  path?: string
  error?: string
}

export interface LearningDataExportFileResult {
  success: boolean
  path?: string
  counts?: Record<string, number>
  error?: string
}
