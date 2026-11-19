import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribeDataChanges } from '../../electron/shared/dataEvents'
import type { DataChangedPayload } from '../../src/shared/types/data'
import { getOriginalOmniboxSuggestions } from './omnibox-suggestions-oracle'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import {
  getOmniboxSuggestions,
  OMNIBOX_SUGGESTION_LIMIT,
} from '../../electron/db/repositories/problemRepository'

let temporaryDirectory = ''

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-omnibox-suggestions-'))
  initDbAtPath(path.join(temporaryDirectory, 'test.sqlite'))
})

afterEach(() => {
  closeDb()
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
})

interface ProblemFixture {
  id: string | null
  platform?: string
  platformProblemId?: string
  canonicalUrl?: string
  title?: string | null
  lastVisitedAt?: number | null
  deletedAt?: number | null
}

interface VisitFixture {
  id: string | null
  problemId: string
  url: string
  enteredAt: number
  deletedAt?: number | null
}

function insertProblem(fixture: ProblemFixture): void {
  const platform = fixture.platform ?? 'codeforces'
  const platformProblemId = fixture.platformProblemId ?? fixture.id ?? 'nullable-id'
  const canonicalUrl = fixture.canonicalUrl ?? `https://example.com/problems/${fixture.id}`
  const timestamp = Date.parse('2026-07-03T10:00:00+08:00')
  const lastVisitedAt = fixture.lastVisitedAt === undefined ? timestamp : fixture.lastVisitedAt
  getDb()
    .prepare(
      `
    INSERT INTO problems (
      id, platform, platform_problem_id, canonical_url, title, status,
      first_seen_at, last_visited_at, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, 'visited', ?, ?, ?, ?, ?)
  `,
    )
    .run(
      fixture.id,
      platform,
      platformProblemId,
      canonicalUrl,
      fixture.title === undefined ? fixture.id : fixture.title,
      timestamp,
      lastVisitedAt,
      timestamp,
      timestamp,
      fixture.deletedAt ?? null,
    )
}

function insertVisit(fixture: VisitFixture): void {
  getDb()
    .prepare(
      `
    INSERT INTO problem_visits (
      id, problem_id, platform, url, entered_at, created_at, updated_at, deleted_at
    ) VALUES (?, ?, 'codeforces', ?, ?, ?, ?, ?)
  `,
    )
    .run(
      fixture.id,
      fixture.problemId,
      fixture.url,
      fixture.enteredAt,
      fixture.enteredAt,
      fixture.enteredAt,
      fixture.deletedAt ?? null,
    )
}

function timestamp(hour: number, minute = 0): number {
  return Date.parse(
    `2026-07-03T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`,
  )
}

describe('getOmniboxSuggestions', () => {
  it('returns at most eight stable recent suggestions and prefers the latest visit URL', () => {
    for (let index = 0; index < 10; index += 1) {
      const id = `problem-${index}`
      const visitedAt = timestamp(index + 1)
      insertProblem({ id, lastVisitedAt: visitedAt })
      insertVisit({
        id: `visit-${index}`,
        problemId: id,
        url: `https://example.com/visited/${id}`,
        enteredAt: visitedAt,
      })
    }
    insertVisit({
      id: 'visit-9-older',
      problemId: 'problem-9',
      url: 'https://example.com/visited/problem-9-old',
      enteredAt: timestamp(1, 30),
    })

    const suggestions = getOmniboxSuggestions('')

    expect(suggestions).toHaveLength(OMNIBOX_SUGGESTION_LIMIT)
    expect(suggestions.map((suggestion) => suggestion.problemId)).toEqual([
      'problem-9',
      'problem-8',
      'problem-7',
      'problem-6',
      'problem-5',
      'problem-4',
      'problem-3',
      'problem-2',
    ])
    expect(suggestions[0]).toMatchObject({
      url: 'https://example.com/visited/problem-9',
      source: 'history',
      lastVisitedAt: timestamp(10),
    })
  })

  it('matches metadata and recent URLs while ranking exact, prefix, then recency', () => {
    insertProblem({
      id: 'exact',
      platformProblemId: 'ABC',
      title: 'Older exact identifier',
      lastVisitedAt: timestamp(2),
    })
    insertProblem({
      id: 'prefix',
      platformProblemId: 'P-2',
      title: 'ABC Graph Walk',
      lastVisitedAt: timestamp(8),
    })
    insertProblem({
      id: 'substring',
      platformProblemId: 'P-3',
      title: 'Solve the ABC challenge',
      lastVisitedAt: timestamp(9),
    })
    insertProblem({
      id: 'platform',
      platform: 'luogu',
      platformProblemId: 'P1000',
      title: 'Platform match',
      lastVisitedAt: timestamp(7),
    })
    insertProblem({
      id: 'url',
      platformProblemId: 'URL-1',
      canonicalUrl: 'https://example.com/canonical/url-entry',
      title: 'Recent URL match',
      lastVisitedAt: timestamp(6),
    })
    insertVisit({
      id: 'url-visit',
      problemId: 'url',
      url: 'https://example.com/history/special-route',
      enteredAt: timestamp(6),
    })

    expect(getOmniboxSuggestions('abc').map((suggestion) => suggestion.problemId)).toEqual([
      'exact',
      'prefix',
      'substring',
    ])
    expect(getOmniboxSuggestions('LUOGU').map((suggestion) => suggestion.problemId)).toEqual([
      'platform',
    ])
    expect(
      getOmniboxSuggestions('canonical/url-entry').map((suggestion) => suggestion.problemId),
    ).toEqual(['url'])
    expect(getOmniboxSuggestions('special-route')).toEqual([
      expect.objectContaining({
        problemId: 'url',
        url: 'https://example.com/history/special-route',
        source: 'history',
      }),
    ])
  })

  it('treats percent, underscore, and escape characters as LIKE literals', () => {
    insertProblem({ id: 'percent', title: 'Rate 100% Complete', platformProblemId: 'RATE-1' })
    insertProblem({ id: 'percent-decoy', title: 'Rate 1000 Complete', platformProblemId: 'RATE-2' })
    insertProblem({ id: 'underscore', title: 'Literal underscore', platformProblemId: 'A_B' })
    insertProblem({ id: 'underscore-decoy', title: 'Wildcard decoy', platformProblemId: 'AXB' })
    insertProblem({ id: 'escape', title: 'Path \\ Root', platformProblemId: 'PATH-1' })

    expect(getOmniboxSuggestions('100%').map((suggestion) => suggestion.problemId)).toEqual([
      'percent',
    ])
    expect(getOmniboxSuggestions('A_B').map((suggestion) => suggestion.problemId)).toEqual([
      'underscore',
    ])
    expect(getOmniboxSuggestions('\\').map((suggestion) => suggestion.problemId)).toEqual([
      'escape',
    ])
  })

  it('filters deleted rows and ignores deleted visits when choosing a URL', () => {
    insertProblem({
      id: 'active',
      title: 'Visible problem',
      canonicalUrl: 'https://example.com/canonical/visible',
      lastVisitedAt: timestamp(8),
    })
    insertVisit({
      id: 'active-visit',
      problemId: 'active',
      url: 'https://example.com/history/visible-route',
      enteredAt: timestamp(7),
    })
    insertVisit({
      id: 'deleted-visit',
      problemId: 'active',
      url: 'https://example.com/history/hidden-route',
      enteredAt: timestamp(8),
      deletedAt: timestamp(9),
    })
    insertProblem({
      id: 'deleted-problem',
      title: 'Hidden problem',
      lastVisitedAt: timestamp(9),
      deletedAt: timestamp(10),
    })
    insertVisit({
      id: 'deleted-problem-visit',
      problemId: 'deleted-problem',
      url: 'https://example.com/history/deleted-problem',
      enteredAt: timestamp(9),
    })

    expect(getOmniboxSuggestions('hidden-route')).toEqual([])
    expect(getOmniboxSuggestions('Hidden problem')).toEqual([])
    expect(getOmniboxSuggestions('Visible problem')).toEqual([
      expect.objectContaining({
        problemId: 'active',
        url: 'https://example.com/history/visible-route',
      }),
    ])
  })

  it('deduplicates repeated visits, problem candidates, and shared URLs', () => {
    const sharedUrl = 'https://example.com/problems/shared'
    insertProblem({
      id: 'older',
      canonicalUrl: sharedUrl,
      title: 'Shared target',
      lastVisitedAt: timestamp(4),
    })
    insertProblem({
      id: 'newer',
      canonicalUrl: sharedUrl,
      title: 'Shared target',
      lastVisitedAt: timestamp(8),
    })
    insertVisit({ id: 'newer-1', problemId: 'newer', url: sharedUrl, enteredAt: timestamp(7) })
    insertVisit({ id: 'newer-2', problemId: 'newer', url: sharedUrl, enteredAt: timestamp(8) })
    insertVisit({ id: 'older-1', problemId: 'older', url: sharedUrl, enteredAt: timestamp(4) })

    const suggestions = getOmniboxSuggestions('Shared target')

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      problemId: 'newer',
      url: sharedUrl,
      source: 'history',
      lastVisitedAt: timestamp(8),
    })
    expect(new Set(suggestions.map((suggestion) => suggestion.problemId)).size).toBe(
      suggestions.length,
    )
    expect(new Set(suggestions.map((suggestion) => suggestion.url)).size).toBe(suggestions.length)
  })
})

function expectOriginal(query: string): ReturnType<typeof getOmniboxSuggestions> {
  const expected = getOriginalOmniboxSuggestions(getDb(), query)
  const actual = getOmniboxSuggestions(query)
  expect(actual).toEqual(expected)
  return actual
}

function readError(run: () => unknown): { name: string; message: string; code?: unknown } {
  try {
    run()
  } catch (error) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        ...('code' in error ? { code: error.code } : {}),
      }
    }
    throw error
  }
  throw new Error('Expected the query to fail')
}

describe('Omnibox recent-visit Drizzle parity', () => {
  it('should return empty results for empty, whitespace and unmatched queries', () => {
    for (const query of ['', '  \t\n', 'not found']) expect(expectOriginal(query)).toEqual([])
  })

  it.each(['title', 'platform', 'platformProblemId', 'canonicalUrl', 'visitUrl'] as const)(
    'should preserve case-insensitive substring matching through %s',
    (field) => {
      insertProblem({
        id: 'match',
        title: field === 'title' ? 'Start NeEdLe End' : null,
        platform: field === 'platform' ? 'NeEdLe' : 'codeforces',
        platformProblemId: field === 'platformProblemId' ? 'NeEdLe' : 'plain-key',
        canonicalUrl: field === 'canonicalUrl' ? 'https://example.test/NeEdLe' : 'plain-canonical',
        lastVisitedAt: null,
      })
      insertVisit({
        id: null,
        problemId: 'match',
        url: field === 'visitUrl' ? 'https://example.test/NeEdLe' : 'plain-history',
        enteredAt: 123,
      })
      expect(expectOriginal('needle')).toEqual([
        expect.objectContaining({ problemId: 'match', source: 'history', lastVisitedAt: 123 }),
      ])
    },
  )

  it.each(['100%', 'A_B', '\\', "' OR 1=1 --", '中文', 'Ä'])(
    'should preserve literal history URL matches for %s',
    (query) => {
      insertProblem({ id: 'literal', title: null, lastVisitedAt: null })
      insertProblem({ id: 'decoy', title: null, lastVisitedAt: null })
      insertVisit({ id: null, problemId: 'literal', url: `prefix ${query} suffix`, enteredAt: 0 })
      insertVisit({
        id: 'decoy-visit',
        problemId: 'decoy',
        url: 'prefix AXB 1000 ä suffix',
        enteredAt: 1,
      })
      expect(expectOriginal(query).map((row) => row.problemId)).toEqual(['literal'])
      if (query === 'Ä') expect(expectOriginal('ä').map((row) => row.problemId)).toEqual(['decoy'])
    },
  )

  it('should trim before truncating a direct query to 256 code units', () => {
    const prefix = 'q'.repeat(256)
    insertProblem({ id: 'long', title: null, lastVisitedAt: null })
    insertVisit({ id: null, problemId: 'long', url: `${prefix}tail`, enteredAt: 0 })
    expect(expectOriginal(`  ${prefix}ignored  `).map((row) => row.problemId)).toEqual(['long'])
    expect(expectOriginal('   ')).toHaveLength(1)
  })

  it('should preserve integer fixture storage, explicit nulls and epoch zero', () => {
    insertProblem({ id: 'zero', title: '', lastVisitedAt: 0 })
    insertProblem({ id: 'null-time', title: null, lastVisitedAt: null })
    insertVisit({ id: null, problemId: 'null-time', url: '', enteredAt: 0 })
    expect(
      getDb()
        .prepare(
          `
      SELECT id, title, typeof(first_seen_at) AS first_type, typeof(last_visited_at) AS last_type,
             typeof(created_at) AS created_type, typeof(updated_at) AS updated_type
      FROM problems ORDER BY id
    `,
        )
        .all(),
    ).toEqual([
      {
        id: 'null-time',
        title: null,
        first_type: 'integer',
        last_type: 'null',
        created_type: 'integer',
        updated_type: 'integer',
      },
      {
        id: 'zero',
        title: '',
        first_type: 'integer',
        last_type: 'integer',
        created_type: 'integer',
        updated_type: 'integer',
      },
    ])
    expect(getDb().prepare('SELECT typeof(entered_at) AS kind FROM problem_visits').get()).toEqual({
      kind: 'integer',
    })
    const result = expectOriginal('')
    expect(result).toHaveLength(2)
    expect(result.every((row) => row.lastVisitedAt === 0)).toBe(true)
    expect(result.find((row) => row.problemId === 'null-time')).toMatchObject({
      title: null,
      url: '',
      source: 'history',
    })
  })

  it.each([-123456789, -0.5, 0, 123456789, 8640000000000001])(
    'should preserve the raw visit instant %s instead of applying a Date decoder',
    (instant) => {
      insertProblem({ id: 'instant', title: null, lastVisitedAt: null })
      insertVisit({ id: null, problemId: 'instant', url: 'instant-only', enteredAt: instant })
      const result = expectOriginal('instant-only')
      expect(result).toEqual([
        expect.objectContaining({ lastVisitedAt: instant, source: 'history' }),
      ])
      expect(typeof result[0]?.lastVisitedAt).toBe('number')
    },
  )

  it('should apply the 64-visit horizon before URL matching', () => {
    insertProblem({ id: 'boundary', title: null, lastVisitedAt: null })
    for (let index = 0; index < 65; index += 1) {
      insertVisit({
        id: `visit-${index}`,
        problemId: 'boundary',
        url: `history-only-${index}-route`,
        enteredAt: index,
      })
    }
    expect(expectOriginal('history-only-0-route')).toEqual([])
    expect(expectOriginal('history-only-1-route')).toEqual([
      expect.objectContaining({ lastVisitedAt: 1 }),
    ])
  })

  it.each(['deleted-parent', 'missing-parent'] as const)(
    'should count %s visits in the horizon before the parent join',
    (kind) => {
      insertProblem({ id: 'target', title: null, lastVisitedAt: null })
      insertVisit({ id: null, problemId: 'target', url: 'target-history-only', enteredAt: 0 })
      if (kind === 'deleted-parent') insertProblem({ id: 'filler', deletedAt: 0 })
      const db = getDb()
      if (kind === 'missing-parent') db.pragma('foreign_keys = OFF')
      try {
        for (let index = 1; index <= 64; index += 1) {
          insertVisit({
            id: `filler-${index}`,
            problemId: 'filler',
            url: `filler-${index}`,
            enteredAt: index,
          })
        }
      } finally {
        if (kind === 'missing-parent') db.pragma('foreign_keys = ON')
      }
      expect(expectOriginal('target-history-only')).toEqual([])
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    },
  )

  it('should exclude deleted visits before the 64-visit horizon', () => {
    insertProblem({ id: 'target', title: null, lastVisitedAt: null })
    insertVisit({ id: null, problemId: 'target', url: 'target-history-only', enteredAt: 0 })
    for (let index = 1; index <= 70; index += 1) {
      insertVisit({
        id: `deleted-${index}`,
        problemId: 'target',
        url: 'deleted-route',
        enteredAt: index,
        deletedAt: 0,
      })
    }
    expect(expectOriginal('target-history-only')).toEqual([
      expect.objectContaining({ lastVisitedAt: 0 }),
    ])
    expect(expectOriginal('deleted-route')).toEqual([])
  })

  it('should retain the untouched 24-problem horizon and eight-result cap', () => {
    for (let index = 0; index < 25; index += 1) {
      insertProblem({ id: `problem-${index}`, title: `query ${index}`, lastVisitedAt: index })
    }
    insertVisit({
      id: 'outside-latest',
      problemId: 'problem-0',
      url: 'promoted-route',
      enteredAt: 1000,
    })
    insertProblem({ id: 'hidden-filler', deletedAt: 0 })
    for (let index = 0; index < 64; index += 1) {
      insertVisit({
        id: `filler-${index}`,
        problemId: 'hidden-filler',
        url: 'filler',
        enteredAt: 2000 + index,
      })
    }
    const result = expectOriginal('query')
    expect(result).toHaveLength(8)
    expect(result.map((row) => row.problemId)).toEqual(
      Array.from({ length: 8 }, (_, index) => `problem-${24 - index}`),
    )
  })

  it('should preserve SQLite-selected ties at the 64-visit cutoff without adding ID order', () => {
    insertProblem({ id: 'ties', title: null, lastVisitedAt: null })
    for (let index = 0; index < 70; index += 1) {
      insertVisit({
        id: `tie-${70 - index}`,
        problemId: 'ties',
        url: `equal-time-route-${index}`,
        enteredAt: 20,
      })
    }
    for (let index = 0; index < 70; index += 1) expectOriginal(`equal-time-route-${index}`)
  })

  it('should keep the latest-visit ID tie break only in the untouched first pipeline', () => {
    insertProblem({ id: 'ties', title: 'parent-match', lastVisitedAt: 20 })
    insertVisit({ id: 'z', problemId: 'ties', url: 'z-route', enteredAt: 20 })
    insertVisit({ id: 'a', problemId: 'ties', url: 'a-route', enteredAt: 20 })
    expect(expectOriginal('parent-match')).toEqual([expect.objectContaining({ url: 'a-route' })])
    expect(expectOriginal('z-route')).toEqual([expect.objectContaining({ url: 'z-route' })])
  })

  it('should preserve nullable parents in the first pipeline and empty IDs in the recent pipeline', () => {
    insertProblem({ id: null, platformProblemId: 'null-one', title: null, lastVisitedAt: 10 })
    insertProblem({
      id: null,
      platformProblemId: 'null-two',
      title: 'second-null',
      lastVisitedAt: 9,
    })
    insertProblem({ id: '', platformProblemId: 'empty', title: '', lastVisitedAt: null })
    insertVisit({ id: null, problemId: '', url: 'empty-history-route', enteredAt: 0 })
    const result = expectOriginal('')
    expect(result).toHaveLength(2)
    expect(result.map((row) => row.problemId)).toEqual([null, ''])
    expect(expectOriginal('empty-history-route')).toEqual([
      expect.objectContaining({ problemId: '', lastVisitedAt: 0, source: 'history' }),
    ])
  })

  it('should preserve abstract nullable ID comparisons without imposing a new order', () => {
    for (const [index, id] of [null, '-1', '1', '', 'abc'].entries()) {
      insertProblem({ id, platformProblemId: `nullable-tie-${index}`, lastVisitedAt: 0 })
    }
    expectOriginal('')
  })

  it('should preserve history priority, URL normalization and invalid-URL trimming', () => {
    insertProblem({
      id: 'history',
      title: 'shared',
      lastVisitedAt: 10,
      canonicalUrl: 'https://example.test/path',
    })
    insertVisit({
      id: null,
      problemId: 'history',
      url: 'https://EXAMPLE.TEST:443/path',
      enteredAt: 10,
    })
    insertProblem({
      id: 'invalid-new',
      title: 'shared',
      lastVisitedAt: null,
      canonicalUrl: '  invalid path  ',
    })
    insertProblem({
      id: 'invalid-old',
      title: 'shared',
      lastVisitedAt: null,
      canonicalUrl: 'invalid path',
    })
    insertVisit({ id: null, problemId: 'invalid-new', url: '  invalid path  ', enteredAt: 9 })
    insertVisit({ id: null, problemId: 'invalid-old', url: 'invalid path', enteredAt: 8 })
    const result = expectOriginal('shared')
    expect(result.map((row) => row.problemId)).toEqual(['history', 'invalid-new'])
    expect(result[0]).toMatchObject({ source: 'history', url: 'https://EXAMPLE.TEST:443/path' })
  })

  it('should execute two read-only statements on the current connection without events or writes', () => {
    insertProblem({ id: 'readonly', title: null, lastVisitedAt: null })
    insertVisit({ id: null, problemId: 'readonly', url: 'readonly-route', enteredAt: 0 })
    const db = getDb()
    const events: DataChangedPayload[] = []
    const unsubscribe = subscribeDataChanges((payload) => events.push(payload))
    db.pragma('query_only = ON')
    const before = db.serialize()
    const changes = db.prepare('SELECT total_changes() AS count').get()
    const prepare = vi.spyOn(db, 'prepare')
    try {
      expect(getOmniboxSuggestions('readonly-route')).toHaveLength(1)
      expect(prepare.mock.calls).toHaveLength(2)
      expect(prepare.mock.calls.every(([query]) => /^\s*with\b/i.test(query))).toBe(true)
    } finally {
      prepare.mockRestore()
      unsubscribe()
    }
    expect(getDb()).toBe(db)
    expect(db.inTransaction).toBe(false)
    expect(db.serialize()).toEqual(before)
    expect(db.prepare('SELECT total_changes() AS count').get()).toEqual(changes)
    expect(db.pragma('query_only', { simple: true })).toBe(1)
    expect(events).toEqual([])
    expectOriginal('readonly-route')
  })

  it('should see uncommitted visits without committing or notifying', () => {
    const db = getDb()
    const events: DataChangedPayload[] = []
    const unsubscribe = subscribeDataChanges((payload) => events.push(payload))
    try {
      expect(() =>
        db.transaction(() => {
          insertProblem({ id: 'transaction', title: null, lastVisitedAt: null })
          insertVisit({
            id: null,
            problemId: 'transaction',
            url: 'transaction-route',
            enteredAt: 0,
          })
          expect(expectOriginal('transaction-route')).toHaveLength(1)
          expect(db.inTransaction).toBe(true)
          throw new Error('rollback query fixture')
        })(),
      ).toThrow('rollback query fixture')
      expect(expectOriginal('transaction-route')).toEqual([])
      expect(events).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  it('should use the reopened lifecycle connection and propagate closed-owner errors', () => {
    const first = getDb()
    insertProblem({ id: 'first', title: null, lastVisitedAt: null })
    insertVisit({ id: null, problemId: 'first', url: 'lifecycle-route', enteredAt: 0 })
    expect(expectOriginal('lifecycle-route')).toHaveLength(1)
    closeDb()
    expect(first.open).toBe(false)
    expect(() => getOmniboxSuggestions('lifecycle-route')).toThrow('Database not initialized')
    const second = initDbAtPath(':memory:')
    expect(second).not.toBe(first)
    expect(expectOriginal('lifecycle-route')).toEqual([])
    insertProblem({ id: 'second', title: null, lastVisitedAt: null })
    insertVisit({ id: null, problemId: 'second', url: 'lifecycle-route', enteredAt: 0 })
    expect(expectOriginal('lifecycle-route')).toEqual([
      expect.objectContaining({ problemId: 'second' }),
    ])
  })

  it('should propagate a recent-pipeline SQLite error with its original name, message and code', () => {
    // Inject a native prepare failure only when the second candidate query is prepared.
    const db = getDb()
    const prepare = db.prepare.bind(db)
    const spy = vi.spyOn(db, 'prepare').mockImplementation((query) => {
      if (/with ["']?recent_visits/i.test(query))
        return prepare('SELECT unavailable_column FROM problem_visits')
      return prepare(query)
    })
    try {
      const expected = readError(() => getOriginalOmniboxSuggestions(db, 'error'))
      expect(readError(() => getOmniboxSuggestions('error'))).toEqual(expected)
      expect(expected.message).toMatch(/no such column/i)
    } finally {
      spy.mockRestore()
    }
  })
})
