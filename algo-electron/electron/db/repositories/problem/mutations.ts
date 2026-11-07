import crypto from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../../connection'
import { createDrizzleClient } from '../../../../src/main/db/client'
import { problems } from '../../../../src/main/db/schema'
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
  const affectedDates = new Set<string>()
  const rows = db
    .prepare(
      `
    SELECT entered_at AS instant
    FROM problem_visits WHERE problem_id = ?
    UNION
    SELECT submitted_at AS instant
    FROM submissions WHERE problem_id = ?
    UNION
    SELECT occurred_at AS instant
    FROM activity_events WHERE problem_id = ?
    UNION
    SELECT first_solved_at AS instant
    FROM problems WHERE id = ? AND first_solved_at IS NOT NULL
  `,
    )
    .all(problemId, problemId, problemId, problemId) as Array<{ instant: number | null }>
  for (const row of rows) {
    if (row.instant !== null) affectedDates.add(toLocalDay(row.instant))
  }

  const deleted = withDataChangeTransaction(() =>
    db.transaction(() => {
      db.prepare('DELETE FROM submissions WHERE problem_id = ?').run(problemId)
      db.prepare('DELETE FROM problem_visits WHERE problem_id = ?').run(problemId)
      db.prepare('DELETE FROM activity_events WHERE problem_id = ?').run(problemId)
      const removed = db.prepare('DELETE FROM problems WHERE id = ?').run(problemId).changes > 0
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
