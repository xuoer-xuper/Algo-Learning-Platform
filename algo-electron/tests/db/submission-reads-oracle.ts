import type Database from 'better-sqlite3'

// Frozen pre-A3a SQL. Independent of production types, projections and builders.
export interface OriginalSubmissionRow {
  id: string | null
  problem_id: string | null
  platform: string
  platform_submission_id: string
  verdict: string
  raw_verdict: string | null
  language: string | null
  submitted_at: number
  is_first_ac: number
  runtime_ms: number | null
  memory_kb: number | null
  source_url: string | null
  raw_json: string | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export interface OriginalProblemFirstAcRow {
  problem_id: string | null
  first_ac_at: number
}

export function getOriginalSubmissionsByProblem(
  db: Database.Database,
  problemId: string,
): OriginalSubmissionRow[] {
  return db
    .prepare<Array<string | number>, OriginalSubmissionRow>(
      `
    SELECT * FROM submissions WHERE problem_id = ? ORDER BY submitted_at DESC
  `,
    )
    .all(problemId)
}

/**
 * 列出某道题的全部提交（按提交时间升序），供阶段 4 时间轴复盘使用。
 * 与 getSubmissionsByProblem 的区别仅在排序方向，便于时间轴顺序渲染。
 */
export function getOriginalSubmissionsByProblemAsc(
  db: Database.Database,
  problemId: string,
): OriginalSubmissionRow[] {
  return db
    .prepare<Array<string | number>, OriginalSubmissionRow>(
      `
    SELECT * FROM submissions WHERE problem_id = ? ORDER BY submitted_at ASC
  `,
    )
    .all(problemId)
}

export function getOriginalSubmissionsByPlatform(
  db: Database.Database,
  platform: string,
  limit = 50,
): OriginalSubmissionRow[] {
  return db
    .prepare<Array<string | number>, OriginalSubmissionRow>(
      `
    SELECT * FROM submissions WHERE platform = ? ORDER BY submitted_at DESC LIMIT ?
  `,
    )
    .all(platform, limit)
}

/**
 * 批量查询一组题目的首次 AC 提交时间。
 * 供阶段 4 指标页"干预后同题 AC 转化率"使用：
 * 对每个有干预记录的 problem_id，判断是否存在 AC 且 AC 时间晚于最早干预时间。
 *
 * @param problemIds 需要查询的 problem_id 列表（来自 coach_interventions）
 * @returns 每道题的 { problem_id, first_ac_at }，无 AC 的题目不返回
 */
export function getOriginalFirstAcByProblemIds(
  db: Database.Database,
  problemIds: string[],
): OriginalProblemFirstAcRow[] {
  if (problemIds.length === 0) return []
  const placeholders = problemIds.map(() => '?').join(',')
  return db
    .prepare<string[], OriginalProblemFirstAcRow>(
      `SELECT problem_id, MIN(submitted_at) AS first_ac_at
       FROM submissions
       WHERE verdict = 'AC' AND problem_id IN (${placeholders})
       GROUP BY problem_id`,
    )
    .all(...problemIds)
}
