import { z } from 'zod'

/*
 * 统计域跨进程读取类型以这里的 schema 为准；repository 可复用相同形状。
 * 有效日期写入/请求仍使用 YYYY-MM-DD；历史 daily cache 读取保留原始字符串和 NULL。
 * 仓库行名与 IPC 投影名保持兼容（如 RevisitStat vs RevisitStatsItem）。
 */

/** 平台分布的一行（problem/stats 两个仓库共用，收口前是两份同名重复）。 */
export const platformDistributionRowSchema = z.object({
  platform: z.string(),
  count: z.number(),
})
export type PlatformDistributionRow = z.infer<typeof platformDistributionRowSchema>

export const overviewStatsSchema = z.object({
  totalProblems: z.number(),
  todayVisited: z.number(),
  platformDistribution: z.array(platformDistributionRowSchema),
  lastActiveTime: z.number().int().nullable(),
})

/** 首页/设置页共用的学习总览（stats:getOverview）。 */
export type OverviewStats = z.infer<typeof overviewStatsSchema>

export const dailyActiveStatsSchema = z.object({
  local_day: z.string().nullable(),
  active_seconds: z.number(),
  duration_seconds: z.number(),
  visited: z.number(),
  solved: z.number(),
  submissions: z.number(),
  ac: z.number(),
})

/** user_daily_stats 行的 IPC 投影（stats:getDailyActive）。 */
export type DailyActiveStats = z.infer<typeof dailyActiveStatsSchema>

export const trendPointSchema = z.object({
  local_day: z.string().nullable(),
  count: z.number(),
})

/** 访问/AC 趋势的单日点（stats:getVisitedTrend / getAcTrend）。 */
export type TrendPoint = z.infer<typeof trendPointSchema>

export const submissionTrendPointSchema = z.object({
  local_day: z.string().nullable(),
  total: z.number(),
  ac: z.number(),
})

/** 提交趋势的单日点（stats:getSubmissionTrend）。 */
export type SubmissionTrendPoint = z.infer<typeof submissionTrendPointSchema>

export const problemVisitStatsSchema = z.object({
  total_visits: z.number(),
  total_duration: z.number(),
  total_active: z.number(),
  avg_duration: z.number(),
})

/** 单题访问聚合（stats:getProblemVisitStats；渲染层经 loadProblemDetail 并入详情）。 */
export type ProblemVisitStats = z.infer<typeof problemVisitStatsSchema>

export const timelineEventSchema = z.object({
  id: z.string().nullable(),
  event_type: z.string(),
  occurred_at: z.number().int(),
  platform: z.string().nullable(),
  url: z.string().nullable(),
  problem_id: z.string().nullable(),
})

/** 时间线事件行（stats:getTimeline）。 */
export type TimelineEvent = z.infer<typeof timelineEventSchema>

export const revisitStatsItemSchema = z.object({
  problem_id: z.string(),
  platform: z.string(),
  platform_problem_id: z.string(),
  title: z.string().nullable(),
  canonical_url: z.string(),
  visit_count: z.number(),
  last_visit: z.number().int(),
})

/** 复习统计行（stats:getRevisitStats）。 */
export type RevisitStatsItem = z.infer<typeof revisitStatsItemSchema>

export const wrongProblemItemSchema = z.object({
  id: z.string().nullable(),
  platform: z.string(),
  platform_problem_id: z.string(),
  title: z.string().nullable(),
  canonical_url: z.string(),
  wrong_count: z.number(),
  last_attempt: z.number().int(),
})

/** 错题行（stats:getWrongProblems）。 */
export type WrongProblemItem = z.infer<typeof wrongProblemItemSchema>

export const unreviewedProblemItemSchema = z.object({
  id: z.string().nullable(),
  platform: z.string(),
  platform_problem_id: z.string(),
  title: z.string().nullable(),
  canonical_url: z.string(),
  last_visited_at: z.number().int(),
  days_since: z.number(),
})

/** 超期未复习行（stats:getUnreviewed）。 */
export type UnreviewedProblemItem = z.infer<typeof unreviewedProblemItemSchema>
