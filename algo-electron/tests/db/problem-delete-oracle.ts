import type Database from 'better-sqlite3'
import { toLocalDay } from '../../electron/shared/time'
import type { Logger } from '../../electron/shared/logger'
import { recomputeDailyStatsForDates } from '../../electron/db/repositories/stats/recompute'
import { emitDataChanged, withDataChangeTransaction } from '../../electron/shared/dataEvents'

// Frozen pre-A2d SQL and control flow: the oracle never calls the ORM implementation.
export function runOriginalProblemDelete(
  db: Database.Database,
  problemId: string,
  logger: Logger,
): boolean {
  const affectedDates = new Set<string>()
  const rows = db
    .prepare<[string, string, string, string], { instant: number | null }>(
      `
    SELECT entered_at AS instant
    FROM problem_visits WHERE problem_id = ?
    UNION
    SELECT submitted_at AS instant
    FROM submissions WHERE problem_id = ?
    UNION
    SELECT occurred_at AS instant
    FROM activity_events WHERE problem_id = ?
    UNION
    SELECT first_solved_at AS instant
    FROM problems WHERE id = ? AND first_solved_at IS NOT NULL
  `,
    )
    .all(problemId, problemId, problemId, problemId)
  for (const row of rows) {
    if (row.instant !== null) affectedDates.add(toLocalDay(row.instant))
  }

  const deleted = withDataChangeTransaction(() =>
    db.transaction(() => {
      db.prepare('DELETE FROM submissions WHERE problem_id = ?').run(problemId)
      db.prepare('DELETE FROM problem_visits WHERE problem_id = ?').run(problemId)
      db.prepare('DELETE FROM activity_events WHERE problem_id = ?').run(problemId)
      const removed = db.prepare('DELETE FROM problems WHERE id = ?').run(problemId).changes > 0
      if (removed) emitDataChanged(['problems', 'submissions', 'stats'])
      return removed
    })(),
  )
  if (deleted) {
    try {
      recomputeDailyStatsForDates(affectedDates)
    } catch (error) {
      logger.warn('problem.delete-stats-recompute-failed', {
        problemId,
        affectedDates: [...affectedDates].sort(),
        error,
      })
    }
  }
  return deleted
}
