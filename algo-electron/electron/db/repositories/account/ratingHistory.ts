import crypto from 'node:crypto'
import { getDb } from '../../connection'
import { nowBeijing } from '../../../shared/time'
import type { RatingHistoryInput, RatingHistoryRow } from './types'

export function upsertRatingHistory(data: RatingHistoryInput): boolean {
  const db = getDb()
  const now = nowBeijing()

  const existing = db.prepare(
    'SELECT id FROM rating_history WHERE platform = ? AND account_id = ? AND contest_id = ?',
  ).get(data.platform, data.accountId, data.contestId) as Pick<RatingHistoryRow, 'id'> | undefined

  if (existing) return false

  db.prepare(`
    INSERT INTO rating_history (id, account_id, platform, contest_id, contest_name, rank, rating_before, rating_after, delta, contest_at, raw_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    data.accountId,
    data.platform,
    data.contestId,
    data.contestName ?? null,
    data.rank ?? null,
    data.ratingBefore ?? null,
    data.ratingAfter ?? null,
    data.delta ?? null,
    data.contestAt ?? null,
    data.rawJson ?? null,
    now,
  )

  return true
}

export function getRatingHistory(accountId: string): RatingHistoryRow[] {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM rating_history WHERE account_id = ? ORDER BY contest_at ASC
  `).all(accountId) as RatingHistoryRow[]
}

export function computePeakRating(accountId: string): number | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT MAX(rating_after) as peak FROM rating_history WHERE account_id = ?
  `).get(accountId) as { peak: number | null } | undefined
  return row?.peak ?? null
}
