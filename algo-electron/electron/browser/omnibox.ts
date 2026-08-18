import { getInternalPageUrl, parseInternalPageUrl } from './internalPage'
import {
  evaluateBrowserNavigation,
  type NavigationBlockReason,
} from './navigationPolicy'
import type { InternalPage } from './tabManagerTypes'

export const SEARCH_ENGINE_IDS = ['bing', 'google', 'baidu', 'custom'] as const

export type SearchEngineId = (typeof SEARCH_ENGINE_IDS)[number]

export interface SearchEngineConfig {
  engine: SearchEngineId
  customTemplate: string | null
}

export const DEFAULT_SEARCH_ENGINE_CONFIG: Readonly<SearchEngineConfig> = {
  engine: 'bing',
  customTemplate: null,
}

export type CustomSearchTemplateIssue =
  | 'invalid-type'
  | 'invalid-length'
  | 'query-placeholder-count'
  | 'other-placeholder'
  | 'invalid-url'
  | 'https-required'
  | 'userinfo'

export type CustomSearchTemplateValidation =
  | { valid: true; template: string }
  | { valid: false; issue: CustomSearchTemplateIssue }

export type OmniboxBlockReason =
  | NavigationBlockReason
  | 'empty-input'
  | 'invalid-internal-url'
  | 'userinfo'

export type OmniboxResolution =
  | { kind: 'internal'; page: InternalPage; url: string }
  | { kind: 'url'; url: string }
  | { kind: 'search'; query: string; url: string }
  | { kind: 'blocked'; reason: OmniboxBlockReason }

export interface ResolveOmniboxOptions {
  search?: SearchEngineConfig
  allowInsecureLocalhost?: boolean
}

const MAX_OMNIBOX_INPUT_LENGTH = 4_096
const MAX_CUSTOM_SEARCH_TEMPLATE_LENGTH = 2_048
const QUERY_PLACEHOLDER = '{query}'
const CUSTOM_QUERY_SENTINEL = 'omnibox-query'
const EXPLICIT_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/
const IPV4_HOST_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/
const BLOCKED_EXPLICIT_SCHEMES = new Set([
  'about',
  'blob',
  'chrome',
  'chrome-extension',
  'data',
  'file',
  'ftp',
  'javascript',
  'mailto',
  'vbscript',
  'ws',
  'wss',
])

const BUILT_IN_SEARCH_TEMPLATES: Record<Exclude<SearchEngineId, 'custom'>, string> = {
  bing: 'https://www.bing.com/search?q={query}',
  google: 'https://www.google.com/search?q={query}',
  baidu: 'https://www.baidu.com/s?wd={query}',
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32 || (codePoint >= 127 && codePoint <= 159)
  })
}

function countLiteralOccurrences(value: string, token: string): number {
  let count = 0
  let offset = 0
  while (true) {
    const index = value.indexOf(token, offset)
    if (index < 0) return count
    count += 1
    offset = index + token.length
  }
}

export function validateCustomSearchTemplate(value: unknown): CustomSearchTemplateValidation {
  if (typeof value !== 'string') return { valid: false, issue: 'invalid-type' }
  if (
    value.length < 1
    || value.length > MAX_CUSTOM_SEARCH_TEMPLATE_LENGTH
    || value.trim() !== value
    || containsControlCharacter(value)
  ) {
    return { valid: false, issue: 'invalid-length' }
  }
  if (countLiteralOccurrences(value, QUERY_PLACEHOLDER) !== 1) {
    return { valid: false, issue: 'query-placeholder-count' }
  }

  const withoutQueryPlaceholder = value.replace(QUERY_PLACEHOLDER, '')
  if (withoutQueryPlaceholder.includes('{') || withoutQueryPlaceholder.includes('}')) {
    return { valid: false, issue: 'other-placeholder' }
  }

  let parsed: URL
  try {
    parsed = new URL(value.replace(QUERY_PLACEHOLDER, CUSTOM_QUERY_SENTINEL))
  } catch {
    return { valid: false, issue: 'invalid-url' }
  }
  if (parsed.protocol !== 'https:') return { valid: false, issue: 'https-required' }
  if (parsed.username || parsed.password) return { valid: false, issue: 'userinfo' }

  return { valid: true, template: value }
}

export function normalizeSearchEngineConfig(value: unknown): SearchEngineConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...DEFAULT_SEARCH_ENGINE_CONFIG }
  }

  const candidate = value as Record<string, unknown>
  const engine = SEARCH_ENGINE_IDS.includes(candidate.engine as SearchEngineId)
    ? candidate.engine as SearchEngineId
    : DEFAULT_SEARCH_ENGINE_CONFIG.engine
  const customValidation = validateCustomSearchTemplate(candidate.customTemplate)
  const customTemplate = customValidation.valid ? customValidation.template : null

  return engine === 'custom' && !customTemplate
    ? { ...DEFAULT_SEARCH_ENGINE_CONFIG }
    : { engine, customTemplate }
}

export function buildSearchUrl(query: string, config: SearchEngineConfig): string {
  const normalizedConfig = normalizeSearchEngineConfig(config)
  const template = normalizedConfig.engine === 'custom'
    ? normalizedConfig.customTemplate!
    : BUILT_IN_SEARCH_TEMPLATES[normalizedConfig.engine]
  return template.replace(QUERY_PLACEHOLDER, encodeURIComponent(query))
}

function looksLikeNavigableHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost'
    || normalized === '[::1]'
    || normalized === '::1'
    || IPV4_HOST_PATTERN.test(normalized)
    || normalized.includes('.')
}

function inferHttpsUrl(value: string): URL | null {
  if (/\s/u.test(value)) return null
  const candidate = value.startsWith('//') ? `https:${value}` : `https://${value}`
  try {
    const parsed = new URL(candidate)
    return looksLikeNavigableHost(parsed.hostname) ? parsed : null
  } catch {
    return null
  }
}

function hasInferredUserinfo(value: string): boolean {
  if (!value.includes('@') || /\s/u.test(value)) return false
  try {
    const parsed = new URL(`https://${value}`)
    return Boolean((parsed.username || parsed.password) && looksLikeNavigableHost(parsed.hostname))
  } catch {
    return false
  }
}

function resolveWebUrl(value: string, allowInsecureLocalhost: boolean): OmniboxResolution {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { kind: 'blocked', reason: 'invalid-url' }
  }
  if (parsed.username || parsed.password) return { kind: 'blocked', reason: 'userinfo' }

  const decision = evaluateBrowserNavigation(parsed.toString(), { allowInsecureLocalhost })
  return decision.allowed
    ? { kind: 'url', url: parsed.toString() }
    : { kind: 'blocked', reason: decision.reason! }
}

export function resolveOmniboxInput(
  rawValue: string,
  options: ResolveOmniboxOptions = {},
): OmniboxResolution {
  const value = rawValue.trim()
  if (!value) return { kind: 'blocked', reason: 'empty-input' }
  if (value.length > MAX_OMNIBOX_INPUT_LENGTH || containsControlCharacter(value)) {
    return { kind: 'blocked', reason: 'invalid-url' }
  }

  if (value.toLowerCase().startsWith('algo:')) {
    const page = parseInternalPageUrl(value)
    return page
      ? { kind: 'internal', page, url: getInternalPageUrl(page) }
      : { kind: 'blocked', reason: 'invalid-internal-url' }
  }

  const schemeMatch = EXPLICIT_SCHEME_PATTERN.exec(value)
  const scheme = schemeMatch?.[0].slice(0, -1).toLowerCase()
  if (
    value.startsWith('//')
    || scheme === 'http'
    || scheme === 'https'
    || (scheme ? BLOCKED_EXPLICIT_SCHEMES.has(scheme) : false)
    || (scheme && value.includes('://'))
  ) {
    return resolveWebUrl(value.startsWith('//') ? `https:${value}` : value, options.allowInsecureLocalhost ?? false)
  }

  if (hasInferredUserinfo(value)) return { kind: 'blocked', reason: 'userinfo' }

  const inferredUrl = inferHttpsUrl(value)
  if (inferredUrl) {
    if (inferredUrl.username || inferredUrl.password) return { kind: 'blocked', reason: 'userinfo' }
    return { kind: 'url', url: inferredUrl.toString() }
  }

  return {
    kind: 'search',
    query: value,
    url: buildSearchUrl(value, options.search ?? { ...DEFAULT_SEARCH_ENGINE_CONFIG }),
  }
}
