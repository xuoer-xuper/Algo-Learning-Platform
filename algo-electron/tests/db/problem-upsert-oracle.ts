import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ProblemIdentity } from '../../electron/shared/types'
import { nowMillis } from '../../electron/shared/time'
import { emitDataChanged } from '../../electron/shared/dataEvents'
import {
  isValidScrapedTitle,
  shouldReplaceScrapedTitle,
} from '../../electron/parsers/titleValidation'

// Frozen pre-Drizzle statements: compare raw rows and observable events, not ORM projections.
export function runOriginalProblemUpsert(db: Database.Database, identity: ProblemIdentity): void {
  const now = nowMillis()
  const canonicalUrl = identity.canonicalUrl
  const existing = db
    .prepare<[string, string], { id: string | null; title: string | null }>(
      'SELECT id, title FROM problems WHERE platform = ? AND platform_problem_id = ?',
    )
    .get(identity.platform, identity.platformProblemId)

  const scrapedTitle = identity.title
  let title: string | null = null
  if (isValidScrapedTitle(scrapedTitle)) title = scrapedTitle.trim()

  if (existing) {
    const shouldUpdateTitle = shouldReplaceScrapedTitle(existing.title, title)
    db.prepare(
      `UPDATE problems SET
        canonical_url = ?,
        contest_id = COALESCE(?, contest_id),
        problem_index = COALESCE(?, problem_index),
        title = CASE WHEN ? THEN ? ELSE title END,
        last_visited_at = ?,
        updated_at = ?
      WHERE id = ?`,
    ).run(
      canonicalUrl,
      identity.contestId ?? null,
      identity.problemIndex ?? null,
      shouldUpdateTitle ? 1 : 0,
      title,
      now,
      now,
      existing.id,
    )
    emitDataChanged(['problems', 'stats'])
    return
  }

  db.prepare(
    `INSERT INTO problems (id, platform, platform_problem_id, canonical_url, title, status, contest_id, problem_index, source_platform, source_problem_id, first_seen_at, last_visited_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'visited', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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
  emitDataChanged(['problems', 'stats'])
}
