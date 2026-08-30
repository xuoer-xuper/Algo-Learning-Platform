/**
 * 题目访问 repository：problem_visits 与配套 activity_events 的写入。
 *
 * 原名 electron/tracking/trackingRepository.ts —— 名字是 repository，位置却在
 * 业务层，SQL 因此落在 db 层之外。这里归位，函数名按写入对象改为 problemVisit，
 * 不再用 tracking 这个业务侧的名字指代数据访问。
 */
import { getDb } from '../connection'
import { upsertProblem } from './problemRepository'
import type { ProblemIdentity } from '../../shared/types'

export interface StartProblemVisitInput {
  identity: ProblemIdentity
  visitId: string
  activityId: string
  now: string
  localDay: string
}

export interface FinishProblemVisitInput {
  visitId: string
  leftAt: string
  durationSeconds: number
}

export function startProblemVisit(input: StartProblemVisitInput): boolean {
  const db = getDb()
  return db.transaction(() => {
    upsertProblem(input.identity)
    const problem = db.prepare(
      'SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?',
    ).get(input.identity.platform, input.identity.platformProblemId) as { id: string } | undefined
    if (!problem) return false

    db.prepare(`
      INSERT INTO problem_visits (id, problem_id, platform, url, entered_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.visitId,
      problem.id,
      input.identity.platform,
      input.identity.canonicalUrl,
      input.now,
      input.now,
      input.now,
    )
    db.prepare(`
      INSERT INTO activity_events (id, event_type, occurred_at, local_day, problem_id, platform, url, created_at)
      VALUES (?, 'visit_start', ?, ?, ?, ?, ?, ?)
    `).run(
      input.activityId,
      input.now,
      input.localDay,
      problem.id,
      input.identity.platform,
      input.identity.canonicalUrl,
      input.now,
    )
    return true
  })()
}

export function finishProblemVisit(input: FinishProblemVisitInput): boolean {
  const result = getDb().prepare(`
    UPDATE problem_visits SET left_at = ?, duration_seconds = ?, updated_at = ?
    WHERE id = ? AND left_at IS NULL
  `).run(input.leftAt, input.durationSeconds, input.leftAt, input.visitId)
  return result.changes > 0
}
