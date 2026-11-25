import { asc, desc, gte, sql } from 'drizzle-orm'
import { createDrizzleClient } from '../../../../src/main/db/client'
import { userDailyStats } from '../../../../src/main/db/schema'
import { getDb } from '../../connection'
import type { DailyActiveStat } from './types'
import { localDateDaysAgo } from './date'
import type { SubmissionTrendPoint, TrendPoint } from '../../../../src/shared/types/stats'

export function getDailyActiveStats(days = 30): DailyActiveStat[] {
  const db = createDrizzleClient(getDb())
  return db
    .select({
      local_day: userDailyStats.local_day,
      active_seconds: userDailyStats.active_seconds,
      duration_seconds: userDailyStats.duration_seconds,
      visited: userDailyStats.visited_problem_count,
      solved: userDailyStats.solved_problem_count,
      submissions: userDailyStats.submission_count,
      ac: userDailyStats.ac_submission_count,
    })
    .from(userDailyStats)
    .orderBy(desc(userDailyStats.local_day))
    .limit(sql.placeholder('days'))
    .all({ days })
}

export function getVisitedTrend(days?: number): TrendPoint[] {
  const db = createDrizzleClient(getDb())
  if (days) {
    // The cutoff is a host-local calendar day, not a UTC ISO date.
    const statement = db
      .select({ local_day: userDailyStats.local_day, count: userDailyStats.visited_problem_count })
      .from(userDailyStats)
      .where(gte(userDailyStats.local_day, sql.placeholder('cutoff')))
      .orderBy(asc(userDailyStats.local_day))
      .prepare()
    return statement.all({ cutoff: localDateDaysAgo(days) })
  }
  return db
    .select({ local_day: userDailyStats.local_day, count: userDailyStats.visited_problem_count })
    .from(userDailyStats)
    .orderBy(asc(userDailyStats.local_day))
    .all()
}

export function getAcTrend(days?: number): TrendPoint[] {
  const db = createDrizzleClient(getDb())
  if (days) {
    const statement = db
      .select({ local_day: userDailyStats.local_day, count: userDailyStats.solved_problem_count })
      .from(userDailyStats)
      .where(gte(userDailyStats.local_day, sql.placeholder('cutoff')))
      .orderBy(asc(userDailyStats.local_day))
      .prepare()
    return statement.all({ cutoff: localDateDaysAgo(days) })
  }
  return db
    .select({ local_day: userDailyStats.local_day, count: userDailyStats.solved_problem_count })
    .from(userDailyStats)
    .orderBy(asc(userDailyStats.local_day))
    .all()
}

export function getSubmissionTrend(days = 30): SubmissionTrendPoint[] {
  const db = createDrizzleClient(getDb())
  return db
    .select({
      local_day: userDailyStats.local_day,
      total: userDailyStats.submission_count,
      ac: userDailyStats.ac_submission_count,
    })
    .from(userDailyStats)
    .orderBy(desc(userDailyStats.local_day))
    .limit(sql.placeholder('days'))
    .all({ days })
}
