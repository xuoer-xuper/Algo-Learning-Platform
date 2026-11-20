import type Database from 'better-sqlite3'

// Frozen pre-A2g SQL. Keep independent from production projections and builders.
export interface OriginalRecentProblem {
  id: string | null
  platform: string
  platform_problem_id: string
  canonical_url: string
  title: string | null
  last_visited_at: number | null
  status: string
  submission_count: number
}

export function getOriginalRecentProblems(
  db: Database.Database,
  limit = 50,
  platform?: string,
  status?: string,
): OriginalRecentProblem[] {
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

  const rows = db.prepare<Array<string | number>, OriginalRecentProblem>(sql).all(...params)

  return status ? rows.filter((row) => row.status === status) : rows
}
