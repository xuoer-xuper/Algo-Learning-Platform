import crypto from 'node:crypto'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { getDb } from '../../connection'
import { createDrizzleClient } from '../../../../src/main/db/client'
import {
  activityEvents,
  problems,
  problemVisits,
  submissions,
} from '../../../../src/main/db/schema'
import type { ProblemIdentity } from '../../../shared/types'
import { nowMillis, toLocalDay } from '../../../shared/time'
import { logger as baseLogger, type Logger } from '../../../shared/logger'
import { isValidScrapedTitle, shouldReplaceScrapedTitle } from '../../../parsers/titleValidation'
import { recomputeDailyStatsForDates } from '../stats/recompute'
import { emitDataChanged, withDataChangeTransaction } from '../../../shared/dataEvents'

export function upsertProblem(identity: ProblemIdentity): void {
  const db = createDrizzleClient(getDb())
  const now = new Date(nowMillis())
  const canonicalUrl = identity.canonicalUrl

  const existing = db
    .select({ id: problems.id, title: problems.title })
    .from(problems)
    .where(
      and(
        eq(problems.platform, identity.platform),
        eq(problems.platform_problem_id, identity.platformProblemId),
      ),
    )
    .get()

  const scrapedTitle = identity.title
  let title: string | null = null
  if (isValidScrapedTitle(scrapedTitle)) {
    title = scrapedTitle.trim()
  }

  if (existing) {
    const shouldUpdateTitle = shouldReplaceScrapedTitle(existing.title, title)
    db.update(problems)
      .set({
        canonical_url: canonicalUrl,
        contest_id: sql<
          string | null
        >`coalesce(${identity.contestId ?? null}, ${problems.contest_id})`,
        problem_index: sql<
          string | null
        >`coalesce(${identity.problemIndex ?? null}, ${problems.problem_index})`,
        title: sql<
          string | null
        >`case when ${shouldUpdateTitle ? 1 : 0} then ${title} else ${problems.title} end`,
        last_visited_at: now,
        updated_at: now,
      })
      // Keep SQL equality with a bound null: no matching row, but the UPDATE still runs.
      .where(eq(problems.id, sql.param(existing.id)))
      .run()
    emitDataChanged(['problems', 'stats'])
    return
  }

  db.insert(problems)
    .values({
      id: crypto.randomUUID(),
      platform: identity.platform,
      platform_problem_id: identity.platformProblemId,
      canonical_url: canonicalUrl,
      title,
      status: 'visited',
      contest_id: identity.contestId ?? null,
      problem_index: identity.problemIndex ?? null,
      source_platform: identity.sourcePlatform ?? null,
      source_problem_id: identity.sourceProblemId ?? null,
      first_seen_at: now,
      last_visited_at: now,
      created_at: now,
      updated_at: now,
    })
    .run()
  emitDataChanged(['problems', 'stats'])
}

export function deleteProblem(problemId: string, logger: Logger = baseLogger): boolean {
  const db = getDb()
  const orm = createDrizzleClient(db)
  const affectedDates = new Set<string>()
  // Raw scalar projections preserve invalid stored instants for toLocalDay's validation.
  const rows = orm
    .select({ instant: sql<number | null>`${problemVisits.entered_at}`.as('instant') })
    .from(problemVisits)
    .where(eq(problemVisits.problem_id, problemId))
    .union(
      orm
        .select({ instant: sql<number | null>`${submissions.submitted_at}`.as('instant') })
        .from(submissions)
        .where(eq(submissions.problem_id, problemId)),
    )
    .union(
      orm
        .select({ instant: sql<number | null>`${activityEvents.occurred_at}`.as('instant') })
        .from(activityEvents)
        .where(eq(activityEvents.problem_id, problemId)),
    )
    .union(
      orm
        .select({ instant: sql<number | null>`${problems.first_solved_at}`.as('instant') })
        .from(problems)
        .where(and(eq(problems.id, problemId), isNotNull(problems.first_solved_at))),
    )
    .all()
  for (const row of rows) {
    if (row.instant !== null) affectedDates.add(toLocalDay(row.instant))
  }

  const deleted = withDataChangeTransaction(() =>
    db.transaction(() => {
      orm.delete(submissions).where(eq(submissions.problem_id, problemId)).run()
      orm.delete(problemVisits).where(eq(problemVisits.problem_id, problemId)).run()
      orm.delete(activityEvents).where(eq(activityEvents.problem_id, problemId)).run()
      const removed = orm.delete(problems).where(eq(problems.id, problemId)).run().changes > 0
      if (removed) emitDataChanged(['problems', 'submissions', 'stats'])
      return removed
    })(),
  )
  if (deleted) {
    try {
      recomputeDailyStatsForDates(affectedDates)
    } catch (error) {
      logger.warn('problem.delete-stats-recompute-failed', {
        problemId,
        affectedDates: [...affectedDates].sort(),
        error,
      })
    }
  }
  return deleted
}
