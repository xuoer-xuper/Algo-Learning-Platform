import type Database from 'better-sqlite3'
import { and, gte, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { createDrizzleClient } from '../../../../src/main/db/client'
import {
  activityEvents,
  problems,
  problemVisits,
  submissions,
  userDailyStats,
} from '../../../../src/main/db/schema'
import { localDayBounds, toLocalDay } from '../../../../src/shared/time'

/** Runtime only: migration 030 retains the independent historical implementation. */
export function recomputeDailyStatsAt(db: Database.Database, day: string, now: number): void {
  const { start, end } = localDayBounds(day)
  const orm = createDrizzleClient(db)
  const visitRange = and(
    gte(problemVisits.entered_at, sql`${start}`),
    lt(problemVisits.entered_at, sql`${end}`),
  )
  const visits = orm
    .select({
      duration: sql<number>`coalesce(sum(${problemVisits.duration_seconds}), 0)`,
      active: sql<number>`coalesce(sum(${problemVisits.active_seconds}), 0)`,
      visited: sql<number>`count(distinct ${problemVisits.problem_id})`,
    })
    .from(problemVisits)
    .where(visitRange)
    .get()
  if (!visits) throw new Error('Visit aggregate returned no row')
  const submitted = orm
    .select({
      total: sql<number>`count(*)`,
      ac: sql<number>`coalesce(sum(case when ${submissions.verdict} = 'AC' then 1 else 0 end), 0)`,
    })
    .from(submissions)
    .where(
      and(gte(submissions.submitted_at, sql`${start}`), lt(submissions.submitted_at, sql`${end}`)),
    )
    .get()
  if (!submitted) throw new Error('Submission aggregate returned no row')
  const solved = orm
    .select({ count: sql<number>`count(*)` })
    .from(problems)
    .where(
      and(
        gte(problems.first_solved_at, sql`${start}`),
        lt(problems.first_solved_at, sql`${end}`),
        isNull(problems.deleted_at),
      ),
    )
    .get()
  if (!solved) throw new Error('Solved aggregate returned no row')
  const platforms = orm
    .select({ platform: problemVisits.platform, count: sql<number>`count(*)` })
    .from(problemVisits)
    .where(visitRange)
    .groupBy(problemVisits.platform)
    .all()

  // Prepare before serializing platforms; raw timestamp placeholders preserve SQLite bindings.
  const insert = orm
    .insert(userDailyStats)
    .values({
      local_day: sql.placeholder('day'),
      active_seconds: sql.placeholder('active'),
      duration_seconds: sql.placeholder('duration'),
      visited_problem_count: sql.placeholder('visited'),
      solved_problem_count: sql.placeholder('solved'),
      submission_count: sql.placeholder('submitted'),
      ac_submission_count: sql.placeholder('ac'),
      platform_distribution_json: sql.placeholder('platforms'),
      recomputed_at: sql`${sql.placeholder('now')}`,
      created_at: sql`${sql.placeholder('now')}`,
      updated_at: sql`${sql.placeholder('now')}`,
    })
    .onConflictDoUpdate({
      target: userDailyStats.local_day,
      set: {
        active_seconds: sql`excluded.active_seconds`,
        duration_seconds: sql`excluded.duration_seconds`,
        visited_problem_count: sql`excluded.visited_problem_count`,
        solved_problem_count: sql`excluded.solved_problem_count`,
        submission_count: sql`excluded.submission_count`,
        ac_submission_count: sql`excluded.ac_submission_count`,
        platform_distribution_json: sql`excluded.platform_distribution_json`,
        recomputed_at: sql`excluded.recomputed_at`,
        updated_at: sql`excluded.updated_at`,
      },
    })
    .prepare()
  insert.run({
    day,
    active: visits.active,
    duration: visits.duration,
    visited: visits.visited,
    solved: solved.count,
    submitted: submitted.total,
    ac: submitted.ac,
    platforms: platforms.length ? JSON.stringify(platforms) : null,
    now,
  })
}

export function recomputeAllDailyStatsAt(db: Database.Database, now: number): number {
  const orm = createDrizzleClient(db)
  const dates = new Set(
    orm
      .select({ local_day: userDailyStats.local_day })
      .from(userDailyStats)
      .all()
      .map(({ local_day }) => local_day),
  )
  // One distinct UNION, with raw instants so toLocalDay owns validation before any writes.
  const facts = orm
    .select({ instant: sql<number>`${problemVisits.entered_at}`.as('instant') })
    .from(problemVisits)
    .union(
      orm
        .select({ instant: sql<number>`${submissions.submitted_at}`.as('instant') })
        .from(submissions),
    )
    .union(
      orm
        .select({ instant: sql<number>`${activityEvents.occurred_at}`.as('instant') })
        .from(activityEvents),
    )
    .union(
      orm
        .select({ instant: sql<number>`${problems.first_solved_at}`.as('instant') })
        .from(problems)
        .where(isNotNull(problems.first_solved_at)),
    )
    .all()
  for (const { instant } of facts) dates.add(toLocalDay(instant))
  for (const day of dates) {
    if (day === null) throw new TypeError('Invalid local day')
    recomputeDailyStatsAt(db, day, now)
  }
  return dates.size
}
