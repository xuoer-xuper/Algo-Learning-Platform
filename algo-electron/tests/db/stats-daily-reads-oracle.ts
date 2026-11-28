import type Database from 'better-sqlite3'
import { localDateDaysAgo } from '../../electron/db/repositories/stats/date'

// Frozen pre-A4b1 SQL and branching; only DB injection and truthful local row types differ.
interface OriginalDailyActiveStat {
  local_day: string | null
  active_seconds: number
  duration_seconds: number
  visited: number
  solved: number
  submissions: number
  ac: number
}

interface OriginalTrendPoint {
  local_day: string | null
  count: number
}

interface OriginalSubmissionTrendPoint {
  local_day: string | null
  total: number
  ac: number
}

export function getOriginalDailyActiveStats(
  db: Database.Database,
  days = 30,
): OriginalDailyActiveStat[] {
  return db
    .prepare<Array<string | number>, OriginalDailyActiveStat>(
      `
    SELECT
      local_day,
      active_seconds,
      duration_seconds,
      visited_problem_count as visited,
      solved_problem_count as solved,
      submission_count as submissions,
      ac_submission_count as ac
    FROM user_daily_stats
    ORDER BY local_day DESC
    LIMIT ?
  `,
    )
    .all(days)
}

export function getOriginalVisitedTrend(
  db: Database.Database,
  days?: number,
): OriginalTrendPoint[] {
  if (days) {
    // local_day stores Beijing-local yyyy-mm-dd text, so cutoff must not use UTC ISO dates.
    return db
      .prepare<Array<string | number>, OriginalTrendPoint>(
        `
      SELECT local_day, visited_problem_count as count
      FROM user_daily_stats
      WHERE local_day >= ?
      ORDER BY local_day ASC
    `,
      )
      .all(localDateDaysAgo(days))
  }
  return db
    .prepare<Array<string | number>, OriginalTrendPoint>(
      `
    SELECT local_day, visited_problem_count as count
    FROM user_daily_stats
    ORDER BY local_day ASC
  `,
    )
    .all()
}

export function getOriginalAcTrend(db: Database.Database, days?: number): OriginalTrendPoint[] {
  if (days) {
    return db
      .prepare<Array<string | number>, OriginalTrendPoint>(
        `
      SELECT local_day, solved_problem_count as count
      FROM user_daily_stats
      WHERE local_day >= ?
      ORDER BY local_day ASC
    `,
      )
      .all(localDateDaysAgo(days))
  }
  return db
    .prepare<Array<string | number>, OriginalTrendPoint>(
      `
    SELECT local_day, solved_problem_count as count
    FROM user_daily_stats
    ORDER BY local_day ASC
  `,
    )
    .all()
}

export function getOriginalSubmissionTrend(
  db: Database.Database,
  days = 30,
): OriginalSubmissionTrendPoint[] {
  return db
    .prepare<Array<string | number>, OriginalSubmissionTrendPoint>(
      `
    SELECT local_day, submission_count as total, ac_submission_count as ac
    FROM user_daily_stats
    ORDER BY local_day DESC
    LIMIT ?
  `,
    )
    .all(days)
}
