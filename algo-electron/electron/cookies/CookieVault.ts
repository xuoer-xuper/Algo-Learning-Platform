import { session, Session } from 'electron'
import { getSiteById } from '../db/repositories/siteRepository'
import {
  getCookieSummaryByDomain,
  getCookieSummaryBySite,
  replaceCookieMetadataForDomain,
  type CookieMetadataInput,
  type CookieSafeDomainSummary,
  type CookieSafeSiteSummary,
} from '../db/repositories/cookieRecordRepository'

export class CookieVault {
  private partition = 'persist:oj-main'

  private getSession(): Session {
    return session.fromPartition(this.partition)
  }

  async getCookiesByDomain(domain: string): Promise<Electron.Cookie[]> {
    return this.getSession().cookies.get({ domain })
  }

  async getCookiesForUrl(url: string): Promise<Electron.Cookie[]> {
    return this.getSession().cookies.get({ url })
  }

  async getCookiesForSite(siteId: string): Promise<Electron.Cookie[]> {
    const site = getSiteById(siteId)
    if (!site) return []

    const allCookies: Electron.Cookie[] = []
    for (const domain of site.domains) {
      const cookies = await this.getCookiesByDomain(domain)
      allCookies.push(...cookies)
      this.persistCookieMetadata(siteId, domain, cookies)
    }

    return dedupeCookies(allCookies)
  }

  async getCookieNamesByDomain(domain: string): Promise<string[]> {
    const cookies = await this.getCookiesByDomain(domain)
    return cookies.map((c) => c.name)
  }

  async hasSessionCookie(domain: string, sessionCookieNames: string[]): Promise<boolean> {
    const cookies = await this.getCookiesByDomain(domain)
    return sessionCookieNames.some((name) =>
      cookies.some((c) => c.name === name)
    )
  }

  async getSafeSummaryForSite(siteId: string): Promise<CookieSafeSiteSummary> {
    await this.getCookiesForSite(siteId)
    return getCookieSummaryBySite(siteId)
  }

  async getSafeSummaryForDomain(siteId: string, domain: string): Promise<CookieSafeDomainSummary> {
    const cookies = await this.getCookiesByDomain(domain)
    this.persistCookieMetadata(siteId, domain, cookies)
    return getCookieSummaryByDomain(siteId, domain)
  }

  private persistCookieMetadata(siteId: string, domain: string, cookies: Electron.Cookie[]): void {
    replaceCookieMetadataForDomain(
      siteId,
      domain,
      cookies.map(entry => toCookieMetadataInput(siteId, domain, entry)),
    )
  }
}

function toCookieMetadataInput(siteId: string, domain: string, entry: Electron.Cookie): CookieMetadataInput {
  return {
    siteId,
    domain,
    name: entry.name,
    expiresAt: typeof entry.expirationDate === 'number'
      ? new Date(entry.expirationDate * 1000).toISOString()
      : null,
    httpOnly: entry.httpOnly,
    secure: entry.secure,
    sameSite: entry.sameSite,
    purpose: 'login',
  }
}

function dedupeCookies(cookies: Electron.Cookie[]): Electron.Cookie[] {
  const seen = new Set<string>()
  const result: Electron.Cookie[] = []
  for (const cookie of cookies) {
    const key = `${cookie.domain ?? ''}:${cookie.path ?? ''}:${cookie.name}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(cookie)
  }
  return result
}
