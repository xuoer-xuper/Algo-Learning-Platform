import type Database from 'better-sqlite3'
import { nowMillis, localDayBounds } from '../../src/shared/time'
import { localDateDaysAgo } from '../../electron/db/repositories/stats/date'

// Frozen pre-A4c SQL and clock order. Only DB injection and truthful local row types differ.
interface OriginalTimelineEvent {
  id: string | null
  event_type: string
  occurred_at: number
  platform: string | null
  url: string | null
  problem_id: string | null
}
interface OriginalRevisitStat {
  problem_id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  visit_count: number
  last_visit: number
}
interface OriginalWrongProblem {
  id: string | null
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  wrong_count: number
  last_attempt: number
}
interface OriginalUnreviewedProblem {
  id: string | null
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  last_visited_at: number
  days_since: number
}

export function getOriginalTimeline(db: Database.Database, limit = 50): OriginalTimelineEvent[] {
  return db
    .prepare<number[], OriginalTimelineEvent>(
      `
    SELECT id, event_type, occurred_at, platform, url, problem_id
    FROM activity_events
    ORDER BY occurred_at DESC
    LIMIT ?
  `,
    )
    .all(limit)
}

export function getOriginalRevisitStats(db: Database.Database, limit = 50): OriginalRevisitStat[] {
  return db
    .prepare<number[], OriginalRevisitStat>(
      `
    SELECT
      p.id as problem_id,
      p.platform,
      p.platform_problem_id,
      p.title,
      p.canonical_url,
      COUNT(pv.id) as visit_count,
      MAX(pv.entered_at) as last_visit
    FROM problems p
    JOIN problem_visits pv ON pv.problem_id = p.id
    WHERE p.deleted_at IS NULL
    GROUP BY p.id
    HAVING visit_count > 1
    ORDER BY visit_count DESC
    LIMIT ?
  `,
    )
    .all(limit)
}

export function getOriginalWrongProblems(
  db: Database.Database,
  limit = 50,
): OriginalWrongProblem[] {
  return db
    .prepare<number[], OriginalWrongProblem>(
      `
    SELECT
      p.id,
      p.platform,
      p.platform_problem_id,
      p.title,
      p.canonical_url,
      COUNT(s.id) as wrong_count,
      MAX(s.submitted_at) as last_attempt
    FROM problems p
    JOIN submissions s ON s.problem_id = p.id
    WHERE p.deleted_at IS NULL
      AND s.verdict != 'AC'
      AND NOT EXISTS (
        SELECT 1 FROM submissions s2
        WHERE s2.problem_id = p.id AND s2.verdict = 'AC'
      )
    GROUP BY p.id
    ORDER BY last_attempt DESC
    LIMIT ?
  `,
    )
    .all(limit)
}

export function getOriginalUnreviewedProblems(
  db: Database.Database,
  days = 30,
  limit = 50,
): OriginalUnreviewedProblem[] {
  return db
    .prepare<number[], OriginalUnreviewedProblem>(
      `
    SELECT
      id,
      platform,
      platform_problem_id,
      title,
      canonical_url,
      last_visited_at,
      CAST((? - last_visited_at) / 86400000 AS INTEGER) as days_since
    FROM problems
    WHERE deleted_at IS NULL
      AND last_visited_at < ?
      AND status != 'visited'
    ORDER BY last_visited_at ASC
    LIMIT ?
  `,
    )
    .all(nowMillis(), localDayBounds(localDateDaysAgo(days)).start, limit)
}
