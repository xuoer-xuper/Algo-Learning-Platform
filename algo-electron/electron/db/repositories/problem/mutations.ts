import crypto from 'node:crypto'
import { getDb } from '../../connection'
import type { ProblemIdentity } from '../../../shared/types'
import { nowBeijing } from '../../../shared/time'
import { appLogger, type Logger } from '../../../shared/logger'
import { isValidScrapedTitle, shouldReplaceScrapedTitle } from '../../../parsers/titleValidation'
import { recomputeDailyStatsForDates } from '../stats/recompute'

interface ExistingProblemTitleRow {
  id: string
  title: string | null
}

export function upsertProblem(identity: ProblemIdentity): void {
  const db = getDb()
  const now = nowBeijing()
  const canonicalUrl = identity.canonicalUrl

  const existing = db.prepare(
    'SELECT id, title FROM problems WHERE platform = ? AND platform_problem_id = ?',
  ).get(identity.platform, identity.platformProblemId) as ExistingProblemTitleRow | undefined

  const title = isValidScrapedTitle(identity.title) ? identity.title!.trim() : null

  if (existing) {
    const shouldUpdateTitle = shouldReplaceScrapedTitle(existing.title, title)
    db.prepare(`
      UPDATE problems SET
        canonical_url = ?,
        contest_id = COALESCE(?, contest_id),
        problem_index = COALESCE(?, problem_index),
        title = CASE WHEN ? THEN ? ELSE title END,
        last_visited_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      canonicalUrl,
      identity.contestId ?? null,
      identity.problemIndex ?? null,
      shouldUpdateTitle ? 1 : 0,
      title,
      now,
      now,
      existing.id,
    )
    return
  }

  db.prepare(`
    INSERT INTO problems (id, platform, platform_problem_id, canonical_url, title, status, contest_id, problem_index, source_platform, source_problem_id, first_seen_at, last_visited_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'visited', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    identity.platform,
    identity.platformProblemId,
    canonicalUrl,
    title,
    identity.contestId ?? null,
    identity.problemIndex ?? null,
    identity.sourcePlatform ?? null,
    identity.sourceProblemId ?? null,
    now,
    now,
    now,
    now,
  )
}

export function deleteProblem(problemId: string, logger: Logger = appLogger): boolean {
  const db = getDb()
  const affectedDates = new Set<string>()
  const rows = db.prepare(`
    SELECT substr(entered_at, 1, 10) AS local_day
    FROM problem_visits WHERE problem_id = ?
    UNION
    SELECT substr(submitted_at, 1, 10) AS local_day
    FROM submissions WHERE problem_id = ?
    UNION
    SELECT substr(occurred_at, 1, 10) AS local_day
    FROM activity_events WHERE problem_id = ?
    UNION
    SELECT substr(first_solved_at, 1, 10) AS local_day
    FROM problems WHERE id = ? AND first_solved_at IS NOT NULL
  `).all(problemId, problemId, problemId, problemId) as Array<{ local_day: string | null }>
  for (const row of rows) {
    if (row.local_day) affectedDates.add(row.local_day)
  }

  const deleted = db.transaction(() => {
    db.prepare('DELETE FROM submissions WHERE problem_id = ?').run(problemId)
    db.prepare('DELETE FROM problem_visits WHERE problem_id = ?').run(problemId)
    db.prepare('DELETE FROM activity_events WHERE problem_id = ?').run(problemId)
    return db.prepare('DELETE FROM problems WHERE id = ?').run(problemId).changes > 0
  })()
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
