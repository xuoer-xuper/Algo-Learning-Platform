import type Database from 'better-sqlite3'
import { localDayBounds, toLocalDay, nowMillis } from '../../src/shared/time'
import { getDb } from '../../electron/db/connection'
import { emitDataChanged } from '../../electron/shared/dataEvents'

// Frozen pre-A4d SQL and wrappers; never delegate this oracle to the production cores.

interface VisitAggregate {
  duration: number
  active: number
  visited: number
}

interface SubmissionAggregate {
  total: number
  ac: number
}

/** Explicit DB dependency keeps migration-time rebuilding independent of global initialization. */
export function originalRecomputeDailyStatsAt(
  db: Database.Database,
  day: string,
  now: number,
): void {
  const { start, end } = localDayBounds(day)
  const visits = db
    .prepare<[number, number], VisitAggregate>(
      `SELECT COALESCE(SUM(duration_seconds), 0) AS duration,
    COALESCE(SUM(active_seconds), 0) AS active, COUNT(DISTINCT problem_id) AS visited
    FROM problem_visits WHERE entered_at >= ? AND entered_at < ?`,
    )
    .get(start, end)
  if (!visits) throw new Error('Visit aggregate returned no row')
  const submissions = db
    .prepare<[number, number], SubmissionAggregate>(
      `SELECT COUNT(*) AS total,
    COALESCE(SUM(CASE WHEN verdict = 'AC' THEN 1 ELSE 0 END), 0) AS ac
    FROM submissions WHERE submitted_at >= ? AND submitted_at < ?`,
    )
    .get(start, end)
  if (!submissions) throw new Error('Submission aggregate returned no row')
  const solved = db
    .prepare<[number, number], { count: number }>(
      `SELECT COUNT(*) AS count FROM problems
    WHERE first_solved_at >= ? AND first_solved_at < ? AND deleted_at IS NULL`,
    )
    .get(start, end)
  if (!solved) throw new Error('Solved aggregate returned no row')
  const platforms = db
    .prepare(
      `SELECT platform, COUNT(*) AS count FROM problem_visits
    WHERE entered_at >= ? AND entered_at < ? GROUP BY platform`,
    )
    .all(start, end)
  db.prepare(
    `INSERT INTO user_daily_stats
    (local_day, active_seconds, duration_seconds, visited_problem_count, solved_problem_count,
    submission_count, ac_submission_count, platform_distribution_json, recomputed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(local_day) DO UPDATE SET
      active_seconds = excluded.active_seconds, duration_seconds = excluded.duration_seconds,
      visited_problem_count = excluded.visited_problem_count, solved_problem_count = excluded.solved_problem_count,
      submission_count = excluded.submission_count, ac_submission_count = excluded.ac_submission_count,
      platform_distribution_json = excluded.platform_distribution_json,
      recomputed_at = excluded.recomputed_at, updated_at = excluded.updated_at`,
  ).run(
    day,
    visits.active,
    visits.duration,
    visits.visited,
    solved.count,
    submissions.total,
    submissions.ac,
    platforms.length ? JSON.stringify(platforms) : null,
    now,
    now,
    now,
  )
}

export function originalRecomputeAllDailyStatsAt(db: Database.Database, now: number): number {
  const dates = new Set(
    db
      .prepare<[], { local_day: string | null }>('SELECT local_day FROM user_daily_stats')
      .all()
      .map(({ local_day }) => local_day),
  )
  const facts = db
    .prepare<[], { instant: number }>(
      `SELECT entered_at AS instant FROM problem_visits
    UNION SELECT submitted_at FROM submissions
    UNION SELECT occurred_at FROM activity_events
    UNION SELECT first_solved_at FROM problems WHERE first_solved_at IS NOT NULL`,
    )
    .all()
  for (const { instant } of facts) dates.add(toLocalDay(instant))
  for (const day of dates) Reflect.apply(originalRecomputeDailyStatsAt, undefined, [db, day, now])
  return dates.size
}

export function originalRecomputeDailyStats(date?: string): void {
  originalRecomputeDailyStatsAt(getDb(), date ?? toLocalDay(nowMillis()), nowMillis())
  emitDataChanged(['stats'])
}

export function originalRecomputeDailyStatsForDates(dates: Iterable<string>): number {
  const uniqueDates = [...new Set(dates)].sort()
  for (const date of uniqueDates) originalRecomputeDailyStats(date)
  return uniqueDates.length
}

export function originalRecomputeAllDailyStats(): number {
  const count = originalRecomputeAllDailyStatsAt(getDb(), nowMillis())
  if (count > 0) emitDataChanged(['stats'])
  return count
}
