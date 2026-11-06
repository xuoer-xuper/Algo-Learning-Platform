import { z } from 'zod'
import { submissionRecordSchema } from './submission'

/*
 * 题目域的跨进程类型（阶段 2 R2 从 electron-env.d.ts 收口）。
 *
 * ProblemRecord 是 problems 表行的 IPC 投影：仓库层全行见
 * electron/db/repositories/problem/types.ts 的 ProblemRow（多出 contest_id、
 * source_platform 等列），阶段 3 引入 Drizzle 后由 `$inferSelect` 与这里的
 * 输出 schema 对照、procedures 负责转换。
 *
 * 时间字段当前是 DB 里的 TEXT 本地时间串，所以是 z.string()；阶段 2 R5 把
 * 65 个时间列迁到 Unix 毫秒后，这些字段统一切 z.number()（spec shared/timestamp.md）。
 */

export const problemRecordSchema = z.object({
  id: z.string(),
  platform: z.string(),
  platform_problem_id: z.string(),
  canonical_url: z.string(),
  title: z.string().nullable(),
  status: z.string(),
  last_visited_at: z.string().nullable(),
  /** 列表附带的提交计数；problem:getDetail 用同名的必填版本覆盖。 */
  submission_count: z.number().optional(),
})

/** problems 表行的 IPC 投影（problem:listRecent 等）。 */
export type ProblemRecord = z.infer<typeof problemRecordSchema>

export const problemDetailRecordSchema = problemRecordSchema.extend({
  submission_count: z.number(),
  ac_count: z.number(),
  first_seen_at: z.string().nullable().optional(),
  submissions: z.array(submissionRecordSchema).optional(),
})

/** problem:getDetail 的输出：题目行 + 提交聚合 + 最近的提交行。 */
export type ProblemDetailRecord = z.infer<typeof problemDetailRecordSchema>

export const omniboxSuggestionSchema = z.object({
  problemId: z.string(),
  title: z.string().nullable(),
  platform: z.string(),
  platformProblemId: z.string(),
  url: z.string(),
  lastVisitedAt: z.string().nullable(),
  /** history = 按访问历史匹配；problem = 按题目库精确前缀匹配。 */
  source: z.enum(['history', 'problem']),
})

/** omnibox 联想项（browser:omniboxSuggest 的输出）。 */
export type OmniboxSuggestion = z.infer<typeof omniboxSuggestionSchema>
