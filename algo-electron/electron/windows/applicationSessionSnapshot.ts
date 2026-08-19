import type { Rectangle } from 'electron'
import type { TabSnapshot } from '../browser/tabManagerTypes'
import {
  createTabSessionSnapshot,
  parseTabSessionSnapshot,
  type TabSessionSnapshotOptions,
} from '../browser/tabSessionSnapshot'

export const MAX_APPLICATION_SESSION_WINDOWS = 16
export const MAX_APPLICATION_SESSION_TABS = 128
export const MAX_APPLICATION_SESSION_JSON_BYTES = 768 * 1_024

const MAX_WINDOW_ID_LENGTH = 64
const WINDOW_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const MAX_WINDOW_COORDINATE = 1_000_000
const MAX_WINDOW_DIMENSION = 100_000

export interface ApplicationWindowSessionSnapshot {
  id: string
  bounds: Rectangle
  maximized: boolean
  activeTabId: string | null
  tabs: TabSnapshot[]
}

export interface ApplicationSessionSnapshot {
  version: 1
  mostRecentWindowId: string | null
  windows: ApplicationWindowSessionSnapshot[]
}

export function getApplicationWindowsInRestoreOrder(
  snapshot: ApplicationSessionSnapshot,
): ApplicationWindowSessionSnapshot[] {
  const mostRecentWindow = snapshot.mostRecentWindowId
    ? snapshot.windows.find((window) => window.id === snapshot.mostRecentWindowId) ?? null
    : null
  if (!mostRecentWindow) return [...snapshot.windows]
  return [
    mostRecentWindow,
    ...snapshot.windows.filter((window) => window.id !== mostRecentWindow.id),
  ]
}

export interface ApplicationWindowSessionCandidate {
  id: string
  bounds: Rectangle
  maximized: boolean
  activeTabId: string | null
  tabs: readonly TabSnapshot[]
}

export type ApplicationSessionValidationReason =
  | 'invalid-json'
  | 'oversized-json'
  | 'invalid-envelope'
  | 'unsupported-version'
  | 'invalid-windows'
  | 'too-many-windows'
  | 'invalid-window'
  | 'duplicate-window-id'
  | 'too-many-tabs'
  | 'duplicate-tab-id'
  | 'invalid-recent-window'

export type ApplicationSessionValidationResult =
  | { ok: true; snapshot: ApplicationSessionSnapshot }
  | { ok: false; reason: ApplicationSessionValidationReason }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value)
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key))
}

function isValidWindowId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= MAX_WINDOW_ID_LENGTH
    && WINDOW_ID_PATTERN.test(value)
}

function isValidCoordinate(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && Math.abs(value) <= MAX_WINDOW_COORDINATE
}

function isValidDimension(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= MAX_WINDOW_DIMENSION
}

function parseBounds(value: unknown): Rectangle | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['x', 'y', 'width', 'height'])) return null
  if (
    !isValidCoordinate(value.x)
    || !isValidCoordinate(value.y)
    || !isValidDimension(value.width)
    || !isValidDimension(value.height)
  ) {
    return null
  }
  return { x: value.x, y: value.y, width: value.width, height: value.height }
}

function parseWindow(
  value: unknown,
  options: TabSessionSnapshotOptions,
): { ok: true; snapshot: ApplicationWindowSessionSnapshot } | {
  ok: false
  reason: 'invalid-window' | 'too-many-tabs' | 'duplicate-tab-id'
} {
  if (
    !isRecord(value)
    || !hasOnlyKeys(value, ['id', 'bounds', 'maximized', 'activeTabId', 'tabs'])
    || !isValidWindowId(value.id)
    || typeof value.maximized !== 'boolean'
  ) {
    return { ok: false, reason: 'invalid-window' }
  }
  const bounds = parseBounds(value.bounds)
  if (!bounds) return { ok: false, reason: 'invalid-window' }

  const tabs = parseTabSessionSnapshot({
    version: 1,
    activeTabId: value.activeTabId,
    tabs: value.tabs,
  }, options)
  if (!tabs.ok) {
    if (tabs.reason === 'too-many-tabs') return { ok: false, reason: 'too-many-tabs' }
    if (tabs.reason === 'duplicate-tab-id') return { ok: false, reason: 'duplicate-tab-id' }
    return { ok: false, reason: 'invalid-window' }
  }
  if (tabs.snapshot.tabs.length === 0) return { ok: false, reason: 'invalid-window' }

  return {
    ok: true,
    snapshot: {
      id: value.id,
      bounds,
      maximized: value.maximized,
      activeTabId: tabs.snapshot.activeTabId,
      tabs: tabs.snapshot.tabs,
    },
  }
}

export function parseApplicationSessionSnapshot(
  value: unknown,
  options: TabSessionSnapshotOptions = {},
): ApplicationSessionValidationResult {
  if (!isRecord(value) || !hasOnlyKeys(value, ['version', 'mostRecentWindowId', 'windows'])) {
    return { ok: false, reason: 'invalid-envelope' }
  }
  if (value.version !== 1) return { ok: false, reason: 'unsupported-version' }
  if (!Array.isArray(value.windows)) return { ok: false, reason: 'invalid-windows' }
  if (value.windows.length > MAX_APPLICATION_SESSION_WINDOWS) {
    return { ok: false, reason: 'too-many-windows' }
  }

  const windows: ApplicationWindowSessionSnapshot[] = []
  const windowIds = new Set<string>()
  const tabIds = new Set<string>()
  let totalTabs = 0
  for (const candidate of value.windows) {
    const parsed = parseWindow(candidate, options)
    if (!parsed.ok) {
      return { ok: false, reason: parsed.reason }
    }
    if (windowIds.has(parsed.snapshot.id)) {
      return { ok: false, reason: 'duplicate-window-id' }
    }
    windowIds.add(parsed.snapshot.id)

    totalTabs += parsed.snapshot.tabs.length
    if (totalTabs > MAX_APPLICATION_SESSION_TABS) {
      return { ok: false, reason: 'too-many-tabs' }
    }
    for (const tab of parsed.snapshot.tabs) {
      if (tabIds.has(tab.id)) return { ok: false, reason: 'duplicate-tab-id' }
      tabIds.add(tab.id)
    }
    windows.push(parsed.snapshot)
  }

  if (windows.length === 0) {
    if (value.mostRecentWindowId !== null) {
      return { ok: false, reason: 'invalid-recent-window' }
    }
  } else if (
    typeof value.mostRecentWindowId !== 'string'
    || !windowIds.has(value.mostRecentWindowId)
  ) {
    return { ok: false, reason: 'invalid-recent-window' }
  }

  return {
    ok: true,
    snapshot: {
      version: 1,
      mostRecentWindowId: value.mostRecentWindowId as string | null,
      windows,
    },
  }
}

export function parseApplicationSessionSnapshotJson(
  raw: string,
  options: TabSessionSnapshotOptions = {},
): ApplicationSessionValidationResult {
  if (Buffer.byteLength(raw, 'utf8') > MAX_APPLICATION_SESSION_JSON_BYTES) {
    return { ok: false, reason: 'oversized-json' }
  }
  try {
    return parseApplicationSessionSnapshot(JSON.parse(raw), options)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
}

export function createApplicationSessionSnapshot(
  candidates: readonly ApplicationWindowSessionCandidate[],
  mostRecentWindowId: string | null,
  options: TabSessionSnapshotOptions = {},
): ApplicationSessionSnapshot {
  const windows: ApplicationWindowSessionSnapshot[] = []
  const windowIds = new Set<string>()
  const tabIds = new Set<string>()
  let remainingTabs = MAX_APPLICATION_SESSION_TABS

  for (const candidate of candidates) {
    if (windows.length >= MAX_APPLICATION_SESSION_WINDOWS) break
    if (
      !isValidWindowId(candidate.id)
      || windowIds.has(candidate.id)
      || typeof candidate.maximized !== 'boolean'
    ) {
      continue
    }
    const bounds = parseBounds(candidate.bounds)
    if (!bounds) continue

    const uniqueCandidates = candidate.tabs.filter((tab) => !tabIds.has(tab.id))
    const sanitizedSession = createTabSessionSnapshot(
      uniqueCandidates,
      candidate.activeTabId,
      options,
    )
    const session = sanitizedSession.tabs.length <= remainingTabs
      ? sanitizedSession
      : createTabSessionSnapshot(
          sanitizedSession.tabs.slice(0, remainingTabs),
          sanitizedSession.activeTabId,
          options,
        )
    if (session.tabs.length === 0) continue
    for (const tab of session.tabs) tabIds.add(tab.id)
    remainingTabs -= session.tabs.length

    windowIds.add(candidate.id)
    windows.push({
      id: candidate.id,
      bounds,
      maximized: candidate.maximized,
      activeTabId: session.activeTabId,
      tabs: session.tabs,
    })
  }

  const restoredRecentId = mostRecentWindowId && windowIds.has(mostRecentWindowId)
    ? mostRecentWindowId
    : windows[0]?.id ?? null
  return { version: 1, mostRecentWindowId: restoredRecentId, windows }
}
