import { getDb } from '../connection'
import crypto from 'node:crypto'

export interface UserScript {
  id: string
  name: string
  description: string | null
  version: string | null
  match_urls_json: string
  code: string
  file_path: string | null
  site_ids_json: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

export function getAllScripts(): UserScript[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM user_scripts').all() as any[]
  return rows.map(r => ({
    ...r,
    enabled: r.enabled === 1
  }))
}

export function getEnabledScripts(): UserScript[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM user_scripts WHERE enabled = 1').all() as any[]
  return rows.map(r => ({
    ...r,
    enabled: true
  }))
}

export function getScriptById(id: string): UserScript | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM user_scripts WHERE id = ?').get(id) as any
  if (!row) return null
  return { ...row, enabled: row.enabled === 1 }
}

export function createScript(data: Omit<UserScript, 'id' | 'created_at' | 'updated_at'>): string {
  const db = getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  
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
    now
  )
  return id
}

export function updateScript(id: string, data: Partial<Omit<UserScript, 'id' | 'created_at' | 'updated_at'>>): boolean {
  const db = getDb()
  const now = new Date().toISOString()
  
  const sets: string[] = []
  const values: any[] = []
  
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
