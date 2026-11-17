import { z } from 'zod'
import type { IpcOutput } from './common'

/*
 * 站点管理域的跨进程类型（阶段 2 R2 从 electron-env.d.ts 收口）。
 * 收口前的权威定义：electron/db/repositories/site/types.ts 的 SiteConfigData
 * （主进程内部名）——形状与本文件 SiteConfigRecord 一致；该仓库的
 * ImportPreview/ImportConflict 与渲染层 siteManagementTypes.ts 的三份同名副本
 * 一并收口到这里（域名前缀 Site 前置，与 backup 域的 LearningDataImportPreview
 * 区分开——两者是同名的不同域类型，收口前靠 import 上下文区分）。
 */

export const siteConfigRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  domains: z.array(z.string()),
  homeUrl: z.string(),
  enabled: z.boolean(),
  problemUrlPatterns: z.array(z.string()).optional(),
  submitUrlPatterns: z.array(z.string()).optional(),
  loginUrlPatterns: z.array(z.string()).optional(),
  loginUsernameSelectors: z.array(z.string()).optional(),
  loginPasswordSelectors: z.array(z.string()).optional(),
  cookiePolicy: z.string().optional(),
  adapter: z.string().optional(),
  isBuiltin: z.boolean(),
})

/** sites 表行的 IPC 投影（sites:getAll / getSiteById / confirmImport 载荷）。 */
export type SiteConfigRecord = z.infer<typeof siteConfigRecordSchema>

/** sites:create 的载荷：新建站点一定是自定义站点，isBuiltin 由 main 定为 false。 */
export type SiteConfigCreateInput = Omit<SiteConfigRecord, 'isBuiltin'>

export const siteImportConflictSchema = z.object({
  id: z.string(),
  name: z.string(),
  existing: siteConfigRecordSchema,
  incoming: siteConfigRecordSchema,
})

/** 站点导入冲突：同一 id 已存在且内容不一致。 */
export type SiteImportConflict = z.infer<typeof siteImportConflictSchema>

export const siteImportPreviewSchema = z.object({
  newSites: z.array(siteConfigRecordSchema),
  conflicts: z.array(siteImportConflictSchema),
  builtinSkipped: z.array(siteConfigRecordSchema),
})

/** 站点配置导入预览（sites:importConfig 的 data.preview）。 */
export type SiteImportPreview = z.infer<typeof siteImportPreviewSchema>

/*
 * 统一输出联合（阶段 1 R4 createOutputSchema）的共享定义：收口前
 * electron-env.d.ts 里是手写镜像，这里直接用 IpcOutput 从 schema 推导，
 * 与 tests/ipc/ipcOutputShapes.test.ts 的边界实测互补。
 */

/** sites:exportConfig 的结果。 */
export type SiteExportResult = IpcOutput<{ path: string; count: number }>

/** sites:importConfig 的结果。 */
export type SiteImportResult = IpcOutput<{ preview: SiteImportPreview }>

/** sites:confirmImport 的结果。 */
export type SiteConfirmImportResult = IpcOutput<{ imported: number; overwritten: number }>
