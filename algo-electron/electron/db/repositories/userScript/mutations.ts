import crypto from 'node:crypto'
import { getDb } from '../../connection'
import type { UserScriptUpdateInput, UserScriptWriteInput } from './types'

function nowIso(): string {
  return new Date().toISOString()
}

export function createScript(data: UserScriptWriteInput): string {
  const db = getDb()
  const id = crypto.randomUUID()
  const now = nowIso()

  db.prepare(`
    INSERT INTO user_scripts (id, name, description, version, match_urls_json, code, file_path, site_ids_json, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.description,
    data.version,
    data.match_urls_json,
    data.code,
    data.file_path || null,
    data.site_ids_json || null,
    data.enabled ? 1 : 0,
    now,
    now,
  )
  return id
}

export function updateScript(id: string, data: UserScriptUpdateInput): boolean {
  const db = getDb()
  const now = nowIso()

  const sets: string[] = []
  const values: Array<string | number | null> = []

  if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name) }
  if (data.description !== undefined) { sets.push('description = ?'); values.push(data.description) }
  if (data.version !== undefined) { sets.push('version = ?'); values.push(data.version) }
  if (data.match_urls_json !== undefined) { sets.push('match_urls_json = ?'); values.push(data.match_urls_json) }
  if (data.code !== undefined) { sets.push('code = ?'); values.push(data.code) }
  if (data.file_path !== undefined) { sets.push('file_path = ?'); values.push(data.file_path) }
  if (data.site_ids_json !== undefined) { sets.push('site_ids_json = ?'); values.push(data.site_ids_json) }
  if (data.enabled !== undefined) { sets.push('enabled = ?'); values.push(data.enabled ? 1 : 0) }

  if (sets.length === 0) return true

  sets.push('updated_at = ?')
  values.push(now)
  values.push(id)

  const info = db.prepare(`UPDATE user_scripts SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  return info.changes > 0
}

export function toggleScript(id: string, enabled: boolean): boolean {
  return updateScript(id, { enabled })
}

export function deleteScript(id: string): boolean {
  const db = getDb()
  const info = db.prepare('DELETE FROM user_scripts WHERE id = ?').run(id)
  return info.changes > 0
}
