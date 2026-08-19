import { getDb } from '../../connection'
import { parseCredentialEnvelope } from './serialization'
import type { SiteCredential, SiteCredentialRow, SiteCredentialSummary } from './types'

export function getCredentialById(id: string): SiteCredential | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT * FROM site_credentials
    WHERE id = ? AND deleted_at IS NULL
  `).get(id) as SiteCredentialRow | undefined
  return row ? mapCredential(row) : null
}

export function getCredentialBySiteAndUsername(siteId: string, username: string): SiteCredential | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT * FROM site_credentials
    WHERE site_id = ? AND username = ? AND deleted_at IS NULL
  `).get(siteId, username) as SiteCredentialRow | undefined
  return row ? mapCredential(row) : null
}

export function listCredentials(siteId?: string): SiteCredentialSummary[] {
  const db = getDb()
  const rows = (siteId === undefined
    ? db.prepare(`
        SELECT id, site_id, username, last_used_at, created_at, updated_at
        FROM site_credentials
        WHERE deleted_at IS NULL
        ORDER BY COALESCE(last_used_at, '') DESC, username ASC, id ASC
      `).all()
    : db.prepare(`
        SELECT id, site_id, username, last_used_at, created_at, updated_at
        FROM site_credentials
        WHERE site_id = ? AND deleted_at IS NULL
        ORDER BY COALESCE(last_used_at, '') DESC, username ASC, id ASC
      `).all(siteId)) as SiteCredentialSummary[]
  return rows
}

function mapCredential(row: SiteCredentialRow): SiteCredential {
  if (row.sync_excluded !== 1 || row.secret_envelope === null) {
    throw new Error(`Credential ${row.id} violates the active secret invariant`)
  }
  return {
    id: row.id,
    site_id: row.site_id,
    username: row.username,
    secret_envelope: parseCredentialEnvelope(row.secret_envelope),
    last_used_at: row.last_used_at,
    sync_excluded: true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
