import { getDb } from '../../connection'
import type { UserScript, UserScriptRow } from './types'
import { normalizeUserScriptRow } from './rowMapper'

export function getAllScripts(): UserScript[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT * FROM user_scripts
    WHERE deleted_at IS NULL
    ORDER BY created_at ASC, id ASC
  `).all() as UserScriptRow[]
  return rows.map(normalizeUserScriptRow)
}

export function getEnabledScripts(): UserScript[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT * FROM user_scripts
    WHERE enabled = 1 AND deleted_at IS NULL
    ORDER BY created_at ASC, id ASC
  `).all() as UserScriptRow[]
  return rows.map(normalizeUserScriptRow)
}

export function getScriptById(id: string): UserScript | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT * FROM user_scripts
    WHERE id = ? AND deleted_at IS NULL
  `).get(id) as UserScriptRow | undefined
  return row ? normalizeUserScriptRow(row) : null
}

export function getScriptByIdentity(
  namespace: string | null,
  identityName: string,
): UserScript | null {
  const db = getDb()
  const row = namespace === null
    ? db.prepare(`
        SELECT * FROM user_scripts
        WHERE namespace IS NULL
          AND identity_name = ?
          AND deleted_at IS NULL
      `).get(identityName)
    : db.prepare(`
        SELECT * FROM user_scripts
        WHERE namespace = ?
          AND identity_name = ?
          AND deleted_at IS NULL
      `).get(namespace, identityName)

  return row ? normalizeUserScriptRow(row as UserScriptRow) : null
}

export function getLegacyScriptByIdentityName(identityName: string): UserScript | null {
  return getScriptByIdentity(null, identityName)
}
