import { getDb } from '../../connection'
import type { DailyActiveStat, SubmissionTrendPoint, TrendPoint } from './types'
import { localDateDaysAgo } from './date'

export function getDailyActiveStats(days = 30): DailyActiveStat[] {
  const db = getDb()
  return db.prepare(`
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
  `).all(days) as DailyActiveStat[]
}

export function getVisitedTrend(days?: number): TrendPoint[] {
  const db = getDb()
  if (days) {
    // local_day stores Beijing-local yyyy-mm-dd text, so cutoff must not use UTC ISO dates.
    return db.prepare(`
      SELECT local_day, visited_problem_count as count
      FROM user_daily_stats
      WHERE local_day >= ?
      ORDER BY local_day ASC
    `).all(localDateDaysAgo(days)) as TrendPoint[]
  }
  return db.prepare(`
    SELECT local_day, visited_problem_count as count
    FROM user_daily_stats
    ORDER BY local_day ASC
  `).all() as TrendPoint[]
}

export function getAcTrend(days?: number): TrendPoint[] {
  const db = getDb()
  if (days) {
    return db.prepare(`
      SELECT local_day, solved_problem_count as count
      FROM user_daily_stats
      WHERE local_day >= ?
      ORDER BY local_day ASC
    `).all(localDateDaysAgo(days)) as TrendPoint[]
  }
  return db.prepare(`
    SELECT local_day, solved_problem_count as count
    FROM user_daily_stats
    ORDER BY local_day ASC
  `).all() as TrendPoint[]
}

export function getSubmissionTrend(days = 30): SubmissionTrendPoint[] {
  const db = getDb()
  return db.prepare(`
    SELECT local_day, submission_count as total, ac_submission_count as ac
    FROM user_daily_stats
    ORDER BY local_day DESC
    LIMIT ?
  `).all(days) as SubmissionTrendPoint[]
}
