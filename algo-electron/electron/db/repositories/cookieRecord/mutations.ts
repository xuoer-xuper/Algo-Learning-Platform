import crypto from 'node:crypto'
import { getDb } from '../../connection'
import { nowBeijing } from '../../../shared/time'
import type { CookieMetadataInput, CookieRecord } from './types'
import { getCookieRecordsByDomain } from './queries'

export function upsertCookieMetadata(input: CookieMetadataInput): CookieRecord {
  const db = getDb()
  const now = nowBeijing()
  const existing = db.prepare(`
    SELECT * FROM cookie_records
    WHERE site_id = ? AND domain = ? AND name = ?
  `).get(input.siteId, input.domain, input.name) as CookieRecord | undefined

  if (existing) {
    db.prepare(`
      UPDATE cookie_records
      SET expires_at = ?,
          http_only = ?,
          secure = ?,
          same_site = ?,
          last_seen_at = ?,
          purpose = ?,
          sync_excluded = 1,
          updated_at = ?
      WHERE id = ?
    `).run(
      input.expiresAt ?? null,
      input.httpOnly ? 1 : 0,
      input.secure ? 1 : 0,
      input.sameSite ?? null,
      now,
      input.purpose ?? null,
      now,
      existing.id,
    )
  } else {
    db.prepare(`
      INSERT INTO cookie_records (
        id, site_id, domain, name, value_encrypted, expires_at,
        http_only, secure, same_site, last_seen_at, purpose,
        sync_excluded, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      crypto.randomUUID(),
      input.siteId,
      input.domain,
      input.name,
      input.expiresAt ?? null,
      input.httpOnly ? 1 : 0,
      input.secure ? 1 : 0,
      input.sameSite ?? null,
      now,
      input.purpose ?? null,
      now,
      now,
    )
  }

  const updated = db.prepare(`
    SELECT * FROM cookie_records
    WHERE site_id = ? AND domain = ? AND name = ?
  `).get(input.siteId, input.domain, input.name) as CookieRecord | undefined

  if (!updated) {
    throw new Error(`Cookie metadata was not persisted for ${input.siteId}:${input.domain}:${input.name}`)
  }
  return updated
}

export function upsertCookieMetadataBatch(inputs: CookieMetadataInput[]): CookieRecord[] {
  const db = getDb()
  const upsertMany = db.transaction((records: CookieMetadataInput[]) =>
    records.map(record => upsertCookieMetadata(record))
  )
  return upsertMany(inputs)
}

export function deleteCookieMetadataForDomain(siteId: string, domain: string): number {
  const db = getDb()
  const result = db.prepare(`
    DELETE FROM cookie_records
    WHERE site_id = ? AND domain = ?
  `).run(siteId, domain)
  return result.changes
}

export function replaceCookieMetadataForDomain(siteId: string, domain: string, inputs: CookieMetadataInput[]): CookieRecord[] {
  const db = getDb()
  const replace = db.transaction(() => {
    deleteCookieMetadataForDomain(siteId, domain)
    upsertCookieMetadataBatch(inputs)
    return getCookieRecordsByDomain(siteId, domain)
  })
  return replace()
}
