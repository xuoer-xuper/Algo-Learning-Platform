import crypto from 'node:crypto'
import { getDb } from '../../connection'
import { nowChinaStandardTime } from '../../../shared/time'
import { serializeCredentialEnvelope } from './serialization'
import type { SiteCredentialWriteInput } from './types'

export function upsertCredential(input: SiteCredentialWriteInput): string {
  const siteId = requireNonEmpty(input.siteId, 'siteId')
  const username = requireNonEmpty(input.username, 'username')
  const envelope = serializeCredentialEnvelope(input.secretEnvelope)
  const db = getDb()
  const now = nowChinaStandardTime()
  const existing = db.prepare(`
    SELECT id FROM site_credentials
    WHERE site_id = ? AND username = ?
  `).get(siteId, username) as { id: string } | undefined

  if (existing) {
    db.prepare(`
      UPDATE site_credentials
      SET secret_envelope = ?, sync_excluded = 1, updated_at = ?, deleted_at = NULL
      WHERE id = ?
    `).run(envelope, now, existing.id)
    return existing.id
  }

  const id = crypto.randomUUID()
  db.prepare(`
    INSERT INTO site_credentials (
      id, site_id, username, secret_envelope, last_used_at,
      sync_excluded, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, NULL, 1, ?, ?, NULL)
  `).run(id, siteId, username, envelope, now, now)
  return id
}

export function softDeleteCredential(id: string): boolean {
  const db = getDb()
  const now = nowChinaStandardTime()
  const result = db.prepare(`
    UPDATE site_credentials
    SET secret_envelope = NULL, deleted_at = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL
  `).run(now, now, id)
  return result.changes > 0
}

export function markCredentialUsed(id: string): boolean {
  const now = nowChinaStandardTime()
  const result = getDb().prepare(`
    UPDATE site_credentials
    SET last_used_at = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL
  `).run(now, now, id)
  return result.changes > 0
}

export function renameCredential(id: string, displayName: string | null): boolean {
  const db = getDb()
  const now = nowChinaStandardTime()
  const result = db.prepare(`
    UPDATE site_credentials
    SET display_name = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL
  `).run(displayName, now, id)
  return result.changes > 0
}

function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Credential ${field} must be a non-empty string`)
  }
  return value
}
