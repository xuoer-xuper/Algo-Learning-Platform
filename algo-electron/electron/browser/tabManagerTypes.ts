import type { WebContentsView } from 'electron'

export type InternalPage =
  | { type: 'home' }
  | { type: 'settings' }
  | { type: 'dashboard' }
  | { type: 'scripts' }
  | { type: 'coach-metrics' }
  | { type: 'problem-detail'; problemId: string }
  | { type: 'notes'; problemId: string }
  | { type: 'credentials' }
  | { type: 'script-install'; installId: string }

const SIMPLE_INTERNAL_PAGES = new Set<InternalPage['type']>([
  'home',
  'settings',
  'dashboard',
  'scripts',
  'coach-metrics',
  'credentials',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actualKeys = Object.keys(value)
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key))
}

function hasWhitespaceOrControl(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return /\s/u.test(character) || codePoint < 32 || codePoint === 127
  })
}

function isNonEmptyId(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.length > 0
    && value.length <= 200
    && value.trim() === value
    && !hasWhitespaceOrControl(value)
  )
}

export function isInternalPage(value: unknown): value is InternalPage {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  if (SIMPLE_INTERNAL_PAGES.has(value.type as InternalPage['type'])) {
    return hasOnlyKeys(value, ['type'])
  }
  if (value.type === 'problem-detail' || value.type === 'notes') {
    return hasOnlyKeys(value, ['type', 'problemId']) && isNonEmptyId(value.problemId)
  }
  if (value.type === 'script-install') {
    return hasOnlyKeys(value, ['type', 'installId']) && isNonEmptyId(value.installId)
  }
  return false
}

interface TabInfoBase {
  id: string
  url: string
  title: string
  favicon: string | null
  isLoading: boolean
  isCrashed: boolean
  isUnresponsive: boolean
  isUnresponsiveNoticeDismissed: boolean
  isActive: boolean
}

export interface WebTabInfo extends TabInfoBase {
  kind: 'web'
}

export interface InternalTabInfo extends TabInfoBase {
  kind: 'internal'
  page: InternalPage
}

export type TabInfo = WebTabInfo | InternalTabInfo

interface ManagedTabBase {
  id: string
  url: string
  title: string
  favicon: string | null
  isLoading: boolean
  isCrashed: boolean
  isUnresponsive: boolean
  isUnresponsiveNoticeDismissed: boolean
}

export interface ManagedWebTab extends ManagedTabBase {
  kind: 'web'
  view: WebContentsView
}

export interface ManagedInternalTab extends ManagedTabBase {
  kind: 'internal'
  page: InternalPage
}

export type ManagedTab = ManagedWebTab | ManagedInternalTab

export type ReleasedTabState = 'released' | 'adopted' | 'rolled-back' | 'invalid'

export interface ReleasedTab {
  readonly tabId: string
  readonly kind: ManagedTab['kind']
  readonly sourceWindowId: string
  readonly state: ReleasedTabState
  rollback(): boolean
}

export interface AdoptReleasedTabOptions {
  activate?: boolean
  index?: number
}

export interface WebTabSnapshot {
  id: string
  kind: 'web'
  url: string
  title: string
}

export interface InternalTabSnapshot {
  id: string
  kind: 'internal'
  page: InternalPage
  title: string
}

export type TabSnapshot = WebTabSnapshot | InternalTabSnapshot

export interface TabSessionSnapshot {
  version: 1
  activeTabId: string | null
  tabs: TabSnapshot[]
}

export type ClosedTabSnapshot =
  | Omit<WebTabSnapshot, 'id'>
  | Omit<InternalTabSnapshot, 'id'>
