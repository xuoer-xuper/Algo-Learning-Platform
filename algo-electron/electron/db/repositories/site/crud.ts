import crypto from 'node:crypto'
import { getDb } from '../../connection'
import { nowBeijing } from '../../../shared/time'
import type { SiteConfigData, SiteConfigRow } from './types'
import { rowToSite } from './types'

export function getAllSites(): SiteConfigData[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM site_configs ORDER BY is_builtin DESC, name ASC').all() as SiteConfigRow[]
  return rows.map(rowToSite)
}

export function getEnabledSites(): SiteConfigData[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM site_configs WHERE enabled = 1 ORDER BY name ASC').all() as SiteConfigRow[]
  return rows.map(rowToSite)
}

export function getSiteById(id: string): SiteConfigData | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM site_configs WHERE id = ?').get(id) as SiteConfigRow | undefined
  return row ? rowToSite(row) : null
}

export function createSite(data: Omit<SiteConfigData, 'isBuiltin'>): string {
  const db = getDb()
  const now = nowBeijing()
  const id = data.id || crypto.randomUUID()

  db.prepare(`
    INSERT INTO site_configs (id, name, domains_json, home_url, enabled, problem_url_patterns_json, submit_url_patterns_json, cookie_policy, adapter, is_builtin, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    id,
    data.name,
    JSON.stringify(data.domains),
    data.homeUrl,
    data.enabled ? 1 : 0,
    data.problemUrlPatterns ? JSON.stringify(data.problemUrlPatterns) : null,
    data.submitUrlPatterns ? JSON.stringify(data.submitUrlPatterns) : null,
    data.cookiePolicy ?? null,
    data.adapter ?? null,
    now,
    now,
  )

  return id
}

export function updateSite(id: string, data: Partial<SiteConfigData>): boolean {
  const db = getDb()
  const now = nowBeijing()
  const existing = getSiteById(id)
  if (!existing) return false

  const merged = { ...existing, ...data }

  db.prepare(`
    UPDATE site_configs SET
      name = ?, domains_json = ?, home_url = ?, enabled = ?,
      problem_url_patterns_json = ?, submit_url_patterns_json = ?,
      cookie_policy = ?, adapter = ?, updated_at = ?
    WHERE id = ?
  `).run(
    merged.name,
    JSON.stringify(merged.domains),
    merged.homeUrl,
    merged.enabled ? 1 : 0,
    merged.problemUrlPatterns ? JSON.stringify(merged.problemUrlPatterns) : null,
    merged.submitUrlPatterns ? JSON.stringify(merged.submitUrlPatterns) : null,
    merged.cookiePolicy ?? null,
    merged.adapter ?? null,
    now,
    id,
  )

  return true
}

export function toggleSite(id: string, enabled: boolean): boolean {
  const db = getDb()
  const now = nowBeijing()
  const result = db.prepare('UPDATE site_configs SET enabled = ?, updated_at = ? WHERE id = ?')
    .run(enabled ? 1 : 0, now, id)
  return result.changes > 0
}

export function deleteSite(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM site_configs WHERE id = ? AND is_builtin = 0').run(id)
  return result.changes > 0
}
