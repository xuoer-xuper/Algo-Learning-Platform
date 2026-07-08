/**
 * 默认 FeedbackRepository 适配器实现（生产环境）。
 *
 * 将 DB 依赖从 CoachFeedbackStore 中分离，便于单元测试注入 mock。
 * CoachFeedbackStore 仅保留 type-only import（InsertCoachFeedbackInput），
 * 不再静态导入 feedbackRepository 模块，从而避免在测试中拉入 better-sqlite3。
 *
 * 生产环境（CoachOrchestrator）应 import 本模块并显式传入 CoachFeedbackStore。
 */
import {
  insertCoachFeedback,
  listCoachFeedback,
  getNeverTodayEventTypes,
  countFeedbackByTypeSince,
  type InsertCoachFeedbackInput,
} from '../db/repositories/coach/feedbackRepository'
import { nowBeijing } from '../shared/time'
import type { FeedbackRepositoryAdapter } from './CoachFeedbackStore'
import type { CoachFeedbackType } from './types'

/**
 * 创建默认的 FeedbackRepositoryAdapter（委托 feedbackRepository 模块）。
 */
export function createDefaultRepository(): FeedbackRepositoryAdapter {
  return {
    insert: (input: InsertCoachFeedbackInput) => insertCoachFeedback(input),
    list: (limit: number) => listCoachFeedback(limit),
    getNeverTodayEventTypes: (day: string) => getNeverTodayEventTypes(day),
    countByTypeSince: (feedbackType: CoachFeedbackType, since: string) =>
      countFeedbackByTypeSince(feedbackType, since),
  }
}

/**
 * 静态工具：统计某类型反馈在指定时间窗口内的次数。
 * 供 CoachMetricsView（阶段 4）使用。
 */
export function countFeedbackSince(
  feedbackType: CoachFeedbackType,
  since: string,
): number {
  return countFeedbackByTypeSince(feedbackType, since)
}

/** 当前时间戳（与 nowBeijing 一致，便于审计追溯） */
export function currentTimestamp(): string {
  return nowBeijing()
}
