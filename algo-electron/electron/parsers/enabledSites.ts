export interface EnabledSiteConfig {
  id: string
  domains: string[]
  enabled: boolean
  adapter?: string
  problemUrlPatterns?: string[]
}

const builtinConfigs: EnabledSiteConfig[] = [
  { id: 'codeforces', domains: ['codeforces.com', 'www.codeforces.com'], enabled: true },
  { id: 'acwing', domains: ['acwing.com', 'www.acwing.com'], enabled: true },
  { id: 'nowcoder', domains: ['nowcoder.com', 'www.nowcoder.com', 'ac.nowcoder.com'], enabled: true },
  { id: 'vjudge', domains: ['vjudge.net', 'www.vjudge.net'], enabled: true },
  { id: 'pta', domains: ['pintia.cn', 'www.pintia.cn'], enabled: true },
  { id: 'luogu', domains: ['luogu.com.cn', 'www.luogu.com.cn'], enabled: true },
  { id: 'leetcode-cn', domains: ['leetcode.cn', 'www.leetcode.cn'], enabled: true },
]

let enabledSitesFetcher: (() => EnabledSiteConfig[]) | null = null

export function setEnabledSitesFetcher(fetcher: () => EnabledSiteConfig[]): void {
  enabledSitesFetcher = fetcher
}

export function getEnabledSites(): EnabledSiteConfig[] {
  if (!enabledSitesFetcher) return builtinConfigs

  try {
    return enabledSitesFetcher()
  } catch {
    return builtinConfigs
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
