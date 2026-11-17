import { z } from 'zod'

/*
 * 凭据域的跨进程类型（阶段 2 R2 从 electron-env.d.ts 收口）。
 * 收口前的权威定义：electron/credentials/credentialVaultCore.ts（CredentialSummary）、
 * autofill/CredentialAutofillService.ts、captureTypes.ts。
 *
 * 红线（domain-rules §3）：这些是"脱敏摘要"类型——只有掩码 masked 与存在性，
 * 明文口令只走 main ↔ OJ preload 的 oj-credentials:fill/capture 内部通道，
 * 不在本文件的任何类型里。
 */

export const credentialSummarySchema = z.object({
  credentialId: z.string(),
  siteId: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  masked: z.string(),
  lastUsedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

/** 凭据列表项（credentials:list / rename 的输出；值永远是掩码）。 */
export type CredentialSummary = z.infer<typeof credentialSummarySchema>

export const credentialAutofillPromptSchema = z.object({
  requestId: z.string(),
  siteId: z.string(),
  pageUrl: z.string(),
  credentials: z.array(
    credentialSummarySchema.pick({
      credentialId: true,
      siteId: true,
      username: true,
      displayName: true,
      masked: true,
    }),
  ),
})

/** 自动填充确认弹窗（credentials:autofillPrompt 的负载；autofill 永不代提交表单）。 */
export type CredentialAutofillPrompt = z.infer<typeof credentialAutofillPromptSchema>

/** 捕获确认动作：保存新凭据 / 更新同用户名凭据 / 取消。 */
export type CredentialCaptureAction = 'save' | 'update' | 'cancel'

export const credentialCapturePromptSchema = z.object({
  captureId: z.string(),
  siteId: z.string(),
  siteName: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  masked: z.string(),
  isUpdate: z.boolean(),
})

/** 捕获确认弹窗（credentials:capturePrompt 的负载）。 */
export type CredentialCapturePrompt = z.infer<typeof credentialCapturePromptSchema>

export const credentialCaptureResultSchema = z.object({
  captureId: z.string(),
  success: z.boolean(),
  error: z.enum(['save-failed']).optional(),
})

/** 捕获动作的异步回执（credentials:captureResult 推送）。 */
export type CredentialCaptureResult = z.infer<typeof credentialCaptureResultSchema>
