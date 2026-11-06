import { z } from 'zod'

/*
 * 提交域的跨进程类型（阶段 2 R2 从 electron-env.d.ts 收口）。
 * 主进程权威定义：electron/db/repositories/problem/types.ts 的
 * ProblemSubmissionRow（DB 全行）与 electron/submissions/syncService.ts。
 * 这里的形状是 IPC 输出形状（仓库行经 procedure 投影后的子集）。
 */

export const submissionRecordSchema = z.object({
  id: z.string(),
  problem_id: z.string().optional(),
  platform: z.string().optional(),
  verdict: z.string(),
  language: z.string().nullable().optional(),
  submitted_at: z.number().int().nullable().optional(),
})

/** 题目详情里内嵌的提交行（problem:getDetail 的 submissions 列表项）。 */
export type SubmissionRecord = z.infer<typeof submissionRecordSchema>

export const syncResultSchema = z.object({
  platform: z.string(),
  fetched: z.number(),
  inserted: z.number(),
  error: z.string().optional(),
})

/** 手动同步一轮的计数结果（submissions:syncCodeforces / syncVjudge / syncCurrentPage）。 */
export type SyncResult = z.infer<typeof syncResultSchema>

export const realtimeSubmissionStatusSchema = z.object({
  ipcRegistered: z.boolean(),
  supportedAdapterIds: z.array(z.string()),
  lastPage: z
    .object({
      url: z.string(),
      realtimeAdapterId: z.string().optional(),
      realtimeSupported: z.boolean(),
      at: z.number().int(),
    })
    .optional(),
  lastHook: z
    .object({
      adapterId: z.string(),
      url: z.string(),
      status: z.enum(['success', 'failed', 'skipped']),
      reason: z.string().optional(),
      error: z.string().optional(),
      at: z.number().int(),
    })
    .optional(),
  lastDetection: z
    .object({
      senderUrl: z.string().optional(),
      inserted: z.boolean(),
      error: z.string().optional(),
      platform: z.string().optional(),
      verdict: z.string().optional(),
      problemId: z.string().optional(),
      at: z.number().int(),
    })
    .optional(),
})

/**
 * 实时提交监听的诊断快照（realtimeSubmission:getStatus）。
 * 权威定义在 electron/submissions/RealtimeSubmissionDiagnostics.ts，本类型收口后
 * 该模块改为从这里 import。
 */
export type RealtimeSubmissionStatus = z.infer<typeof realtimeSubmissionStatusSchema>
