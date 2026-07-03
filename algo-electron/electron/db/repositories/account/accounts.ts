import crypto from 'node:crypto'
import { getDb } from '../../connection'
import { nowBeijing } from '../../../shared/time'
import type { PlatformAccountRow } from './types'

export function upsertAccount(platform: string, handle: string, displayName?: string): string {
  const db = getDb()
  const now = nowBeijing()

  const existing = db.prepare(
    'SELECT id FROM platform_accounts WHERE platform = ? AND handle = ?',
  ).get(platform, handle) as Pick<PlatformAccountRow, 'id'> | undefined

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

export function updateCurrentRating(accountId: string, rating: number): void {
  const db = getDb()
  const now = nowBeijing()
  db.prepare(`
    UPDATE platform_accounts SET current_rating = ?, last_synced_at = ?, updated_at = ?
    WHERE id = ?
  `).run(rating, now, now, accountId)
}

export function updatePeakRating(accountId: string, peak: number): void {
  const db = getDb()
  const now = nowBeijing()
  db.prepare(`
    UPDATE platform_accounts SET peak_rating = ?, updated_at = ?
    WHERE id = ?
  `).run(peak, now, accountId)
}

export function getAccount(platform: string, handle: string): PlatformAccountRow | null {
  const db = getDb()
  const row = db.prepare(
    'SELECT * FROM platform_accounts WHERE platform = ? AND handle = ?',
  ).get(platform, handle) as PlatformAccountRow | undefined
  return row ?? null
}

export function getAccountById(id: string): PlatformAccountRow | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM platform_accounts WHERE id = ?').get(id) as PlatformAccountRow | undefined
  return row ?? null
}

export function getAccountsByPlatform(platform: string): PlatformAccountRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM platform_accounts WHERE platform = ?').all(platform) as PlatformAccountRow[]
}
