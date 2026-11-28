import type Database from 'better-sqlite3'
import { nowMillis } from '../../electron/shared/time'
import { localDayFromTimestamp } from '../../electron/db/repositories/stats/date'
import { emitDataChanged } from '../../electron/shared/dataEvents'

// Frozen pre-A3b2 functions; keep SQL and state/day/notification derivation independent.
export function runOriginalUpdateFirstAc(db: Database.Database, problemId: string): string[] {
  const now = nowMillis()
  const existing = db
    .prepare<[string], { first_solved_at: number | null }>(
      `
    SELECT first_solved_at FROM problems WHERE id = ?
  `,
    )
    .get(problemId)

  const firstAc = db
    .prepare<[string], { submitted_at: number }>(
      `
    SELECT submitted_at FROM submissions
    WHERE problem_id = ? AND verdict = 'AC'
    ORDER BY submitted_at ASC LIMIT 1
  `,
    )
    .get(problemId)

  if (firstAc) {
    const result = db
      .prepare(
        `
      UPDATE problems SET status = 'solved', first_solved_at = ?, updated_at = ?
      WHERE id = ? AND (first_solved_at IS NULL OR first_solved_at > ?)
    `,
      )
      .run(firstAc.submitted_at, now, problemId, firstAc.submitted_at)
    if (result.changes > 0) emitDataChanged(['problems', 'stats'])
  }

  const affectedDays = new Set<string>()
  const previousDay =
    existing?.first_solved_at != null ? localDayFromTimestamp(existing.first_solved_at) : null
  const nextDay = firstAc ? localDayFromTimestamp(firstAc.submitted_at) : null
  if (previousDay) affectedDays.add(previousDay)
  if (nextDay) affectedDays.add(nextDay)
  return Array.from(affectedDays)
}

/** Imports can replace or move an AC, unlike the append-only submission writer. */
export function runOriginalRecomputeProblemSubmissionState(
  db: Database.Database,
  problemIds: Iterable<string>,
): string[] {
  const now = nowMillis()
  const findProblem = db.prepare<[string], { status: string; first_solved_at: number | null }>(
    'SELECT status, first_solved_at FROM problems WHERE id = ?',
  )
  const aggregate = db.prepare<[string], { total: number; first_ac: number | null }>(`
    SELECT COUNT(*) AS total,
      MIN(CASE WHEN verdict = 'AC' THEN submitted_at END) AS first_ac
    FROM submissions WHERE problem_id = ?
  `)
  const update = db.prepare(`
    UPDATE problems SET status = ?, first_solved_at = ?, updated_at = ?
    WHERE id = ? AND (status IS NOT ? OR first_solved_at IS NOT ?)
  `)
  const affectedDates = new Set<string>()

  for (const problemId of new Set(problemIds)) {
    const existing = findProblem.get(problemId)
    if (!existing) continue
    const submissions = aggregate.get(problemId)
    if (submissions === undefined) throw new Error('Original aggregate returned no row')
    const status =
      submissions.first_ac !== null
        ? 'solved'
        : submissions.total > 0
          ? 'attempted'
          : existing.status === 'unknown'
            ? 'unknown'
            : 'visited'
    const result = update.run(
      status,
      submissions.first_ac,
      now,
      problemId,
      status,
      submissions.first_ac,
    )
    if (result.changes > 0) emitDataChanged(['problems', 'stats'])
    for (const timestamp of [existing.first_solved_at, submissions.first_ac]) {
      const date = timestamp !== null ? localDayFromTimestamp(timestamp) : null
      if (date) affectedDates.add(date)
    }
  }
  return [...affectedDates]
}
