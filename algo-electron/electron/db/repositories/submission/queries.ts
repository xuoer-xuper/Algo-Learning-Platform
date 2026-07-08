import { getDb } from '../../connection'
import type { SubmissionRow } from './types'

export function getSubmissionsByProblem(problemId: string): SubmissionRow[] {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM submissions WHERE problem_id = ? ORDER BY submitted_at DESC
  `).all(problemId) as SubmissionRow[]
}

/**
 * 列出某道题的全部提交（按提交时间升序），供阶段 4 时间轴复盘使用。
 * 与 getSubmissionsByProblem 的区别仅在排序方向，便于时间轴顺序渲染。
 */
export function getSubmissionsByProblemAsc(problemId: string): SubmissionRow[] {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM submissions WHERE problem_id = ? ORDER BY submitted_at ASC
  `).all(problemId) as SubmissionRow[]
}

export function getSubmissionsByPlatform(platform: string, limit = 50): SubmissionRow[] {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM submissions WHERE platform = ? ORDER BY submitted_at DESC LIMIT ?
  `).all(platform, limit) as SubmissionRow[]
}

/**
 * 批量查询一组题目的首次 AC 提交时间。
 * 供阶段 4 指标页"干预后同题 AC 转化率"使用：
 * 对每个有干预记录的 problem_id，判断是否存在 AC 且 AC 时间晚于最早干预时间。
 *
 * @param problemIds 需要查询的 problem_id 列表（来自 coach_interventions）
 * @returns 每道题的 { problem_id, first_ac_at }，无 AC 的题目不返回
 */
export function getFirstAcByProblemIds(
  problemIds: string[],
): { problem_id: string; first_ac_at: string }[] {
  if (problemIds.length === 0) return []
  const db = getDb()
  const placeholders = problemIds.map(() => '?').join(',')
  return db
    .prepare(
      `SELECT problem_id, MIN(submitted_at) AS first_ac_at
       FROM submissions
       WHERE verdict = 'AC' AND problem_id IN (${placeholders})
       GROUP BY problem_id`,
    )
    .all(...problemIds) as { problem_id: string; first_ac_at: string }[]
}
