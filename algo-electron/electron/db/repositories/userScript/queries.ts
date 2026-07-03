import { getDb } from '../../connection'
import type { UserScript, UserScriptRow } from './types'
import { normalizeUserScriptRow } from './rowMapper'

export function getAllScripts(): UserScript[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM user_scripts').all() as UserScriptRow[]
  return rows.map(normalizeUserScriptRow)
}

export function getEnabledScripts(): UserScript[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM user_scripts WHERE enabled = 1').all() as UserScriptRow[]
  return rows.map(normalizeUserScriptRow)
}

export function getScriptById(id: string): UserScript | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM user_scripts WHERE id = ?').get(id) as UserScriptRow | undefined
  return row ? normalizeUserScriptRow(row) : null
}
