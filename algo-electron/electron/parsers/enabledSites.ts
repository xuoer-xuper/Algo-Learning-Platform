export interface EnabledSiteConfig {
  id: string
  domains: string[]
  enabled: boolean
  adapter?: string
  problemUrlPatterns?: string[]
}

let enabledSitesFetcher: (() => EnabledSiteConfig[]) | null = null

export function setEnabledSitesFetcher(fetcher: () => EnabledSiteConfig[]): void {
  enabledSitesFetcher = fetcher
}

export function getEnabledSites(): EnabledSiteConfig[] {
  if (!enabledSitesFetcher) return []

  try {
    return enabledSitesFetcher()
  } catch {
    return []
  }
}

export function findMatchingEnabledSite(url: string): EnabledSiteConfig | null {
  try {
    const parsed = new URL(url)
    return getEnabledSites().find(site => site.enabled && site.domains.some(domain => isHostInDomain(parsed.hostname, domain))) ?? null
  } catch {
    return null
  }
}

export function isHostInDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}
