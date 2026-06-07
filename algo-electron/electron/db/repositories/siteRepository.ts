import crypto from 'node:crypto'
import { getDb } from '../connection'
import { nowBeijing } from '../../shared/time'

export interface SiteConfigData {
  id: string
  name: string
  domains: string[]
  homeUrl: string
  enabled: boolean
  problemUrlPatterns?: string[]
  submitUrlPatterns?: string[]
  cookiePolicy?: string
  adapter?: string
  isBuiltin: boolean
}

// 获取所有站点
export function getAllSites(): SiteConfigData[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM site_configs ORDER BY is_builtin DESC, name ASC').all() as any[]
  return rows.map(rowToSite)
}

// 获取启用的站点
export function getEnabledSites(): SiteConfigData[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM site_configs WHERE enabled = 1 ORDER BY name ASC').all() as any[]
  return rows.map(rowToSite)
}

// 按 ID 获取
export function getSiteById(id: string): SiteConfigData | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM site_configs WHERE id = ?').get(id) as any
  return row ? rowToSite(row) : null
}

// 新增站点
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
    now, now,
  )

  return id
}

// 更新站点
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

// 启用/禁用站点
export function toggleSite(id: string, enabled: boolean): boolean {
  const db = getDb()
  const now = nowBeijing()
  const result = db.prepare('UPDATE site_configs SET enabled = ?, updated_at = ? WHERE id = ?')
    .run(enabled ? 1 : 0, now, id)
  return result.changes > 0
}

// 删除站点（仅非内置）
export function deleteSite(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM site_configs WHERE id = ? AND is_builtin = 0').run(id)
  return result.changes > 0
}

// 插入内置站点（如不存在）
export function seedBuiltinSites(): void {
  const db = getDb()
  const now = nowBeijing()

  const builtins = [
    { id: 'codeforces', name: 'Codeforces', domains: ['codeforces.com', 'www.codeforces.com'], homeUrl: 'https://codeforces.com' },
    { id: 'acwing', name: 'AcWing', domains: ['acwing.com', 'www.acwing.com'], homeUrl: 'https://www.acwing.com' },
    { id: 'nowcoder', name: '牛客', domains: ['nowcoder.com', 'www.nowcoder.com', 'ac.nowcoder.com'], homeUrl: 'https://ac.nowcoder.com' },
    { id: 'vjudge', name: 'VJudge', domains: ['vjudge.net', 'www.vjudge.net'], homeUrl: 'https://vjudge.net' },
    { id: 'pta', name: 'PTA', domains: ['pintia.cn'], homeUrl: 'https://pintia.cn' },
    { id: 'luogu', name: '洛谷', domains: ['luogu.com.cn', 'www.luogu.com.cn'], homeUrl: 'https://www.luogu.com.cn' },
  ]

  const insert = db.prepare(`
    INSERT OR IGNORE INTO site_configs (id, name, domains_json, home_url, enabled, is_builtin, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 1, ?, ?)
  `)

  for (const s of builtins) {
    insert.run(s.id, s.name, JSON.stringify(s.domains), s.homeUrl, now, now)
  }
}

function rowToSite(row: any): SiteConfigData {
  return {
    id: row.id,
    name: row.name,
    domains: JSON.parse(row.domains_json),
    homeUrl: row.home_url,
    enabled: row.enabled === 1,
    problemUrlPatterns: row.problem_url_patterns_json ? JSON.parse(row.problem_url_patterns_json) : undefined,
    submitUrlPatterns: row.submit_url_patterns_json ? JSON.parse(row.submit_url_patterns_json) : undefined,
    cookiePolicy: row.cookie_policy,
    adapter: row.adapter,
    isBuiltin: row.is_builtin === 1,
  }
}

export interface SitesExportData {
  version: number
  exportedAt: string
  sites: SiteConfigData[]
}

export function exportSitesConfig(): SitesExportData {
  const sites = getAllSites()
  return {
    version: 1,
    exportedAt: nowBeijing(),
    sites,
  }
}

export interface ImportConflict {
  id: string
  name: string
  existing: SiteConfigData
  incoming: SiteConfigData
}

export interface ImportPreview {
  newSites: SiteConfigData[]
  conflicts: ImportConflict[]
  builtinSkipped: SiteConfigData[]
}

export function previewImportSites(data: any): { valid: boolean; preview?: ImportPreview; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: '无效的配置数据' }
  }

  if (data.version !== 1) {
    return { valid: false, error: `不支持的配置版本: ${data.version}` }
  }

  if (!Array.isArray(data.sites)) {
    return { valid: false, error: '配置数据缺少 sites 字段' }
  }

  const newSites: SiteConfigData[] = []
  const conflicts: ImportConflict[] = []
  const builtinSkipped: SiteConfigData[] = []

  for (const s of data.sites) {
    if (!s.id || !s.name || !Array.isArray(s.domains) || !s.homeUrl) {
      continue
    }

    const site: SiteConfigData = {
      id: s.id,
      name: s.name,
      domains: s.domains,
      homeUrl: s.homeUrl,
      enabled: s.enabled !== false,
      problemUrlPatterns: s.problemUrlPatterns,
      submitUrlPatterns: s.submitUrlPatterns,
      cookiePolicy: s.cookiePolicy,
      adapter: s.adapter,
      isBuiltin: false,
    }

    const existing = getSiteById(s.id)
    if (existing) {
      if (existing.isBuiltin) {
        builtinSkipped.push(site)
      } else {
        conflicts.push({ id: s.id, name: s.name, existing, incoming: site })
      }
    } else {
      newSites.push(site)
    }
  }

  return {
    valid: true,
    preview: { newSites, conflicts, builtinSkipped },
  }
}

export function confirmImportSites(sites: SiteConfigData[], overwriteIds: string[]): { imported: number; overwritten: number } {
  let imported = 0
  let overwritten = 0

  for (const site of sites) {
    const isOverwrite = overwriteIds.includes(site.id)
    if (isOverwrite) {
      const ok = updateSite(site.id, site)
      if (ok) overwritten++
    } else {
      try {
        createSite(site)
        imported++
      } catch {
        // skip duplicate
      }
    }
  }

  return { imported, overwritten }
}
