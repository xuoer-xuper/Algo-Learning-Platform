import type { SiteConfigData } from '../../db/repositories/siteRepository'

export const DEFAULT_USERNAME_SELECTORS = [
  'input[autocomplete="username"]',
  'input[name="username"]',
  'input[name="userName"]',
  'input[name="email"]',
  'input[type="email"]',
  'input[name="handleOrEmail"]',
] as const

export const DEFAULT_PASSWORD_SELECTORS = [
  'input[autocomplete="current-password"]',
  'input[type="password"]',
  'input[name="password"]',
] as const

export interface CredentialAutofillTarget {
  siteId: string
  usernameSelectors: string[]
  passwordSelectors: string[]
}

export function resolveCredentialAutofillTarget(
  rawUrl: string,
  site: Pick<SiteConfigData, 'id' | 'enabled' | 'domains' | 'loginUrlPatterns' | 'loginUsernameSelectors' | 'loginPasswordSelectors'>,
): CredentialAutofillTarget | null {
  if (!site.enabled || !isAllowedSiteUrl(rawUrl, site.domains)) return null

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  if (!matchesLoginUrl(url, site.loginUrlPatterns ?? [])) return null

  return {
    siteId: site.id,
    usernameSelectors: normalizeSelectors(site.loginUsernameSelectors, DEFAULT_USERNAME_SELECTORS),
    passwordSelectors: normalizeSelectors(site.loginPasswordSelectors, DEFAULT_PASSWORD_SELECTORS),
  }
}

export function isAllowedSiteUrl(rawUrl: string, domains: readonly string[]): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    return domains.some(domain => {
      const normalized = domain.trim().toLowerCase().replace(/^\.+|\.+$/g, '')
      return normalized.length > 0 && (hostname === normalized || hostname.endsWith(`.${normalized}`))
    })
  } catch {
    return false
  }
}

export function matchesLoginUrl(url: URL, patterns: readonly string[]): boolean {
  const path = `${url.pathname}${url.search}`
  const absolute = `${url.origin}${path}`
  return patterns.some(pattern => {
    const normalized = pattern.trim()
    if (!normalized || normalized.length > 512) return false
    if (normalized.startsWith('/')) {
      return globMatches(normalized, url.pathname) || globMatches(normalized, path)
    }
    if (!/^https?:\/\//i.test(normalized)) return false
    const wildcardIndex = normalized.indexOf('*')
    const prefix = wildcardIndex >= 0 ? normalized.slice(0, wildcardIndex) : normalized
    let patternUrl: URL
    try {
      patternUrl = new URL(prefix)
    } catch {
      return false
    }
    if (patternUrl.origin !== url.origin) return false
    return globMatches(normalized, absolute)
  })
}

function normalizeSelectors(
  selectors: readonly string[] | undefined,
  fallback: readonly string[],
): string[] {
  const values = (selectors ?? []).filter(isSafeSelector)
  return values.length > 0 ? [...new Set(values)] : [...fallback]
}

function isSafeSelector(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 512
}

function globMatches(pattern: string, value: string): boolean {
  let regex = '^'
  for (const character of pattern) {
    if (character === '*') {
      regex += '.*'
    } else {
      regex += escapeRegex(character)
    }
  }
  regex += '$'
  try {
    return new RegExp(regex).test(value)
  } catch {
    return false
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$+?.()|[\]{}]/g, '\\$&')
}
