import { z } from 'zod'
import type { IpcOutput } from './common'

/*
 * 备份与导入导出域的跨进程类型（阶段 2 R2 从 electron-env.d.ts 收口）。
 * 收口前的权威定义：electron/backup/types.ts 的仓库内部形状
 * （ImportPreview/ImportConflict——那两个名字与站点导入域撞名，本文件的
 * LearningData 前缀名才是跨进程契约）；JSON 导出本体（LearningDataExport）
 * 是主进程内部形状，留在 electron/backup/types.ts 不进 shared。
 */

export const learningDataImportConflictSchema = z.object({
  entity_type: z.string(),
  entity_id: z.string(),
  reason: z.string(),
})

/** 学习数据导入冲突项。 */
export type LearningDataImportConflict = z.infer<typeof learningDataImportConflictSchema>

export const learningDataImportPreviewSchema = z.object({
  valid: z.boolean(),
  schema_version: z.number().optional(),
  counts: z.record(z.string(), z.number()),
  new_counts: z.record(z.string(), z.number()),
  duplicate_counts: z.record(z.string(), z.number()),
  conflicts: z.array(learningDataImportConflictSchema),
  /** 结构诊断原文（对用户自己那份文件的说人话描述，非空即可展示）。 */
  error: z.string().optional(),
})

/** 学习数据导入预览（backup:previewLearningDataImport 的 data.preview）。 */
export type LearningDataImportPreview = z.infer<typeof learningDataImportPreviewSchema>

/*
 * 统一输出联合（阶段 1 R4 createOutputSchema）的共享定义：收口前
 * electron-env.d.ts 里是手写镜像，这里直接用 IpcOutput 从 schema 推导。
 */

/** backup:createDatabaseBackup 的结果。 */
export type DatabaseBackupResult = IpcOutput<{ path: string }>

/** backup:exportLearningData 的结果。 */
export type LearningDataExportFileResult = IpcOutput<{
  path: string
  counts: Record<string, number>
}>

/** backup:previewLearningDataImport 的结果。 */
export type LearningDataImportPreviewResult = IpcOutput<{ preview: LearningDataImportPreview }>

/** backup:confirmLearningDataImport 的结果。 */
export type LearningDataImportResult = IpcOutput<{
  inserted: Record<string, number>
  updated: Record<string, number>
  skipped: Record<string, number>
  conflicts: LearningDataImportConflict[]
}>
