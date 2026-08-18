import { MAX_TABS } from './tabManagerConfig'
import { isInternalPage, type TabSessionSnapshot, type TabSnapshot } from './tabManagerTypes'
import { evaluateBrowserNavigation } from './navigationPolicy'

const MAX_SESSION_JSON_BYTES = 128 * 1_024
const MAX_TAB_ID_LENGTH = 64
const MAX_TAB_TITLE_LENGTH = 512
const MAX_TAB_URL_LENGTH = 4_096
const TAB_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const MALFORMED_PERCENT_PATTERN = /%(?![0-9A-Fa-f]{2})/
const SENSITIVE_URL_KEYS = new Set([
  'authorization',
  'auth',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'token',
  'session',
  'sessionid',
  'sid',
  'csrf',
  'xsrf',
  'password',
  'passwd',
  'secret',
  'apikey',
  'code',
  'state',
  'ticket',
  'signature',
  'sig',
  'jwt',
])

export interface TabSessionSnapshotOptions {
  allowInsecureLocalhost?: boolean
}

export type TabSessionValidationReason =
  | 'invalid-json'
  | 'oversized-json'
  | 'invalid-envelope'
  | 'unsupported-version'
  | 'invalid-tabs'
  | 'too-many-tabs'
  | 'invalid-tab'
  | 'duplicate-tab-id'
  | 'invalid-active-tab'

export type TabSessionValidationResult =
  | { ok: true; snapshot: TabSessionSnapshot }
  | { ok: false; reason: TabSessionValidationReason }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value)
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key))
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32 || (codePoint >= 127 && codePoint <= 159)
  })
}

function containsEncodedControlCharacter(value: string): boolean {
  try {
    return containsControlCharacter(decodeURIComponent(value))
  } catch {
    return true
  }
}

function isValidTabId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= MAX_TAB_ID_LENGTH
    && TAB_ID_PATTERN.test(value)
}

function isValidTabTitle(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= MAX_TAB_TITLE_LENGTH
    && !containsControlCharacter(value)
}

function normalizeUrlKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function hasSensitiveSearchParams(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    if (SENSITIVE_URL_KEYS.has(normalizeUrlKey(key))) return true
  }
  return false
}

function hasSensitiveFragment(hash: string): boolean {
  if (!hash) return false
  const fragment = hash.slice(1)
  if (!fragment) return false
  const queryIndex = fragment.indexOf('?')
  const candidate = queryIndex >= 0 ? fragment.slice(queryIndex + 1) : fragment
  if (!candidate.includes('=')) return false
  return hasSensitiveSearchParams(new URLSearchParams(candidate))
}

export function normalizeRestorableWebUrl(
  value: string,
  options: TabSessionSnapshotOptions = {},
): string | null {
  if (
    value.length < 1
    || value.length > MAX_TAB_URL_LENGTH
    || containsControlCharacter(value)
    || MALFORMED_PERCENT_PATTERN.test(value)
    || containsEncodedControlCharacter(value)
  ) {
    return null
  }

  const decision = evaluateBrowserNavigation(value, {
    allowInsecureLocalhost: options.allowInsecureLocalhost,
    allowAboutBlank: false,
  })
  if (!decision.allowed) return null

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (parsed.username || parsed.password) return null
  if (hasSensitiveSearchParams(parsed.searchParams) || hasSensitiveFragment(parsed.hash)) return null

  const normalized = parsed.toString()
  return normalized.length <= MAX_TAB_URL_LENGTH ? normalized : null
}

function normalizeSnapshotTab(
  value: unknown,
  options: TabSessionSnapshotOptions,
): TabSnapshot | null {
  if (!isRecord(value) || !isValidTabId(value.id) || !isValidTabTitle(value.title)) return null

  if (value.kind === 'web') {
    if (!hasOnlyKeys(value, ['id', 'kind', 'url', 'title']) || typeof value.url !== 'string') return null
    const url = normalizeRestorableWebUrl(value.url, options)
    return url ? { id: value.id, kind: 'web', url, title: value.title } : null
  }

  if (value.kind === 'internal') {
    if (!hasOnlyKeys(value, ['id', 'kind', 'page', 'title']) || !isInternalPage(value.page)) return null
    return { id: value.id, kind: 'internal', page: value.page, title: value.title }
  }

  return null
}

export function parseTabSessionSnapshot(
  value: unknown,
  options: TabSessionSnapshotOptions = {},
): TabSessionValidationResult {
  if (!isRecord(value) || !hasOnlyKeys(value, ['version', 'activeTabId', 'tabs'])) {
    return { ok: false, reason: 'invalid-envelope' }
  }
  if (value.version !== 1) return { ok: false, reason: 'unsupported-version' }
  if (!Array.isArray(value.tabs)) return { ok: false, reason: 'invalid-tabs' }
  if (value.tabs.length > MAX_TABS) return { ok: false, reason: 'too-many-tabs' }

  const tabs: TabSnapshot[] = []
  const tabIds = new Set<string>()
  for (const candidate of value.tabs) {
    const tab = normalizeSnapshotTab(candidate, options)
    if (!tab) return { ok: false, reason: 'invalid-tab' }
    if (tabIds.has(tab.id)) return { ok: false, reason: 'duplicate-tab-id' }
    tabIds.add(tab.id)
    tabs.push(tab)
  }

  if (tabs.length === 0) {
    if (value.activeTabId !== null) return { ok: false, reason: 'invalid-active-tab' }
  } else if (typeof value.activeTabId !== 'string' || !tabIds.has(value.activeTabId)) {
    return { ok: false, reason: 'invalid-active-tab' }
  }

  return {
    ok: true,
    snapshot: {
      version: 1,
      activeTabId: value.activeTabId as string | null,
      tabs,
    },
  }
}

export function parseTabSessionSnapshotJson(
  raw: string,
  options: TabSessionSnapshotOptions = {},
): TabSessionValidationResult {
  if (Buffer.byteLength(raw, 'utf8') > MAX_SESSION_JSON_BYTES) {
    return { ok: false, reason: 'oversized-json' }
  }
  try {
    return parseTabSessionSnapshot(JSON.parse(raw), options)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
}

function sanitizeTitle(value: string): string {
  return [...value]
    .map((character) => containsControlCharacter(character) ? ' ' : character)
    .join('')
    .slice(0, MAX_TAB_TITLE_LENGTH)
}

export function createTabSessionSnapshot(
  candidates: readonly TabSnapshot[],
  activeTabId: string | null,
  options: TabSessionSnapshotOptions = {},
): TabSessionSnapshot {
  const tabs: TabSnapshot[] = []
  const survivingIds = new Set<string>()
  for (const candidate of candidates) {
    if (tabs.length >= MAX_TABS) break
    if (!isValidTabId(candidate.id) || survivingIds.has(candidate.id)) continue
    if (candidate.kind === 'web') {
      if (typeof candidate.url !== 'string' || typeof candidate.title !== 'string') continue
      const url = normalizeRestorableWebUrl(candidate.url, options)
      if (!url) continue
      tabs.push({ id: candidate.id, kind: 'web', url, title: sanitizeTitle(candidate.title) })
      survivingIds.add(candidate.id)
    } else if (
      candidate.kind === 'internal'
      && typeof candidate.title === 'string'
      && isInternalPage(candidate.page)
    ) {
      tabs.push({
        id: candidate.id,
        kind: 'internal',
        page: candidate.page,
        title: sanitizeTitle(candidate.title),
      })
      survivingIds.add(candidate.id)
    }
  }

  if (tabs.length === 0) return { version: 1, activeTabId: null, tabs: [] }
  if (activeTabId && survivingIds.has(activeTabId)) {
    return { version: 1, activeTabId, tabs }
  }

  const activeCandidateIndex = candidates.findIndex((tab) => tab.id === activeTabId)
  if (activeCandidateIndex >= 0) {
    for (let index = activeCandidateIndex + 1; index < candidates.length; index += 1) {
      if (survivingIds.has(candidates[index].id)) {
        return { version: 1, activeTabId: candidates[index].id, tabs }
      }
    }
    for (let index = activeCandidateIndex - 1; index >= 0; index -= 1) {
      if (survivingIds.has(candidates[index].id)) {
        return { version: 1, activeTabId: candidates[index].id, tabs }
      }
    }
  }

  return { version: 1, activeTabId: tabs[0].id, tabs }
}
