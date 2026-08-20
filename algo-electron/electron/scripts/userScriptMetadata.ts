export interface UserScriptMetadata {
  name?: string
  namespace?: string
  description?: string
  version?: string
  matches: string[]
  includes: string[]
  excludes: string[]
  excludeMatches: string[]
  grants: string[]
  connects: string[]
  noframes: boolean
  updateURL?: string
  downloadURL?: string
  antifeatures: string[]
  icon?: string
  requires: UserScriptResourceReference[]
  resources: Array<UserScriptResourceReference & { name: string }>
  runAt?: string
}

export interface UserScriptResourceReference {
  url: string
  /** Raw URL fragment. The installer selects and verifies the last supported hash. */
  integrity: string | null
}

const NEVER_MATCH = /(?!)\b/

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

function globToRegExpSource(value: string): string {
  return escapeRegExp(value).replace(/\\\*/g, '.*')
}

function asciiCaseInsensitiveLiteral(value: string): string {
  return Array.from(value, (character) => {
    if (!/[a-z]/i.test(character)) return escapeRegExp(character)
    return `[${character.toLowerCase()}${character.toUpperCase()}]`
  }).join('')
}

function neverMatch(): RegExp {
  return new RegExp(NEVER_MATCH.source)
}

function isValidHostName(value: string): boolean {
  if (!value || value.length > 253 || value.includes('..')) return false
  return value.split('.').every(label => (
    label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ))
}

function compileAllUrlsPattern(): RegExp {
  const http = `${asciiCaseInsensitiveLiteral('http')}${asciiCaseInsensitiveLiteral('s')}?`
  const ftp = asciiCaseInsensitiveLiteral('ftp')
  const file = asciiCaseInsensitiveLiteral('file')
  return new RegExp(
    `^(?:(?:${http}|${ftp})\\://[^/:?#]+(?::\\d+)?|${file}\\://)/.*(?:[?#].*)?$`,
  )
}

function compileMatchPattern(rule: string): RegExp | null {
  const normalized = rule.trim()
  if (!normalized || /[?#]/.test(normalized)) return null
  if (normalized === '<all_urls>') return compileAllUrlsPattern()

  const match = normalized.match(/^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/i)
  if (!match) return null

  const schemeToken = match[1].toLowerCase()
  const hostToken = match[2]
  const pathToken = match[3]
  const schemePattern = schemeToken === '*'
    ? `${asciiCaseInsensitiveLiteral('http')}${asciiCaseInsensitiveLiteral('s')}?`
    : asciiCaseInsensitiveLiteral(schemeToken)

  if (schemeToken === 'file') {
    if (hostToken) return null
    return new RegExp(`^${schemePattern}\\://${globToRegExpSource(pathToken)}(?:[?#].*)?$`)
  }

  if (!hostToken || hostToken.includes(':')) return null
  let hostPattern: string
  if (hostToken === '*') {
    hostPattern = '[^/:?#]+'
  } else if (hostToken.startsWith('*.')) {
    const baseHost = hostToken.slice(2)
    if (!isValidHostName(baseHost)) return null
    hostPattern = `(?:[^./:?#]+\\.)*${asciiCaseInsensitiveLiteral(baseHost)}`
  } else {
    if (hostToken.includes('*') || !isValidHostName(hostToken)) return null
    hostPattern = asciiCaseInsensitiveLiteral(hostToken)
  }

  return new RegExp(
    `^${schemePattern}\\://${hostPattern}(?::\\d+)?${globToRegExpSource(pathToken)}(?:[?#].*)?$`,
  )
}

function compileIncludePattern(rule: string): RegExp {
  const normalized = rule.trim()
  if (!normalized) return neverMatch()

  if (normalized.startsWith('/') && normalized.lastIndexOf('/') > 0) {
    const finalSlash = normalized.lastIndexOf('/')
    const source = normalized.slice(1, finalSlash)
    const flags = normalized.slice(finalSlash + 1)
    if (/^[dgimsuvy]*$/.test(flags)) {
      try {
        return new RegExp(source, flags)
      } catch {
        return neverMatch()
      }
    }
    return neverMatch()
  }

  return new RegExp(`^${globToRegExpSource(normalized)}$`)
}

function parseDirectiveValue(trimmed: string): { key: string; value: string } | null {
  const match = trimmed.match(/^\/\/\s*@([a-zA-Z0-9_-]+)(?:\s+(.*?))?\s*$/)
  if (!match) return null
  return { key: match[1].toLowerCase(), value: match[2]?.trim() ?? '' }
}

function parseResourceReference(value: string): UserScriptResourceReference | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const hashIndex = trimmed.indexOf('#')
  if (hashIndex < 0) return { url: trimmed, integrity: null }
  const url = trimmed.slice(0, hashIndex).trim()
  if (!url) return null
  const integrity = trimmed.slice(hashIndex + 1).trim()
  return { url, integrity: integrity || null }
}

export function parseScriptMetadata(code: string): UserScriptMetadata {
  const meta: UserScriptMetadata = {
    matches: [],
    includes: [],
    excludes: [],
    excludeMatches: [],
    grants: [],
    connects: [],
    noframes: false,
    antifeatures: [],
    requires: [],
    resources: [],
  }
  const lines = code.split(/\r?\n/)
  let inMeta = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '// ==UserScript==') {
      inMeta = true
      continue
    }
    if (trimmed === '// ==/UserScript==') break
    if (!inMeta) continue

    const directive = parseDirectiveValue(trimmed)
    if (!directive) continue
    const { key, value } = directive
    if (key === 'name') meta.name = value
    else if (key === 'namespace') meta.namespace = value
    else if (key === 'description') meta.description = value
    else if (key === 'version') meta.version = value
    else if (key === 'match' && value) meta.matches.push(value)
    else if (key === 'include' && value) meta.includes.push(value)
    else if (key === 'exclude' && value) meta.excludes.push(value)
    else if (key === 'exclude-match' && value) meta.excludeMatches.push(value)
    else if (key === 'grant' && value) meta.grants.push(value)
    else if (key === 'connect' && value) meta.connects.push(value)
    else if (key === 'noframes') meta.noframes = true
    else if (key === 'updateurl' && value) meta.updateURL = value
    else if (key === 'downloadurl' && value) meta.downloadURL = value
    else if (key === 'antifeature' && value) meta.antifeatures.push(value)
    else if (key === 'icon' && value) meta.icon = value
    else if (key === 'require' && value) {
      const reference = parseResourceReference(value)
      if (reference) meta.requires.push(reference)
    }
    else if (key === 'resource' && value) {
      const match = value.match(/^(\S+)\s+(.+)$/)
      const reference = match ? parseResourceReference(match[2]) : null
      if (match && reference) meta.resources.push({ name: match[1], ...reference })
    }
    else if (key === 'run-at' && value) meta.runAt = value
  }
  return meta
}

/** Compile a strict userscript @match rule. Invalid rules never match. */
export function matchRuleToRegExp(rule: string): RegExp {
  return compileMatchPattern(rule) ?? neverMatch()
}

/** Compile an @include/@exclude glob or JavaScript regular-expression rule. */
export function includeRuleToRegExp(rule: string): RegExp {
  return compileIncludePattern(rule)
}

function testRule(regex: RegExp, value: string): boolean {
  regex.lastIndex = 0
  return regex.test(value)
}

/** Excludes always win, then at least one valid @match or @include must match. */
export function isUserScriptUrlExcluded(url: string, metadata: Pick<
  UserScriptMetadata,
  'excludes' | 'excludeMatches'
>): boolean {
  return metadata.excludeMatches.some(rule => testRule(matchRuleToRegExp(rule), url))
    || metadata.excludes.some(rule => testRule(includeRuleToRegExp(rule), url))
}

/** Excludes always win, then at least one valid @match or @include must match. */
export function matchesUserScriptUrl(url: string, metadata: Pick<
  UserScriptMetadata,
  'matches' | 'includes' | 'excludes' | 'excludeMatches'
>): boolean {
  if (isUserScriptUrlExcluded(url, metadata)) return false

  return metadata.matches.some(rule => testRule(matchRuleToRegExp(rule), url))
    || metadata.includes.some(rule => testRule(includeRuleToRegExp(rule), url))
}

export const matchesMetadataUrl = matchesUserScriptUrl
