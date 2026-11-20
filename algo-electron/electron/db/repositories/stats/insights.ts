import { count, desc, eq, isNull, sql } from 'drizzle-orm'
import { createDrizzleClient } from '../../../../src/main/db/client'
import { activityEvents, problems, problemVisits } from '../../../../src/main/db/schema'
import { getDb } from '../../connection'
import { nowMillis, toLocalDay, localDayBounds } from '../../../shared/time'
import { dayDiff, localDateDaysAgo } from './date'
import type {
  ProblemVisitStat,
  RevisitStat,
  StreakDays,
  UnreviewedProblem,
  WrongProblem,
} from './types'
import type { PlatformDistributionRow, TimelineEvent } from '../../../../src/shared/types/stats'

export function getPlatformDistribution(): PlatformDistributionRow[] {
  const db = createDrizzleClient(getDb())
  return db
    .select({ platform: problems.platform, count: count() })
    .from(problems)
    .where(isNull(problems.deleted_at))
    .groupBy(problems.platform)
    .orderBy(desc(count()))
    .all()
}

export function getProblemVisitStats(problemId: string): ProblemVisitStat {
  const db = createDrizzleClient(getDb())
  const row = db
    .select({
      total_visits: count(),
      total_duration: sql<number>`COALESCE(SUM(${problemVisits.duration_seconds}), 0)`,
      total_active: sql<number>`COALESCE(SUM(${problemVisits.active_seconds}), 0)`,
      avg_duration: sql<number>`COALESCE(AVG(${problemVisits.duration_seconds}), 0)`,
    })
    .from(problemVisits)
    .where(eq(problemVisits.problem_id, problemId))
    .get()
  if (row === undefined) throw new Error('Visit aggregate unexpectedly returned no row')
  return row
}

export function getTimeline(limit = 50): TimelineEvent[] {
  const db = getDb()
  return db
    .prepare(
      `
    SELECT id, event_type, occurred_at, platform, url, problem_id
    FROM activity_events
    ORDER BY occurred_at DESC
    LIMIT ?
  `,
    )
    .all(limit) as TimelineEvent[]
}

export function getLastActiveTime(): number | null {
  const db = createDrizzleClient(getDb())
  const row = db
    .select({ occurred_at: sql<number>`${activityEvents.occurred_at}` })
    .from(activityEvents)
    .orderBy(desc(activityEvents.occurred_at))
    .limit(1)
    .get()
  return row?.occurred_at ?? null
}

export function getRevisitStats(limit = 50): RevisitStat[] {
  const db = getDb()
  return db
    .prepare(
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
    .all(limit) as RevisitStat[]
}

export function getStreakDays(): StreakDays {
  const db = getDb()
  const rows = db
    .prepare(
      `
    SELECT local_day FROM user_daily_stats
    WHERE active_seconds >= 300 OR submission_count > 0 OR solved_problem_count > 0
    ORDER BY local_day DESC
  `,
    )
    .all() as { local_day: string }[]

  if (rows.length === 0) return { current: 0, longest: 0 }

  let longest = 1
  let streak = 1
  for (let i = 1; i < rows.length; i++) {
    if (dayDiff(rows[i - 1].local_day, rows[i].local_day) === 1) {
      streak++
    } else {
      if (streak > longest) longest = streak
      streak = 1
    }
  }
  if (streak > longest) longest = streak

  if (rows[0].local_day !== toLocalDay(nowMillis())) {
    return { current: 0, longest }
  }

  let current = 1
  for (let i = 1; i < rows.length; i++) {
    if (dayDiff(rows[i - 1].local_day, rows[i].local_day) === 1) {
      current++
    } else {
      break
    }
  }

  return { current, longest }
}

export function getWrongProblems(limit = 50): WrongProblem[] {
  const db = getDb()
  return db
    .prepare(
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
    .all(limit) as WrongProblem[]
}

export function getUnreviewedProblems(days = 30, limit = 50): UnreviewedProblem[] {
  const db = getDb()
  return db
    .prepare(
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
    .all(nowMillis(), localDayBounds(localDateDaysAgo(days)).start, limit) as UnreviewedProblem[]
}
