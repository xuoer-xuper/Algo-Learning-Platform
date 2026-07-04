import { getDb } from '../../connection'
import type { CookieRecord, CookieSafeDomainSummary, CookieSafeSiteSummary } from './types'

export function getCookieRecordsBySite(siteId: string): CookieRecord[] {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM cookie_records
    WHERE site_id = ?
    ORDER BY domain ASC, name ASC
  `).all(siteId) as CookieRecord[]
}

export function getCookieRecordsByDomain(siteId: string, domain: string): CookieRecord[] {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM cookie_records
    WHERE site_id = ? AND domain = ?
    ORDER BY name ASC
  `).all(siteId, domain) as CookieRecord[]
}

export function buildCookieDomainSummary(
  siteId: string,
  domain: string,
  records: CookieRecord[],
): CookieSafeDomainSummary {
  const sortedNames = records.map(record => record.name).sort()
  const expiringRecords = records
    .map(record => record.expires_at)
    .filter((expiresAt): expiresAt is string => Boolean(expiresAt))
    .sort()
  const lastSeen = records
    .map(record => record.last_seen_at)
    .filter(Boolean)
    .sort()
  const latestSeenAt = lastSeen.length > 0 ? lastSeen[lastSeen.length - 1] : null

  return {
    site_id: siteId,
    domain,
    cookie_names: sortedNames,
    cookie_count: records.length,
    http_only_count: records.filter(record => record.http_only === 1).length,
    secure_count: records.filter(record => record.secure === 1).length,
    earliest_expires_at: expiringRecords[0] ?? null,
    last_seen_at: latestSeenAt,
    sync_excluded: true,
  }
}

export function getCookieSummaryByDomain(siteId: string, domain: string): CookieSafeDomainSummary {
  return buildCookieDomainSummary(siteId, domain, getCookieRecordsByDomain(siteId, domain))
}

export function getCookieSummaryBySite(siteId: string): CookieSafeSiteSummary {
  const records = getCookieRecordsBySite(siteId)
  const domains = Array.from(new Set(records.map(record => record.domain))).sort()
  const summaries = domains.map(domain =>
    buildCookieDomainSummary(siteId, domain, records.filter(record => record.domain === domain))
  )

  return {
    site_id: siteId,
    has_cookies: records.length > 0,
    domains: summaries,
  }
}
