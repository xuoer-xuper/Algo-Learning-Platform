import crypto from 'node:crypto'
import { getDb } from '../../connection'
import { nowBeijing, todayBeijing } from '../../../shared/time'
import type {
  CoachEventType,
  CoachFeedbackType,
} from '../../../coach/types'

/**
 * Coach 用户反馈 repository。
 *
 * 持久化用户对每次提示的反馈（helpful / not_helpful / dismiss / never_today），
 * 影响后续同类型提示频率与"今天别提醒"临时屏蔽。
 *
 * 不存储 Cookie / 源码 / 完整请求体，仅记录反馈类型与必要的关联 id。
 */

export interface CoachFeedbackRow {
  feedback_id: string
  intervention_id: string | null
  bubble_id: string | null
  feedback_type: string
  event_type: string | null
  problem_id: string | null
  local_day: string
  created_at: string
}

export interface InsertCoachFeedbackInput {
  intervention_id?: string | null
  bubble_id?: string | null
  feedback_type: CoachFeedbackType
  event_type?: CoachEventType | null
  problem_id?: string | null
}

export function insertCoachFeedback(input: InsertCoachFeedbackInput): string {
  const id = crypto.randomUUID()
  const db = getDb()
  db.prepare(`
    INSERT INTO coach_feedback
      (feedback_id, intervention_id, bubble_id, feedback_type, event_type, problem_id, local_day, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.intervention_id ?? null,
    input.bubble_id ?? null,
    input.feedback_type,
    input.event_type ?? null,
    input.problem_id ?? null,
    todayBeijing(),
    nowBeijing(),
  )
  return id
}

export function listCoachFeedback(limit = 50): CoachFeedbackRow[] {
  const db = getDb()
  return db
    .prepare('SELECT * FROM coach_feedback ORDER BY created_at DESC LIMIT ?')
    .all(limit) as CoachFeedbackRow[]
}

/**
 * 列出统计窗口内的全部反馈（按时间降序），供阶段 4 指标页聚合使用。
 */
export function listCoachFeedbackSince(since: string, limit = 2000): CoachFeedbackRow[] {
  const db = getDb()
  return db
    .prepare(
      'SELECT * FROM coach_feedback WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(since, limit) as CoachFeedbackRow[]
}

/**
 * 查询"今天别提醒"的提示类型集合。
 * 规则引擎据此临时屏蔽当天同类提示。
 */
export function getNeverTodayEventTypes(day?: string): Set<CoachEventType> {
  const db = getDb()
  const localDay = day ?? todayBeijing()
  const rows = db
    .prepare(
      `SELECT DISTINCT event_type FROM coach_feedback
       WHERE feedback_type = 'never_today' AND local_day = ? AND event_type IS NOT NULL`,
    )
    .all(localDay) as { event_type: string }[]
  return new Set(rows.map((r) => r.event_type as CoachEventType))
}

export function countFeedbackByTypeSince(
  feedbackType: CoachFeedbackType,
  since: string,
): number {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM coach_feedback
       WHERE feedback_type = ? AND created_at >= ?`,
    )
    .get(feedbackType, since) as { n: number }
  return row.n
}

export function countNeverTodaySince(since: string): number {
  return countFeedbackByTypeSince('never_today', since)
}
