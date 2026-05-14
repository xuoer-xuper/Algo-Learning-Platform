import crypto from 'node:crypto'
import { getDb } from '../connection'
import type { ProblemIdentity } from '../../shared/types'
import { nowBeijing } from '../../shared/time'

export function upsertProblem(identity: ProblemIdentity): void {
  const db = getDb()
  const now = nowBeijing()

  const existing = db.prepare(
    'SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?'
  ).get(identity.platform, identity.platformProblemId) as { id: string } | undefined

  if (existing) {
    db.prepare(`
      UPDATE problems SET
        last_visited_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(now, now, existing.id)
  } else {
    db.prepare(`
      INSERT INTO problems (id, platform, platform_problem_id, canonical_url, status, source_platform, source_problem_id, first_seen_at, last_visited_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'visited', ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      identity.platform,
      identity.platformProblemId,
      identity.canonicalUrl,
      identity.sourcePlatform ?? null,
      identity.sourceProblemId ?? null,
      now, now, now, now,
    )
  }
}

export function getRecentProblems(limit = 50): any[] {
  const db = getDb()
  return db.prepare(`
    SELECT id, platform, platform_problem_id, canonical_url, title, status, last_visited_at
    FROM problems
    WHERE deleted_at IS NULL
    ORDER BY last_visited_at DESC
    LIMIT ?
  `).all(limit)
}

export function getProblemCount(): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) as count FROM problems WHERE deleted_at IS NULL').get() as { count: number }
  return row.count
}
