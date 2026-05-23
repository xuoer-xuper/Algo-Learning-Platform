import crypto from 'node:crypto'
import { getDb } from '../connection'
import { nowBeijing } from '../../shared/time'

// --- P4-004: 绑定/更新 handle ---
export function upsertAccount(platform: string, handle: string, displayName?: string): string {
  const db = getDb()
  const now = nowBeijing()

  const existing = db.prepare(
    'SELECT id FROM platform_accounts WHERE platform = ? AND handle = ?'
  ).get(platform, handle) as { id: string } | undefined

  if (existing) {
    db.prepare(`
      UPDATE platform_accounts SET display_name = COALESCE(?, display_name), updated_at = ?
      WHERE id = ?
    `).run(displayName ?? null, now, existing.id)
    return existing.id
  }

  const id = crypto.randomUUID()
  db.prepare(`
    INSERT INTO platform_accounts (id, platform, handle, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, platform, handle, displayName ?? null, now, now)
  return id
}

// --- P4-005: 更新当前 Rating ---
export function updateCurrentRating(accountId: string, rating: number): void {
  const db = getDb()
  const now = nowBeijing()
  db.prepare(`
    UPDATE platform_accounts SET current_rating = ?, last_synced_at = ?, updated_at = ?
    WHERE id = ?
  `).run(rating, now, now, accountId)
}

// --- P4-007: 更新 peak rating ---
export function updatePeakRating(accountId: string, peak: number): void {
  const db = getDb()
  const now = nowBeijing()
  db.prepare(`
    UPDATE platform_accounts SET peak_rating = ?, updated_at = ?
    WHERE id = ?
  `).run(peak, now, accountId)
}

// --- 获取账号 ---
export function getAccount(platform: string, handle: string): any | null {
  const db = getDb()
  return db.prepare(
    'SELECT * FROM platform_accounts WHERE platform = ? AND handle = ?'
  ).get(platform, handle) as any ?? null
}

export function getAccountById(id: string): any | null {
  const db = getDb()
  return db.prepare('SELECT * FROM platform_accounts WHERE id = ?').get(id) as any ?? null
}

export function getAccountsByPlatform(platform: string): any[] {
  const db = getDb()
  return db.prepare('SELECT * FROM platform_accounts WHERE platform = ?').all(platform) as any[]
}

// --- P4-006: 写入 rating history ---
export function upsertRatingHistory(data: {
  accountId: string
  platform: string
  contestId: string
  contestName?: string
  rank?: number
  ratingBefore?: number
  ratingAfter?: number
  delta?: number
  contestAt?: string
  rawJson?: string
}): boolean {
  const db = getDb()
  const now = nowBeijing()

  const existing = db.prepare(
    'SELECT id FROM rating_history WHERE platform = ? AND account_id = ? AND contest_id = ?'
  ).get(data.platform, data.accountId, data.contestId) as { id: string } | undefined

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

// --- 获取 rating history ---
export function getRatingHistory(accountId: string): any[] {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM rating_history WHERE account_id = ? ORDER BY contest_at ASC
  `).all(accountId) as any[]
}

// --- 计算 peak rating ---
export function computePeakRating(accountId: string): number | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT MAX(rating_after) as peak FROM rating_history WHERE account_id = ?
  `).get(accountId) as { peak: number | null } | undefined
  return row?.peak ?? null
}
