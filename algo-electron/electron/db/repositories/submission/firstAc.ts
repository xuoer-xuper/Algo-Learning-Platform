import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { createDrizzleClient } from '../../../../src/main/db/client'
import { problems, submissions } from '../../../../src/main/db/schema'
import { getDb } from '../../connection'
import { nowMillis } from '../../../shared/time'
import { localDayFromTimestamp } from '../stats/date'
import { emitDataChanged } from '../../../shared/dataEvents'

export function updateFirstAc(problemId: string): string[] {
  const db = getDb()
  const now = nowMillis()
  const orm = createDrizzleClient(db)
  const existing = orm
    .select({ first_solved_at: sql<number | null>`${problems.first_solved_at}` })
    .from(problems)
    .where(eq(problems.id, problemId))
    .get()

  const firstAc = orm
    .select({ submitted_at: sql<number>`${submissions.submitted_at}` })
    .from(submissions)
    .where(and(eq(submissions.problem_id, problemId), sql`${submissions.verdict} = 'AC'`))
    .orderBy(asc(submissions.submitted_at))
    .limit(1)
    .get()

  if (firstAc) {
    const result = orm
      .update(problems)
      .set({
        status: sql`'solved'`,
        first_solved_at: sql`${sql.placeholder('firstAc')}`,
        updated_at: sql`${sql.placeholder('now')}`,
      })
      .where(
        and(
          eq(problems.id, sql.placeholder('problemId')),
          or(
            isNull(problems.first_solved_at),
            gt(problems.first_solved_at, sql`${sql.placeholder('compareAc')}`),
          ),
        ),
      )
      .prepare()
      .run({ firstAc: firstAc.submitted_at, now, problemId, compareAc: firstAc.submitted_at })
    if (result.changes > 0) emitDataChanged(['problems', 'stats'])
  }

  const affectedDays = new Set<string>()
  const previousDay =
    existing?.first_solved_at != null ? localDayFromTimestamp(existing.first_solved_at) : null
  const nextDay = firstAc ? localDayFromTimestamp(firstAc.submitted_at) : null
  if (previousDay) affectedDays.add(previousDay)
  if (nextDay) affectedDays.add(nextDay)
  return Array.from(affectedDays)
}

/** Imports can replace or move an AC, unlike the append-only submission writer. */
export function recomputeProblemSubmissionState(problemIds: Iterable<string>): string[] {
  const db = getDb()
  const now = nowMillis()
  const orm = createDrizzleClient(db)
  const findProblem = orm
    .select({
      status: problems.status,
      first_solved_at: sql<number | null>`${problems.first_solved_at}`,
    })
    .from(problems)
    .where(eq(problems.id, sql.placeholder('problemId')))
    .prepare()
  const aggregate = orm
    .select({
      total: sql<number>`COUNT(*)`,
      first_ac: sql<
        number | null
      >`MIN(CASE WHEN ${submissions.verdict} = 'AC' THEN ${submissions.submitted_at} END)`,
    })
    .from(submissions)
    .where(eq(submissions.problem_id, sql.placeholder('problemId')))
    .prepare()
  const update = orm
    .update(problems)
    .set({
      status: sql`${sql.placeholder('status')}`,
      first_solved_at: sql`${sql.placeholder('firstAc')}`,
      updated_at: sql`${sql.placeholder('now')}`,
    })
    .where(
      and(
        eq(problems.id, sql.placeholder('problemId')),
        or(
          sql`${problems.status} IS NOT ${sql.placeholder('status')}`,
          sql`${problems.first_solved_at} IS NOT ${sql.placeholder('firstAc')}`,
        ),
      ),
    )
    .prepare()
  const affectedDates = new Set<string>()

  for (const problemId of new Set(problemIds)) {
    const existing = findProblem.get({ problemId })
    if (!existing) continue
    const submissionState = aggregate.get({ problemId })
    if (submissionState === undefined) throw new Error('Submission aggregate returned no row')
    const status =
      submissionState.first_ac !== null
        ? 'solved'
        : submissionState.total > 0
          ? 'attempted'
          : existing.status === 'unknown'
            ? 'unknown'
            : 'visited'
    const result = update.run({ status, firstAc: submissionState.first_ac, now, problemId })
    if (result.changes > 0) emitDataChanged(['problems', 'stats'])
    for (const timestamp of [existing.first_solved_at, submissionState.first_ac]) {
      const date = timestamp !== null ? localDayFromTimestamp(timestamp) : null
      if (date) affectedDates.add(date)
    }
  }
  return [...affectedDates]
}
