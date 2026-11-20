import type Database from 'better-sqlite3'

// Frozen pre-A2f SQL. Do not share projections or query builders with production.
type RawRow = Record<string, unknown>
interface OriginalDetailRow extends RawRow {
  id: string
  status: string
  submission_count: number
  ac_count: number
}

export function getOriginalProblemDetail(
  db: Database.Database,
  problemId: string,
): (OriginalDetailRow & { submissions: RawRow[] }) | null {
  const problem = db
    .prepare<[string], OriginalDetailRow>(
      `
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
  `,
    )
    .get(problemId)

  if (!problem) return null

  const submissions = db
    .prepare<[string], RawRow>(
      `
    SELECT * FROM submissions WHERE problem_id = ? ORDER BY submitted_at DESC LIMIT 100
  `,
    )
    .all(problemId)

  return { ...problem, submissions }
}

export function getOriginalProblemVisits(db: Database.Database, problemId: string): RawRow[] {
  return db
    .prepare<[string], RawRow>(
      `SELECT id, problem_id, session_id, platform, url,
              entered_at, left_at, duration_seconds, active_seconds, leave_reason
       FROM problem_visits
       WHERE problem_id = ?
       ORDER BY entered_at ASC`,
    )
    .all(problemId)
}
