import type { ProblemIdentity } from '../shared/types'
import {
  getAdapter as getRuntimeAdapter,
  getAdapterForUrl as getRuntimeAdapterForUrl,
} from '../adapters/registry'

interface EnabledSiteConfig {
  id: string
  domains: string[]
  enabled: boolean
  adapter?: string
  problemUrlPatterns?: string[]
}

export interface ProblemParserAdapter {
  id: string
  match?: (url: string) => boolean
  parse?: (url: string) => ProblemIdentity | null
}

const customParserAdapters = new Map<string, ProblemParserAdapter>()
let enabledSitesFetcher: (() => EnabledSiteConfig[]) | null = null

const builtinConfigs: EnabledSiteConfig[] = [
  { id: 'codeforces', domains: ['codeforces.com', 'www.codeforces.com'], enabled: true },
  { id: 'acwing', domains: ['acwing.com', 'www.acwing.com'], enabled: true },
  { id: 'nowcoder', domains: ['nowcoder.com', 'www.nowcoder.com', 'ac.nowcoder.com'], enabled: true },
  { id: 'vjudge', domains: ['vjudge.net', 'www.vjudge.net'], enabled: true },
  { id: 'pta', domains: ['pintia.cn', 'www.pintia.cn'], enabled: true },
  { id: 'luogu', domains: ['luogu.com.cn', 'www.luogu.com.cn'], enabled: true },
  { id: 'leetcode-cn', domains: ['leetcode.cn', 'www.leetcode.cn'], enabled: true },
]

export function setEnabledSitesFetcher(fetcher: () => EnabledSiteConfig[]): void {
  enabledSitesFetcher = fetcher
}

export function registerAdapter(adapter: ProblemParserAdapter): void {
  customParserAdapters.set(adapter.id, adapter)
}

export function getAdapter(id: string): ProblemParserAdapter | undefined {
  const customAdapter = customParserAdapters.get(id)
  if (customAdapter) return customAdapter

  const runtimeAdapter = getRuntimeAdapter(id)
  if (!runtimeAdapter) return undefined

  return {
    id: runtimeAdapter.id,
    match: (url) => runtimeAdapter.matchProblem(url),
    parse: (url) => {
      const identity = runtimeAdapter.parseProblem(url, { url })
      return identity instanceof Promise ? null : identity
    },
  }
}

export function getAdapterForUrl(url: string): ProblemParserAdapter | null {
  const site = findMatchingEnabledSite(url)
  if (!site) return null

  const adapterId = site.adapter || site.id
  const customAdapter = customParserAdapters.get(adapterId)
  if (customAdapter && (!customAdapter.match || customAdapter.match(url))) {
    return customAdapter
  }

  const runtimeAdapter = getRuntimeAdapter(adapterId) ?? getRuntimeAdapterForUrl(url)
  if (!runtimeAdapter?.matchProblem(url)) return null

  return {
    id: runtimeAdapter.id,
    match: (candidateUrl) => runtimeAdapter.matchProblem(candidateUrl),
    parse: (candidateUrl) => {
      const identity = runtimeAdapter.parseProblem(candidateUrl, { url: candidateUrl })
      return identity instanceof Promise ? null : identity
    },
  }
}

export function parseConfigUrl(
  url: string,
  siteId: string,
  domains: string[],
  patterns: string[],
): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    if (!domains.some(domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`))) {
      return null
    }

    for (const pattern of patterns) {
      const identity = parsePatternUrl(parsed, siteId, pattern)
      if (identity) return identity
    }
  } catch {
    return null
  }
  return null
}

export function parseUrl(url: string): ProblemIdentity | null {
  const site = findMatchingEnabledSite(url)
  if (!site) return null

  const adapterId = site.adapter || site.id
  const customAdapter = customParserAdapters.get(adapterId)
  if (customAdapter && (!customAdapter.match || customAdapter.match(url)) && customAdapter.parse) {
    const identity = customAdapter.parse(url)
    if (identity) return identity
  }

  const runtimeAdapter = getRuntimeAdapter(adapterId) ?? getRuntimeAdapterForUrl(url)
  if (runtimeAdapter?.matchProblem(url)) {
    const identity = runtimeAdapter.parseProblem(url, { url })
    if (!(identity instanceof Promise) && identity) return identity
  }

  if (site.problemUrlPatterns?.length) {
    return parseConfigUrl(url, site.id, site.domains, site.problemUrlPatterns)
  }

  return null
}

function getEnabledSites(): EnabledSiteConfig[] {
  if (!enabledSitesFetcher) return builtinConfigs

  try {
    return enabledSitesFetcher()
  } catch {
    return builtinConfigs
  }
}

function findMatchingEnabledSite(url: string): EnabledSiteConfig | null {
  try {
    const parsed = new URL(url)
    return getEnabledSites().find(site => {
      if (!site.enabled) return false
      return site.domains.some(domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`))
    }) ?? null
  } catch {
    return null
  }
}

function parsePatternUrl(parsed: URL, siteId: string, pattern: string): ProblemIdentity | null {
  const normalizedPattern = pattern.startsWith('/') ? pattern : `/${pattern}`
  const queryStart = normalizedPattern.indexOf('?')
  const pathPattern = queryStart >= 0 ? normalizedPattern.slice(0, queryStart) : normalizedPattern
  const queryPattern = queryStart >= 0 ? normalizedPattern.slice(queryStart + 1) : ''

  const pathRegex = buildPlaceholderRegex(pathPattern)
  const pathMatch = parsed.pathname.match(pathRegex)
  if (!pathMatch) return null

  const paramNames = [...extractPlaceholderNames(pathPattern)]
  const params: Record<string, string> = {}
  for (let index = 0; index < paramNames.length; index++) {
    const value = pathMatch[index + 1]
    if (value) params[paramNames[index]] = decodeURIComponent(value)
  }

  for (const [key, expected] of new URLSearchParams(queryPattern).entries()) {
    const placeholder = expected.match(/^\{([A-Za-z0-9_]+)\}$/)?.[1]
    const actualValue = parsed.searchParams.get(key)
    if (placeholder) {
      if (!actualValue) return null
      params[placeholder] = actualValue
    } else if (actualValue !== expected) {
      return null
    }
  }

  const platformProblemId = buildPlatformProblemId(params, paramNames)
  if (!platformProblemId) return null

  return {
    platform: siteId,
    platformProblemId,
    canonicalUrl: parsed.origin + parsed.pathname + parsed.search,
    contestId: params.contestId || params.setId || undefined,
    problemIndex: params.problemIndex || params.index || params.problemId || params.id || undefined,
    confidence: 'url',
  }
}

function buildPlaceholderRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regexSource = escaped.replace(/\\\{([A-Za-z0-9_]+)\\\}/g, '([^/?#]+)')
  return new RegExp(`^${regexSource}(?:\\/)?$`)
}

function* extractPlaceholderNames(pattern: string): Generator<string> {
  const regex = /\{([A-Za-z0-9_]+)\}/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(pattern)) !== null) {
    yield match[1]
  }
}

function buildPlatformProblemId(params: Record<string, string>, paramNames: string[]): string {
  if (params.problemId) return params.problemId
  if (params.id) return params.id
  if (params.uuid) return params.uuid
  if (params.contestId && (params.problemIndex || params.index)) {
    return `${params.contestId}-${params.problemIndex || params.index}`
  }

  const values = paramNames.map(name => params[name]).filter(Boolean)
  return values.length > 0 ? values.join('-') : ''
}
