import { getDb } from '../../connection'
import type { ProblemDetail, ProblemSubmissionRow, ProblemVisitRow, RecentProblem } from './types'

export function getRecentProblems(limit = 50, platform?: string, status?: string): RecentProblem[] {
  const db = getDb()
  let sql = `
    SELECT
      p.id, p.platform, p.platform_problem_id, p.canonical_url, p.title, p.last_visited_at,
      CASE
        WHEN EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id AND s.verdict = 'AC') THEN 'solved'
        WHEN EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id) THEN 'attempted'
        ELSE p.status
      END as status,
      (SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id) as submission_count
    FROM problems p
    WHERE p.deleted_at IS NULL
  `
  const params: Array<string | number> = []

  if (platform) {
    sql += ' AND p.platform = ?'
    params.push(platform)
  }

  sql += ' ORDER BY p.last_visited_at DESC LIMIT ?'
  params.push(limit)

  const rows = db.prepare(sql).all(...params) as RecentProblem[]

  return status ? rows.filter(row => row.status === status) : rows
}

export function getProblemDetail(problemId: string): ProblemDetail | null {
  const db = getDb()
  const problem = db.prepare(`
    SELECT
      p.*,
      CASE
        WHEN EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id AND s.verdict = 'AC') THEN 'solved'
        WHEN EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id) THEN 'attempted'
        ELSE p.status
      END as status,
      (SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id) as submission_count,
      (SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id AND s.verdict = 'AC') as ac_count
    FROM problems p
    WHERE p.id = ? AND p.deleted_at IS NULL
  `).get(problemId) as Omit<ProblemDetail, 'submissions'> | undefined

  if (!problem) return null

  const submissions = db.prepare(`
    SELECT * FROM submissions WHERE problem_id = ? ORDER BY submitted_at DESC LIMIT 100
  `).all(problemId) as ProblemSubmissionRow[]

  return { ...problem, submissions }
}

/**
 * 列出某道题的全部访问记录（按进入时间升序），供阶段 4 时间轴复盘使用。
 * 数据全部来自现有 problem_visits 表，不新增采集。
 */
export function listProblemVisitsByProblem(problemId: string): ProblemVisitRow[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT id, problem_id, session_id, platform, url,
              entered_at, left_at, duration_seconds, active_seconds, leave_reason
       FROM problem_visits
       WHERE problem_id = ?
       ORDER BY entered_at ASC`,
    )
    .all(problemId) as ProblemVisitRow[]
}

/**
 * 根据 platform + platform_problem_id 查询 problem_id（Issue #3）。
 * 返回 null 表示该题尚未入库（未访问过 / 解析失败）。
 */
export function findProblemIdByPlatformKey(platform: string, platformProblemId: string): string | null {
  const db = getDb()
  const row = db
    .prepare('SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ? AND deleted_at IS NULL')
    .get(platform, platformProblemId) as { id: string } | undefined
  return row?.id ?? null
}
