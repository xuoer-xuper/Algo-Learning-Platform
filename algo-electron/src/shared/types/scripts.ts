import { z } from 'zod'

/*
 * 用户脚本域的跨进程类型（阶段 2 R2 从 electron-env.d.ts 收口）。
 * 收口前的权威定义：electron/scripts/UserScriptRemoteInstaller.ts（安装预览）、
 * UserScriptUpdateService.ts（更新结果）、UserScriptHostPermissionBroker.ts
 * （宿主权限）、electron/db/repositories/userScript/ 的记录行。安装/取码/开编
 * 辑结果是判别联合，按 design §3 用 z.discriminatedUnion。
 */

export const userScriptRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 站点关联以 JSON 数组存储（scripts 表的 site_ids_json 列）。 */
  site_ids_json: z.string().nullable(),
  enabled: z.boolean(),
  has_file: z.boolean(),
})

/** scripts 表行的 IPC 投影（scripts:getAll）。 */
export type UserScriptRecord = z.infer<typeof userScriptRecordSchema>

export const userScriptSaveInputSchema = z.object({
  name: z.string(),
  site_ids_json: z.string(),
})

/** scripts:save 的编辑载荷（site_ids_json 由 main 侧校验为无重复非空数组）。 */
export type UserScriptSaveInput = z.infer<typeof userScriptSaveInputSchema>

export const pendingUserScriptInstallSchema = z.object({
  installId: z.string(),
  sourceUrl: z.string(),
  sourceFileName: z.string(),
  createdAt: z.string(),
})

/** 待确认的远程脚本安装（browser:getUserScriptInstall，带 TTL 的注册表条目）。 */
export type PendingUserScriptInstall = z.infer<typeof pendingUserScriptInstallSchema>

/** 安装确认动作：安装 / 仅复制源码 / 取消。 */
export type UserScriptInstallAction = 'install' | 'copy' | 'cancel'

export const userScriptInstallPreviewSchema = z.object({
  installId: z.string(),
  sourceUrl: z.string(),
  finalUrl: z.string(),
  sourceFileName: z.string(),
  name: z.string(),
  namespace: z.string().nullable(),
  version: z.string().nullable(),
  installedVersion: z.string().nullable(),
  description: z.string().nullable(),
  updateURL: z.string().nullable(),
  downloadURL: z.string().nullable(),
  matches: z.array(z.string()),
  includes: z.array(z.string()),
  excludes: z.array(z.string()),
  excludeMatches: z.array(z.string()),
  grants: z.array(z.string()),
  connects: z.array(z.string()),
  antifeatures: z.array(z.string()),
  requires: z.number(),
  resources: z.array(z.string()),
  action: z.enum(['create', 'update']),
  existingScriptId: z.string().nullable(),
  versionComparison: z.enum(['newer', 'same', 'older', 'unknown']),
})

/**
 * 远程脚本安装预览（scripts:getRemoteInstallPreview）。刻意不含脚本源码与
 * 资源体（domain-rules §9）：源码只在确认后按 id 经 scripts:getCode 取。
 */
export type UserScriptInstallPreview = z.infer<typeof userScriptInstallPreviewSchema>

export const userScriptInstallInstallResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('installed'),
    /** action=copy 时是复制产物的 id，可能不同于被更新的脚本。 */
    scriptId: z.string().optional(),
  }),
  z.object({ status: z.literal('cancelled') }),
  z.object({ status: z.literal('stale') }),
])

/** scripts:confirmRemoteInstall 的结果（stale = installId 已过期）。 */
export type UserScriptInstallInstallResult = z.infer<typeof userScriptInstallInstallResultSchema>

export const userScriptUpdateResultSchema = z.object({
  scriptId: z.string(),
  name: z.string(),
  status: z.enum(['updated', 'current', 'skipped', 'error']),
  previousVersion: z.string().nullable(),
  version: z.string().nullable(),
  error: z.string().optional(),
})

/** 单个脚本的更新检查结果。 */
export type UserScriptUpdateResult = z.infer<typeof userScriptUpdateResultSchema>

export const userScriptUpdateSummarySchema = z.object({
  checked: z.number(),
  updated: z.number(),
  current: z.number(),
  skipped: z.number(),
  failed: z.number(),
  results: z.array(userScriptUpdateResultSchema),
})

/** scripts:checkUpdates 的汇总（null = 已有检查在进行）。 */
export type UserScriptUpdateSummary = z.infer<typeof userScriptUpdateSummarySchema>

export const userScriptCodeViewSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), scriptId: z.string(), code: z.string() }),
  z.object({ status: z.literal('not-found') }),
  z.object({ status: z.literal('unmanaged') }),
  z.object({ status: z.literal('unreadable') }),
  z.object({ status: z.literal('too-large'), limitBytes: z.number() }),
])

/** scripts:getCode 的结果。源码只在此 channel 返回且上限 4 MiB（domain-rules §9）。 */
export type UserScriptCodeView = z.infer<typeof userScriptCodeViewSchema>

export const userScriptOpenEditorResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok') }),
  z.object({ status: z.literal('not-found') }),
  z.object({ status: z.literal('unmanaged') }),
  z.object({ status: z.literal('open-failed') }),
])

/** scripts:openEditor 的结果（只打开托管目录内的 .js，domain-rules §9）。 */
export type UserScriptOpenEditorResult = z.infer<typeof userScriptOpenEditorResultSchema>

export const userScriptHostPermissionPromptSchema = z.object({
  promptId: z.string(),
  scriptName: z.string(),
  targetHost: z.string(),
  sourceHost: z.string(),
})

/**
 * 宿主权限确认弹窗的负载（userscript:hostPermissionRequested）。刻意只带
 * promptId/scriptName/双 host——无 URL path、query、headers（domain-rules §9）。
 */
export type UserScriptHostPermissionPrompt = z.infer<typeof userScriptHostPermissionPromptSchema>

/** 用户对宿主权限弹窗的应答（persist-failed/stale 是 main 侧的回执结果）。 */
export type UserScriptHostPermissionResponse = 'allowed' | 'denied' | 'persist-failed' | 'stale'
