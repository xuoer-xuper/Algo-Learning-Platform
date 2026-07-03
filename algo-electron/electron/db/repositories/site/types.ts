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

export interface SiteConfigRow {
  id: string
  name: string
  domains_json: string
  home_url: string
  enabled: number
  problem_url_patterns_json: string | null
  submit_url_patterns_json: string | null
  cookie_policy: string | null
  adapter: string | null
  is_builtin: number
}

export interface SitesExportData {
  version: number
  exportedAt: string
  sites: SiteConfigData[]
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

export interface ImportPreviewResult {
  valid: boolean
  preview?: ImportPreview
  error?: string
}

export function rowToSite(row: SiteConfigRow): SiteConfigData {
  return {
    id: row.id,
    name: row.name,
    domains: parseStringArray(row.domains_json),
    homeUrl: row.home_url,
    enabled: row.enabled === 1,
    problemUrlPatterns: row.problem_url_patterns_json ? parseStringArray(row.problem_url_patterns_json) : undefined,
    submitUrlPatterns: row.submit_url_patterns_json ? parseStringArray(row.submit_url_patterns_json) : undefined,
    cookiePolicy: row.cookie_policy ?? undefined,
    adapter: row.adapter ?? undefined,
    isBuiltin: row.is_builtin === 1,
  }
}

export function parseImportedSite(raw: unknown): SiteConfigData | null {
  if (!raw || typeof raw !== 'object') return null
  const site = raw as Record<string, unknown>
  if (
    typeof site.id !== 'string'
    || typeof site.name !== 'string'
    || !Array.isArray(site.domains)
    || typeof site.homeUrl !== 'string'
  ) {
    return null
  }

  const domains = site.domains.filter((domain): domain is string => typeof domain === 'string' && domain.trim().length > 0)
  if (domains.length === 0) return null

  return {
    id: site.id,
    name: site.name,
    domains,
    homeUrl: site.homeUrl,
    enabled: site.enabled !== false,
    problemUrlPatterns: parseOptionalStringArray(site.problemUrlPatterns),
    submitUrlPatterns: parseOptionalStringArray(site.submitUrlPatterns),
    cookiePolicy: typeof site.cookiePolicy === 'string' ? site.cookiePolicy : undefined,
    adapter: typeof site.adapter === 'string' ? site.adapter : undefined,
    isBuiltin: false,
  }
}

function parseStringArray(json: string): string[] {
  const parsed: unknown = JSON.parse(json)
  return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
}

function parseOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const values = value.filter((item): item is string => typeof item === 'string')
  return values.length > 0 ? values : undefined
}
