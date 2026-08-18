import { getDb } from '../../connection'
import { nowBeijing, todayBeijing } from '../../../shared/time'
import type { PlatformDistributionRow } from './types'
import { nextLocalDay } from './date'

interface VisitAggregate {
  duration: number
  active: number
  visited: number
}

interface SubmissionAggregate {
  total: number
  ac: number
}

export function recomputeDailyStats(date?: string): void {
  const db = getDb()
  const targetDate = date || todayBeijing()
  const nextDate = nextLocalDay(targetDate)
  const now = nowBeijing()

  // This is the only stats writer: it derives daily aggregates from fact tables.
  const visits = db.prepare(`
    SELECT
      COALESCE(SUM(duration_seconds), 0) as duration,
      COALESCE(SUM(active_seconds), 0) as active,
      COUNT(DISTINCT problem_id) as visited
    FROM problem_visits
    WHERE entered_at >= ? AND entered_at < ?
  `).get(targetDate, nextDate) as VisitAggregate

  const submissions = db.prepare(`
    SELECT
      COALESCE(COUNT(*), 0) as total,
      COALESCE(SUM(CASE WHEN verdict = 'AC' THEN 1 ELSE 0 END), 0) as ac
    FROM submissions
    WHERE submitted_at >= ? AND submitted_at < ?
  `).get(targetDate, nextDate) as SubmissionAggregate

  const solved = db.prepare(`
    SELECT COUNT(*) as count
    FROM problems
    WHERE first_solved_at >= ? AND first_solved_at < ? AND deleted_at IS NULL
  `).get(targetDate, nextDate) as { count: number }

  const platforms = db.prepare(`
    SELECT platform, COUNT(*) as count
    FROM problem_visits pv
    WHERE pv.entered_at >= ? AND pv.entered_at < ?
    GROUP BY platform
  `).all(targetDate, nextDate) as PlatformDistributionRow[]

  const platformDistribution = platforms.length > 0 ? JSON.stringify(platforms) : null

  db.prepare(`
    INSERT INTO user_daily_stats (local_day, active_seconds, duration_seconds, visited_problem_count, solved_problem_count, submission_count, ac_submission_count, platform_distribution_json, recomputed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(local_day) DO UPDATE SET
      active_seconds = excluded.active_seconds,
      duration_seconds = excluded.duration_seconds,
      visited_problem_count = excluded.visited_problem_count,
      solved_problem_count = excluded.solved_problem_count,
      submission_count = excluded.submission_count,
      ac_submission_count = excluded.ac_submission_count,
      platform_distribution_json = excluded.platform_distribution_json,
      recomputed_at = excluded.recomputed_at,
      updated_at = excluded.updated_at
  `).run(
    targetDate,
    visits.active,
    visits.duration,
    visits.visited,
    solved.count,
    submissions.total,
    submissions.ac,
    platformDistribution,
    now,
    now,
    now,
  )
}

export function recomputeDailyStatsForDates(dates: Iterable<string>): number {
  const uniqueDates = Array.from(new Set(dates)).sort()
  for (const date of uniqueDates) recomputeDailyStats(date)
  return uniqueDates.length
}

export function recomputeAllDailyStats(): number {
  const db = getDb()
  const rows = db.prepare(`
    SELECT DISTINCT substr(entered_at, 1, 10) as day FROM problem_visits
    UNION
    SELECT DISTINCT substr(submitted_at, 1, 10) as day FROM submissions
    UNION
    SELECT DISTINCT substr(occurred_at, 1, 10) as day FROM activity_events
  `).all() as { day: string }[]

  for (const row of rows) {
    if (row.day) recomputeDailyStats(row.day)
  }

  return rows.length
}
