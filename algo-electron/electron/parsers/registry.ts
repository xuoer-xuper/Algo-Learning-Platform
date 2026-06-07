import type { SiteAdapter } from './types'
import type { ProblemIdentity } from '../shared/types'
import { codeforcesParser } from './sites/codeforces'
import { acwingParser } from './sites/acwing'
import { nowcoderParser } from './sites/nowcoder'
import { vjudgeParser } from './sites/vjudge'
import { ptaParser } from './sites/pta'
import { luoguParser } from './sites/luogu'

const adapterRegistry = new Map<string, SiteAdapter>()
let enabledSitesFetcher: (() => any[]) | null = null

export function setEnabledSitesFetcher(fetcher: () => any[]): void {
  enabledSitesFetcher = fetcher
}

// Builtin configs fallback for testing/non-initialized database
const builtinConfigs = [
  { id: 'codeforces', domains: ['codeforces.com', 'www.codeforces.com'], enabled: true, problemUrlPatterns: [] },
  { id: 'acwing', domains: ['acwing.com', 'www.acwing.com'], enabled: true, problemUrlPatterns: [] },
  { id: 'nowcoder', domains: ['nowcoder.com', 'www.nowcoder.com', 'ac.nowcoder.com'], enabled: true, problemUrlPatterns: [] },
  { id: 'vjudge', domains: ['vjudge.net', 'www.vjudge.net'], enabled: true, problemUrlPatterns: [] },
  { id: 'pta', domains: ['pintia.cn'], enabled: true, problemUrlPatterns: [] },
  { id: 'luogu', domains: ['luogu.com.cn', 'www.luogu.com.cn'], enabled: true, problemUrlPatterns: [] },
]

// Adapt built-in parsers to SiteAdapter
const cfAdapter: SiteAdapter = {
  id: 'codeforces',
  match: (url) => codeforcesParser.match(url),
  parse: (url) => codeforcesParser.parse(url),
}
const acwingAdapter: SiteAdapter = {
  id: 'acwing',
  match: (url) => acwingParser.match(url),
  parse: (url) => acwingParser.parse(url),
}
const nowcoderAdapter: SiteAdapter = {
  id: 'nowcoder',
  match: (url) => nowcoderParser.match(url),
  parse: (url) => nowcoderParser.parse(url),
}
const vjudgeAdapter: SiteAdapter = {
  id: 'vjudge',
  match: (url) => vjudgeParser.match(url),
  parse: (url) => vjudgeParser.parse(url),
}
const ptaAdapter: SiteAdapter = {
  id: 'pta',
  match: (url) => ptaParser.match(url),
  parse: (url) => ptaParser.parse(url),
}

adapterRegistry.set('codeforces', cfAdapter)
adapterRegistry.set('acwing', acwingAdapter)
adapterRegistry.set('nowcoder', nowcoderAdapter)
adapterRegistry.set('vjudge', vjudgeAdapter)
adapterRegistry.set('pta', ptaAdapter)
adapterRegistry.set('luogu', luoguParser)

export function registerAdapter(adapter: SiteAdapter): void {
  adapterRegistry.set(adapter.id, adapter)
}

export function getAdapter(id: string): SiteAdapter | undefined {
  return adapterRegistry.get(id)
}

export function getAdapterForUrl(url: string): SiteAdapter | null {
  let enabledSites: any[] = []
  if (enabledSitesFetcher) {
    try {
      enabledSites = enabledSitesFetcher()
    } catch {
      enabledSites = builtinConfigs
    }
  } else {
    enabledSites = builtinConfigs
  }

  try {
    const u = new URL(url)
    const domain = u.hostname

    for (const site of enabledSites) {
      if (!site.enabled) continue

      const isDomainMatch = site.domains.some(
        (d: string) => domain === d || domain.endsWith('.' + d)
      )
      if (!isDomainMatch) continue

      const adapterId = site.adapter || site.id
      const adapter = adapterRegistry.get(adapterId)
      if (adapter) {
        const matched = adapter.match ? adapter.match(url) : true
        if (matched) {
          return adapter
        }
      }
    }
  } catch {
    // Ignore invalid URL
  }
  return null
}

export function parseConfigUrl(
  url: string,
  siteId: string,
  domains: string[],
  patterns: string[]
): ProblemIdentity | null {
  try {
    const u = new URL(url)
    const domain = u.hostname
    const isDomainMatch = domains.some(
      (d) => domain === d || domain.endsWith('.' + d)
    )
    if (!isDomainMatch) return null

    for (const pattern of patterns) {
      // Escape regex special characters, except for the placeholders in curly braces
      let escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Convert {placeholder} to capturing group
      const regexStr = escaped.replace(/\\\{([A-Za-z0-9_]+)\\\}/g, '([^/?#]+)')
      
      const patternPath = regexStr.startsWith('/') ? regexStr : '/' + regexStr
      const regex = new RegExp(`^${patternPath}(?:\\/)?$`)
      
      const m = u.pathname.match(regex)
      if (m) {
        const paramNames: string[] = []
        const paramRegex = /\{([A-Za-z0-9_]+)\}/g
        let match
        while ((match = paramRegex.exec(pattern)) !== null) {
          paramNames.push(match[1])
        }

        const params: Record<string, string> = {}
        for (let i = 0; i < paramNames.length; i++) {
          if (m[i + 1]) {
            params[paramNames[i]] = decodeURIComponent(m[i + 1])
          }
        }

        let platformProblemId = ''
        if (params.problemId) {
          platformProblemId = params.problemId
        } else if (params.id) {
          platformProblemId = params.id
        } else if (params.uuid) {
          platformProblemId = params.uuid
        } else if (params.contestId && (params.problemIndex || params.index)) {
          platformProblemId = `${params.contestId}-${params.problemIndex || params.index}`
        } else if (paramNames.length > 0) {
          platformProblemId = paramNames.map(name => params[name]).filter(Boolean).join('-')
        } else {
          platformProblemId = u.pathname.replace(/^\/|\/$/g, '').replace(/\//g, '-')
        }

        const canonicalUrl = u.origin + u.pathname

        return {
          platform: siteId,
          platformProblemId,
          canonicalUrl,
          contestId: params.contestId || params.setId || undefined,
          problemIndex: params.problemIndex || params.index || params.problemId || params.id || undefined,
          confidence: 'url',
        }
      }
    }
  } catch {
    // Ignore error
  }
  return null
}

export function parseUrl(url: string): ProblemIdentity | null {
  let enabledSites: any[] = []
  if (enabledSitesFetcher) {
    try {
      enabledSites = enabledSitesFetcher()
    } catch {
      enabledSites = builtinConfigs
    }
  } else {
    enabledSites = builtinConfigs
  }

  try {
    const u = new URL(url)
    const domain = u.hostname

    for (const site of enabledSites) {
      if (!site.enabled) continue

      const isDomainMatch = site.domains.some(
        (d: string) => domain === d || domain.endsWith('.' + d)
      )
      if (!isDomainMatch) continue

      const adapterId = site.adapter || site.id
      const adapter = adapterRegistry.get(adapterId)

      if (adapter) {
        const matched = adapter.match ? adapter.match(url) : true
        if (matched && adapter.parse) {
          const identity = adapter.parse(url)
          if (identity) {
            return identity
          }
        }
      }

      if (site.problemUrlPatterns && site.problemUrlPatterns.length > 0) {
        const identity = parseConfigUrl(url, site.id, site.domains, site.problemUrlPatterns)
        if (identity) {
          return identity
        }
      }
    }
  } catch {
    // Ignore invalid URL
  }
  return null
}
