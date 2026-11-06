import { z } from 'zod'
import type { IpcOutput } from './common'

/*
 * 平台账户与 rating 域的跨进程类型（阶段 2 R2 从 electron-env.d.ts 收口）。
 * 库内全行见 electron/db/repositories/account/types.ts 的 PlatformAccountRow
 * （多 raw_json 等列，字段全必填）；渲染层消费的是这个可选字段的宽投影，
 * 两份手抄的 CodeforcesAccount（settings/analytics 各一份）收口为 PlatformAccount。
 */

export const platformAccountSchema = z.object({
  id: z.string(),
  platform: z.string(),
  handle: z.string(),
  display_name: z.string().nullable().optional(),
  current_rating: z.number().nullable().optional(),
  peak_rating: z.number().nullable().optional(),
  last_synced_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

/** platform_accounts 行的 IPC 投影（rating:getAccount / getAccounts / getCodeforcesAccount）。 */
export type PlatformAccount = z.infer<typeof platformAccountSchema>

export const ratingHistoryRecordSchema = z.object({
  id: z.string().optional(),
  account_id: z.string().optional(),
  platform: z.string().optional(),
  contest_id: z.string().optional(),
  contest_name: z.string(),
  rank: z.number().nullable().optional(),
  rating_before: z.number().nullable().optional(),
  rating_after: z.number(),
  delta: z.number(),
  contest_at: z.string().nullable().optional(),
})

/** rating_history 行的 IPC 投影（rating:getHistory）。 */
export type RatingHistoryRecord = z.infer<typeof ratingHistoryRecordSchema>

/** 比赛结果 = rating 历史行（收口前 env.d.ts 的别名，保留同一写法）。 */
export type ContestResultRecord = RatingHistoryRecord

/**
 * `rating:syncCodeforces` 的输出（统一 IpcOutput 联合）。原先这个形状手抄在
 * registerRatingIpc 的返回标注与 preload 的返回断言两处，R3 起两边都引这个名字。
 */
export type CodeforcesSyncOutput = IpcOutput<{
  historyCount: number
  inserted: number
  peak: number | null
}>
