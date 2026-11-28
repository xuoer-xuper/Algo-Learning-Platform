import { and, asc, count, desc, eq, gt, gte, isNull, lt, ne, notExists, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { createDrizzleClient } from '../../../../src/main/db/client'
import {
  activityEvents,
  problems,
  problemVisits,
  submissions,
  userDailyStats,
} from '../../../../src/main/db/schema'
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
  const db = createDrizzleClient(getDb())
  return db
    .select({
      id: activityEvents.id,
      event_type: activityEvents.event_type,
      occurred_at: sql<number>`${activityEvents.occurred_at}`,
      platform: activityEvents.platform,
      url: activityEvents.url,
      problem_id: activityEvents.problem_id,
    })
    .from(activityEvents)
    .orderBy(desc(activityEvents.occurred_at))
    .limit(sql.placeholder('limit'))
    .all({ limit })
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
  const db = createDrizzleClient(getDb())
  return db
    .select({
      // The unchanged equality join proves this NOT NULL visit FK equals the parent ID.
      problem_id: problemVisits.problem_id,
      platform: problems.platform,
      platform_problem_id: problems.platform_problem_id,
      title: problems.title,
      canonical_url: problems.canonical_url,
      visit_count: count(problemVisits.id),
      last_visit: sql<number>`MAX(${problemVisits.entered_at})`,
    })
    .from(problems)
    .innerJoin(problemVisits, eq(problemVisits.problem_id, problems.id))
    .where(isNull(problems.deleted_at))
    .groupBy(problems.id)
    .having(gt(count(problemVisits.id), sql`1`))
    .orderBy(desc(count(problemVisits.id)))
    .limit(sql.placeholder('limit'))
    .all({ limit })
}

export function getStreakDays(): StreakDays {
  const db = createDrizzleClient(getDb())
  const rows = db
    .select({ local_day: userDailyStats.local_day })
    .from(userDailyStats)
    .where(
      or(
        gte(userDailyStats.active_seconds, sql`300`),
        gt(userDailyStats.submission_count, sql`0`),
        gt(userDailyStats.solved_problem_count, sql`0`),
      ),
    )
    .orderBy(desc(userDailyStats.local_day))
    .all()

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
  const db = createDrizzleClient(getDb())
  const accepted = alias(submissions, 's2')
  return db
    .select({
      id: problems.id,
      platform: problems.platform,
      platform_problem_id: problems.platform_problem_id,
      title: problems.title,
      canonical_url: problems.canonical_url,
      wrong_count: count(submissions.id),
      last_attempt: sql<number>`MAX(${submissions.submitted_at})`,
    })
    .from(problems)
    .innerJoin(submissions, eq(submissions.problem_id, problems.id))
    .where(
      and(
        isNull(problems.deleted_at),
        ne(submissions.verdict, sql`'AC'`),
        notExists(
          db
            .select({ one: sql`1` })
            .from(accepted)
            .where(and(eq(accepted.problem_id, problems.id), eq(accepted.verdict, sql`'AC'`))),
        ),
      ),
    )
    .groupBy(problems.id)
    .orderBy(desc(sql`MAX(${submissions.submitted_at})`))
    .limit(sql.placeholder('limit'))
    .all({ limit })
}

export function getUnreviewedProblems(days = 30, limit = 50): UnreviewedProblem[] {
  const db = createDrizzleClient(getDb())
  const statement = db
    .select({
      id: problems.id,
      platform: problems.platform,
      platform_problem_id: problems.platform_problem_id,
      title: problems.title,
      canonical_url: problems.canonical_url,
      last_visited_at: sql<number>`${problems.last_visited_at}`,
      days_since: sql<number>`CAST((${sql.placeholder('now')} - ${problems.last_visited_at}) / 86400000 AS INTEGER)`,
    })
    .from(problems)
    .where(
      and(
        isNull(problems.deleted_at),
        lt(problems.last_visited_at, sql`${sql.placeholder('cutoff')}`),
        ne(problems.status, sql`'visited'`),
      ),
    )
    .orderBy(asc(problems.last_visited_at))
    .limit(sql.placeholder('limit'))
    .prepare()
  return statement.all({
    now: nowMillis(),
    cutoff: localDayBounds(localDateDaysAgo(days)).start,
    limit,
  })
}
