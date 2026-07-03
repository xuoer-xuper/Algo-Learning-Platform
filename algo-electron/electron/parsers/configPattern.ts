import type { ProblemIdentity } from '../shared/types'
import { isHostInDomain } from './enabledSites'

export function parseConfigUrl(
  url: string,
  siteId: string,
  domains: string[],
  patterns: string[],
): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    if (!domains.some(domain => isHostInDomain(parsed.hostname, domain))) {
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
