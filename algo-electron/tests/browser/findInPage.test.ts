import { describe, expect, it } from 'vitest'
import {
  INITIAL_FIND_IN_PAGE_STATE,
  applyFindInPageResult,
  parseFindInPageCommand,
  reduceFindInPageCommand,
  registerFindInPageRequest,
} from '../../electron/browser/findInPage.ts'

describe('find-in-page command validation', () => {
  it('accepts exact bounded commands', () => {
    expect(parseFindInPageCommand({ type: 'query', query: 'shortest path' }))
      .toEqual({ type: 'query', query: 'shortest path' })
    expect(parseFindInPageCommand({ type: 'query', query: '' }))
      .toEqual({ type: 'query', query: '' })
    expect(parseFindInPageCommand({ type: 'next' })).toEqual({ type: 'next' })
    expect(parseFindInPageCommand({ type: 'previous' })).toEqual({ type: 'previous' })
    expect(parseFindInPageCommand({ type: 'close' })).toEqual({ type: 'close' })
  })

  it('rejects malformed, oversized, NUL, and extended payloads', () => {
    expect(parseFindInPageCommand({ type: 'query', query: 'x'.repeat(513) })).toBeNull()
    expect(parseFindInPageCommand({ type: 'query', query: 'a\0b' })).toBeNull()
    expect(parseFindInPageCommand({ type: 'next', query: 'unexpected' })).toBeNull()
    expect(parseFindInPageCommand({ type: 'unknown' })).toBeNull()
    expect(parseFindInPageCommand(null)).toBeNull()
  })
})

describe('find-in-page state transitions', () => {
  it('starts a new Electron search session for query changes', () => {
    const transition = reduceFindInPageCommand(
      { ...INITIAL_FIND_IN_PAGE_STATE },
      { type: 'query', query: 'binary search' },
    )

    expect(transition.effect).toEqual({
      type: 'find',
      query: 'binary search',
      options: { forward: true, findNext: true },
    })
    expect(transition.state).toEqual({
      query: 'binary search',
      requestId: null,
      activeMatchOrdinal: 0,
      matches: 0,
      finalUpdate: false,
    })
  })

  it('continues the current session forward and backward', () => {
    const current = { ...INITIAL_FIND_IN_PAGE_STATE, query: 'graph', requestId: 4 }

    expect(reduceFindInPageCommand(current, { type: 'next' }).effect).toEqual({
      type: 'find',
      query: 'graph',
      options: { forward: true, findNext: false },
    })
    expect(reduceFindInPageCommand(current, { type: 'previous' }).effect).toEqual({
      type: 'find',
      query: 'graph',
      options: { forward: false, findNext: false },
    })
  })

  it('clears an empty query and keeps selection when the bar closes', () => {
    const current = { ...INITIAL_FIND_IN_PAGE_STATE, query: 'tree', requestId: 2 }

    expect(reduceFindInPageCommand(current, { type: 'query', query: '' })).toEqual({
      state: { ...INITIAL_FIND_IN_PAGE_STATE },
      effect: { type: 'stop', action: 'clearSelection' },
    })
    expect(reduceFindInPageCommand(current, { type: 'close' })).toEqual({
      state: { ...INITIAL_FIND_IN_PAGE_STATE },
      effect: { type: 'stop', action: 'keepSelection' },
    })
  })

  it('ignores continuation commands without an active query', () => {
    expect(reduceFindInPageCommand(
      { ...INITIAL_FIND_IN_PAGE_STATE },
      { type: 'next' },
    ).effect).toEqual({ type: 'none' })
  })

  it('accepts only results for the latest registered request', () => {
    const state = registerFindInPageRequest({
      ...INITIAL_FIND_IN_PAGE_STATE,
      query: 'dp',
      finalUpdate: false,
    }, 8)

    expect(applyFindInPageResult(state, {
      requestId: 7,
      activeMatchOrdinal: 1,
      matches: 3,
      finalUpdate: true,
    })).toBeNull()
    expect(applyFindInPageResult(state, {
      requestId: 8,
      activeMatchOrdinal: 2,
      matches: 3,
      finalUpdate: true,
      selectionArea: { x: 0, y: 0, width: 10, height: 10 },
    })).toEqual({
      ...state,
      activeMatchOrdinal: 2,
      matches: 3,
      finalUpdate: true,
    })
  })
})
