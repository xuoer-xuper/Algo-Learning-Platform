export const MAX_FIND_IN_PAGE_QUERY_LENGTH = 512

export type FindInPageCommand =
  | { type: 'query'; query: string }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'close' }

export interface FindInPageState {
  query: string
  requestId: number | null
  activeMatchOrdinal: number
  matches: number
  finalUpdate: boolean
}

export interface FindInPageViewState extends FindInPageState {
  open: boolean
  tabId: string | null
}

export type FindInPageEffect =
  | {
      type: 'find'
      query: string
      options: {
        forward: boolean
        findNext: boolean
      }
    }
  | {
      type: 'stop'
      action: 'clearSelection' | 'keepSelection'
    }
  | { type: 'none' }

export interface FindInPageTransition {
  state: FindInPageState
  effect: FindInPageEffect
}

export interface FindInPageResult {
  requestId: number
  activeMatchOrdinal: number
  matches: number
  finalUpdate: boolean
}

export const INITIAL_FIND_IN_PAGE_STATE: Readonly<FindInPageState> = Object.freeze({
  query: '',
  requestId: null,
  activeMatchOrdinal: 0,
  matches: 0,
  finalUpdate: true,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actualKeys = Object.keys(value)
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key))
}

function isValidQuery(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= MAX_FIND_IN_PAGE_QUERY_LENGTH
    && !value.includes('\0')
}

function createPendingState(query: string): FindInPageState {
  return {
    query,
    requestId: null,
    activeMatchOrdinal: 0,
    matches: 0,
    finalUpdate: false,
  }
}

export function parseFindInPageCommand(value: unknown): FindInPageCommand | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null
  if (value.type === 'query') {
    return hasOnlyKeys(value, ['type', 'query']) && isValidQuery(value.query)
      ? { type: 'query', query: value.query }
      : null
  }
  if (value.type === 'next' || value.type === 'previous' || value.type === 'close') {
    return hasOnlyKeys(value, ['type']) ? { type: value.type } : null
  }
  return null
}

export function reduceFindInPageCommand(
  current: FindInPageState,
  command: FindInPageCommand,
): FindInPageTransition {
  if (command.type === 'close') {
    return {
      state: { ...INITIAL_FIND_IN_PAGE_STATE },
      effect: { type: 'stop', action: 'keepSelection' },
    }
  }

  if (command.type === 'query') {
    if (!command.query) {
      return {
        state: { ...INITIAL_FIND_IN_PAGE_STATE },
        effect: { type: 'stop', action: 'clearSelection' },
      }
    }
    return {
      state: createPendingState(command.query),
      effect: {
        type: 'find',
        query: command.query,
        options: { forward: true, findNext: true },
      },
    }
  }

  if (!current.query) return { state: { ...current }, effect: { type: 'none' } }
  return {
    state: createPendingState(current.query),
    effect: {
      type: 'find',
      query: current.query,
      options: {
        forward: command.type === 'next',
        findNext: false,
      },
    },
  }
}

export function registerFindInPageRequest(
  state: FindInPageState,
  requestId: unknown,
): FindInPageState {
  if (!Number.isInteger(requestId) || (requestId as number) < 0) return { ...state }
  return { ...state, requestId: requestId as number }
}

export function applyFindInPageResult(
  state: FindInPageState,
  value: unknown,
): FindInPageState | null {
  if (!isRecord(value)) return null
  const { requestId, activeMatchOrdinal, matches, finalUpdate } = value
  if (
    !Number.isInteger(requestId)
    || !Number.isInteger(activeMatchOrdinal)
    || !Number.isInteger(matches)
    || typeof finalUpdate !== 'boolean'
    || (requestId as number) < 0
    || (activeMatchOrdinal as number) < 0
    || (matches as number) < 0
  ) {
    return null
  }
  if (requestId !== state.requestId) return null
  return {
    ...state,
    activeMatchOrdinal: activeMatchOrdinal as number,
    matches: matches as number,
    finalUpdate,
  }
}
