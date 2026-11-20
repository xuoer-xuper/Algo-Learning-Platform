import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import * as connection from '../../electron/db/connection'
import {
  getLastActiveTime,
  getPlatformDistribution,
  getProblemVisitStats,
} from '../../electron/db/repositories/statsRepository'
import { subscribeDataChanges } from '../../electron/shared/dataEvents'
import type { DataChangedPayload } from '../../src/shared/types/data'
import {
  getOriginalStatsLastActive,
  getOriginalStatsPlatformDistribution,
  getOriginalStatsProblemVisits,
} from './stats-basic-reads-oracle'

const NOW = 1768443630123
const ZERO_VISITS = { total_visits: 0, total_duration: 0, total_active: 0, avg_duration: 0 }
const directories: string[] = []

type Reads = {
  distribution: typeof getPlatformDistribution
  visits: typeof getProblemVisitStats
  latest: typeof getLastActiveTime
}

type Scenario = { db: Database.Database; reads: Reads; trace: string[]; original: boolean }

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => {
  closeDb()
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const directory of directories.splice(0)) {
    assert.ok(
      path
        .resolve(directory)
        .startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-stats-basic-`),
    )
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function seedProblem(
  db: Database.Database,
  id: string | null,
  platform = 'codeforces',
  deletedAt: number | null = null,
  key = id ?? 'null-parent',
) {
  db.prepare(
    `INSERT INTO problems
    (id,platform,platform_problem_id,canonical_url,first_seen_at,created_at,updated_at,deleted_at)
    VALUES (?,?,?,'https://example.invalid/problem',0,1,2,?)`,
  ).run(id, platform, key, deletedAt)
}

function seedVisit(
  db: Database.Database,
  problemId: string,
  id: string | null = null,
  duration: number | string | null = null,
  active: number | string | null = null,
  deletedAt: number | null = null,
) {
  db.prepare(
    `INSERT INTO problem_visits
    (id,problem_id,platform,url,entered_at,duration_seconds,active_seconds,created_at,updated_at,deleted_at)
    VALUES (?,?,'codeforces','https://example.invalid/visit',1.75,?,?,0,0,?)`,
  ).run(id, problemId, duration, active, deletedAt)
}

function seedActivity(
  db: Database.Database,
  instant: number | string,
  id: string | null = 'event',
  deletedAt: number | null = null,
  eventType = 'visit_start',
) {
  db.prepare(
    `INSERT INTO activity_events
    (id,event_type,occurred_at,local_day,created_at,updated_at,deleted_at)
    VALUES (?,?,?,'2026-01-15',0,0,?)`,
  ).run(id, eventType, instant, deletedAt)
}

function snapshot(db: Database.Database) {
  const tables = db
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
  return {
    changes: db.prepare('SELECT total_changes() AS count').get(),
    schema: db.prepare('SELECT * FROM sqlite_schema ORDER BY type,name').all(),
    tables: tables.map(({ name }) => ({
      name,
      rows: db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all(),
    })),
    inTransaction: db.inTransaction,
  }
}

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape)
  if (value !== null && typeof value === 'object')
    return Object.entries(value).map(([key, entry]) => [key, shape(entry)])
  return value === null ? 'null' : typeof value
}

function outcome(run: () => unknown) {
  try {
    return { value: run() }
  } catch (error) {
    if (!(error instanceof Error)) throw error
    return {
      error: {
        name: error.name,
        message: error.message,
        ...('code' in error ? { code: error.code } : {}),
      },
    }
  }
}

function compare(run: (scenario: Scenario) => unknown) {
  const results = []
  for (const original of [true, false]) {
    closeDb()
    const db = initDbAtPath(':memory:')
    const trace: string[] = []
    const events: DataChangedPayload[] = []
    const unsubscribe = subscribeDataChanges((event) => events.push(event))
    const clock = vi.spyOn(Date, 'now')
    function checked<T>(read: () => T): T {
      let current: Database.Database | undefined
      try {
        current = getDb()
      } catch {
        /* Closed lifecycle is also exercised below. */
      }
      const before = current?.open ? snapshot(current) : undefined
      const calls = clock.mock.calls.length
      try {
        return read()
      } finally {
        if (before && current) expect(snapshot(current)).toEqual(before)
        expect(events).toEqual([])
        expect(clock.mock.calls.length).toBe(calls)
      }
    }
    const reads: Reads = {
      distribution: () =>
        checked(() =>
          original ? getOriginalStatsPlatformDistribution(getDb()) : getPlatformDistribution(),
        ),
      visits: (id) =>
        checked(() =>
          original ? getOriginalStatsProblemVisits(getDb(), id) : getProblemVisitStats(id),
        ),
      latest: () =>
        checked(() => (original ? getOriginalStatsLastActive(getDb()) : getLastActiveTime())),
    }
    try {
      const result = run({ db, reads, trace, original })
      results.push({ result, shape: shape(result), state: snapshot(getDb()), trace, events })
    } finally {
      unsubscribe()
      clock.mockRestore()
      closeDb()
    }
  }
  expect(results[1]).toEqual(results[0])
}

function traceStatements(
  db: Database.Database,
  trace: string[],
  failAt?: 'prepare' | 'step',
  sentinel = new Error('read sentinel'),
) {
  const nativePrepare = db.prepare.bind(db)
  const restores: (() => void)[] = []
  let thrown: unknown
  const prepare = vi.spyOn(db, 'prepare').mockImplementation((query) => {
    // Snapshot SQL is intentionally outside repository query traces.
    const kind =
      /group by/i.test(query) && /from\s+["`]?problems/i.test(query)
        ? 'distribution'
        : /avg\(/i.test(query)
          ? 'visits'
          : /from\s+["`]?activity_events/i.test(query) && /limit/i.test(query)
            ? 'latest'
            : null
    if (!kind) return nativePrepare(query)
    trace.push(`prepare:${kind}`)
    if (failAt === 'prepare') {
      thrown = sentinel
      throw sentinel
    }
    let statement
    try {
      statement = nativePrepare(query)
    } catch (error) {
      thrown = error
      throw error
    }
    for (const method of ['get', 'all'] as const) {
      const execute = statement[method].bind(statement)
      const spy = vi.spyOn(statement, method).mockImplementation((...bindings: unknown[]) => {
        trace.push(`${method}:${kind}:${JSON.stringify(kind === 'latest' ? [] : bindings)}`)
        if (failAt === 'step') {
          thrown = sentinel
          throw sentinel
        }
        try {
          return execute(...bindings)
        } catch (error) {
          thrown = error
          throw error
        }
      })
      restores.push(() => spy.mockRestore())
    }
    return statement
  })
  return {
    error: () => thrown,
    restore: () => {
      prepare.mockRestore()
      for (const restore of restores) restore()
    },
  }
}

describe('basic stats reads match their frozen SQL', () => {
  it('returns exact empty shapes without clocks, writes, events or owned transactions', () => {
    compare(({ reads }) => {
      const result = {
        distribution: reads.distribution(),
        visits: reads.visits('missing'),
        latest: reads.latest(),
      }
      expect(result).toEqual({ distribution: [], visits: ZERO_VISITS, latest: null })
      expect(Object.keys(result.visits)).toEqual([
        'total_visits',
        'total_duration',
        'total_active',
        'avg_duration',
      ])
      return result
    })
  })

  it.each([false, true])(
    'preserves COUNT(*) groups, nullable IDs, tombstones, exact text and ties; reverse=%s',
    (reverse) => {
      compare(({ db, reads }) => {
        seedProblem(db, null, 'most', null, 'null-1')
        seedProblem(db, null, 'most', null, 'null-2')
        seedProblem(db, '', 'most')
        seedProblem(db, 'deleted-zero', 'most', 0)
        seedProblem(db, 'deleted-time', 'most', NOW)
        for (const [index, platform] of [
          'Codeforces',
          'codeforces',
          "O'Reilly",
          '%_\\',
          '\u4e2d\u6587',
          'emoji-\ud83d\ude00',
          'with\0nul',
          '',
        ].entries())
          seedProblem(db, `p${index}`, platform)
        if (reverse) db.pragma('reverse_unordered_selects = ON')
        const distribution = reads.distribution()
        expect(distribution[0]).toEqual({ platform: 'most', count: 3 })
        expect(distribution).toHaveLength(9)
        expect(distribution.reduce((total, row) => total + row.count, 0)).toBe(11)
        for (const row of distribution) {
          expect(Object.keys(row)).toEqual(['platform', 'count'])
          expect(typeof row.count).toBe('number')
        }
        return distribution
      })
    },
  )

  it('does not cap the number of distinct platform groups', () => {
    compare(({ db, reads }) => {
      for (let index = 0; index < 65; index++) seedProblem(db, `p${index}`, `platform-${index}`)
      const rows = reads.distribution()
      expect(rows).toHaveLength(65)
      return rows
    })
  })

  it('uses AVG nonnull duration denominator and independent active NULLs, including NULL visit IDs', () => {
    compare(({ db, reads }) => {
      seedProblem(db, 'p', 'codeforces', 0)
      seedVisit(db, 'p', null, 10, null, 0)
      seedVisit(db, 'p', null, null, 7)
      seedVisit(db, 'p', '', 20, null, NOW)
      const result = reads.visits('p')
      expect(result).toEqual({
        total_visits: 3,
        total_duration: 30,
        total_active: 7,
        avg_duration: 15,
      })
      expect(reads.visits('absent')).toEqual(ZERO_VISITS)
      expect(reads.distribution()).toEqual([])
      return result
    })
  })

  it('returns SQL-defined zeros for all-NULL duration/active values without losing visit count', () => {
    compare(({ db, reads }) => {
      seedProblem(db, 'p')
      seedVisit(db, 'p')
      seedVisit(db, 'p', null, null, null, 0)
      const result = reads.visits('p')
      expect(result).toEqual({ ...ZERO_VISITS, total_visits: 2 })
      return result
    })
  })

  it.each(['fraction', 'text'])(
    'keeps native negative and %s aggregates without String/Number decoders',
    (kind) => {
      compare(({ db, reads }) => {
        db.pragma('foreign_keys = OFF')
        seedVisit(db, 'orphan', null, kind === 'fraction' ? -2.5 : 'numeric-garbage', 1.25, 0)
        seedVisit(db, 'orphan', 'other', 4, kind === 'fraction' ? -2 : '3.5')
        seedVisit(db, 'orphan', 'last', null, null)
        db.pragma('foreign_keys = ON')
        const result = reads.visits('orphan')
        expect(result).toEqual(
          kind === 'fraction'
            ? { total_visits: 3, total_duration: 1.5, total_active: -0.75, avg_duration: 0.75 }
            : { total_visits: 3, total_duration: 4, total_active: 4.75, avg_duration: 2 },
        )
        expect(Object.values(result).every((value) => typeof value === 'number')).toBe(true)
        return result
      })
    },
  )

  it.each([
    '',
    'Case',
    'case',
    "O'Reilly",
    '%_\\',
    "' OR 1=1 --",
    ' spaced ',
    '\u4e2d\u6587',
    'emoji-\ud83d\ude00',
    'with\0nul',
    '\ud800',
  ])('binds exact visit problem key %j without normalization or wildcard interpretation', (key) => {
    compare(({ db, reads, trace }) => {
      seedProblem(db, key)
      seedProblem(db, 'other')
      seedVisit(db, key, null, 1.75, 0)
      seedVisit(db, 'other', 'other', 100, 100)
      const tracking = traceStatements(db, trace)
      let result
      try {
        result = reads.visits(key)
      } finally {
        tracking.restore()
      }
      expect(result).toEqual({
        total_visits: 1,
        total_duration: 1.75,
        total_active: 0,
        avg_duration: 1.75,
      })
      expect(trace).toEqual(['prepare:visits', `get:visits:${JSON.stringify([key])}`])
      return result
    })
  })

  it.each([
    0,
    -1,
    1.75,
    -0.5,
    NOW,
    8640000000000001,
    Number.MAX_SAFE_INTEGER + 1,
    'diagnostic-time',
  ])('keeps raw latest instant %s, including tombstones and nullable IDs', (instant) => {
    compare(({ db, reads, trace }) => {
      seedActivity(db, -100, 'older')
      seedActivity(db, instant, null, 0, 'unrecognized-event')
      const tracking = traceStatements(db, trace)
      let latest
      try {
        latest = reads.latest()
      } finally {
        tracking.restore()
      }
      expect(latest).toBe(instant)
      expect(trace).toEqual(['prepare:latest', 'get:latest:[]'])
      return latest
    })
  })

  it('preserves latest ordered row, ties, no horizon and INTEGER/TEXT affinity ordering', () => {
    compare(({ db, reads }) => {
      for (let index = 0; index < 80; index++) seedActivity(db, index, `event-${index}`)
      seedActivity(db, 1000, 'tie-1')
      seedActivity(db, 1000, 'tie-2', 0)
      expect(reads.latest()).toBe(1000)
      seedActivity(db, 'diagnostic-time', 'text')
      expect(reads.latest()).toBe('diagnostic-time')
      db.prepare('DELETE FROM activity_events').run()
      expect(reads.latest()).toBe(null)
    })
  })

  it.each(['duration_seconds', 'active_seconds'])(
    'propagates native INTEGER SUM overflow from %s during step',
    (column) => {
      compare(({ db, reads, trace }) => {
        seedProblem(db, 'p')
        db.exec(`INSERT INTO problem_visits(id,problem_id,platform,url,entered_at,${column},created_at,updated_at)
        VALUES ('max','p','test','https://example.invalid',0,9223372036854775807,0,0),
               ('one','p','test','https://example.invalid',0,1,0,0)`)
        expect(
          db
            .prepare(`SELECT typeof(${column}) AS storage FROM problem_visits ORDER BY rowid`)
            .all(),
        ).toEqual([{ storage: 'integer' }, { storage: 'integer' }])
        const tracking = traceStatements(db, trace)
        let caught: unknown
        try {
          reads.visits('p')
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        expect(caught).toBe(tracking.error())
        assert.ok(caught instanceof Error)
        const result = outcome(() => {
          throw caught
        })
        expect(result).toEqual({
          error: { name: 'SqliteError', message: 'integer overflow', code: 'SQLITE_ERROR' },
        })
        expect(trace).toEqual(['prepare:visits', 'get:visits:["p"]'])
        return result
      })
    },
  )

  it('allows all three reads under query_only without changing any table/schema/ledger', () => {
    compare(({ db, reads, trace }) => {
      seedProblem(db, 'p')
      seedVisit(db, 'p', null, 10, 5, 0)
      seedActivity(db, 0, null, 0)
      db.pragma('query_only = ON')
      const tracking = traceStatements(db, trace)
      let result
      try {
        result = [reads.distribution(), reads.visits('p'), reads.latest()]
      } finally {
        tracking.restore()
      }
      expect(trace).toEqual([
        'prepare:distribution',
        'all:distribution:[]',
        'prepare:visits',
        'get:visits:["p"]',
        'prepare:latest',
        'get:latest:[]',
      ])
      return result
    })
  })

  it('reads a real read-only file through the supplied lifecycle handle', () => {
    compare(({ reads }) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-stats-basic-'))
      directories.push(directory)
      const file = path.join(directory, 'readonly.sqlite')
      closeDb()
      const writable = initDbAtPath(file)
      seedProblem(writable, 'p')
      seedVisit(writable, 'p', null, 3.5, 2)
      seedActivity(writable, 1.75)
      closeDb()
      const readonly = new Database(file, { readonly: true })
      const get = vi.spyOn(connection, 'getDb').mockReturnValue(readonly)
      try {
        expect(readonly.readonly).toBe(true)
        return [reads.distribution(), reads.visits('p'), reads.latest()]
      } finally {
        get.mockRestore()
        readonly.close()
        initDbAtPath(':memory:')
      }
    })
  })

  it('observes caller-owned uncommitted facts and savepoint rollback without retaining state', () => {
    compare(({ db, reads }) => {
      const seen: unknown[] = []
      const result = outcome(() =>
        db.transaction(() => {
          seedProblem(db, 'p')
          seedVisit(db, 'p', null, 10, 5)
          seedActivity(db, 0)
          seen.push([reads.distribution(), reads.visits('p'), reads.latest()])
          expect(db.inTransaction).toBe(true)
          const nested = outcome(() =>
            db.transaction(() => {
              seedVisit(db, 'p', 'nested', 20, 7)
              seedActivity(db, 1.75, 'nested')
              seen.push([reads.visits('p'), reads.latest()])
              throw new Error('savepoint rollback')
            })(),
          )
          expect(nested.error?.message).toBe('savepoint rollback')
          seen.push([reads.visits('p'), reads.latest()])
          expect(reads.visits('p').total_visits).toBe(1)
          throw new Error('outer rollback')
        })(),
      )
      expect(result.error?.message).toBe('outer rollback')
      expect(db.inTransaction).toBe(false)
      expect(reads.distribution()).toEqual([])
      expect(reads.visits('p')).toEqual(ZERO_VISITS)
      expect(reads.latest()).toBe(null)
      return { seen, result }
    })
  })

  it('uses current connection after close/reinit and fails synchronously before any clock on closed state', () => {
    compare(({ db, reads }) => {
      seedProblem(db, 'old')
      seedVisit(db, 'old', null, 1, 1)
      seedActivity(db, 1.75)
      const before = [reads.distribution(), reads.visits('old'), reads.latest()]
      closeDb()
      const closed = [
        outcome(reads.distribution),
        outcome(() => reads.visits('old')),
        outcome(reads.latest),
      ]
      for (const result of closed)
        expect(result.error?.message).toBe('Database not initialized. Call initDb() first.')
      const next = initDbAtPath(':memory:')
      expect(reads.distribution()).toEqual([])
      expect(reads.visits('old')).toEqual(ZERO_VISITS)
      expect(reads.latest()).toBe(null)
      seedProblem(next, 'new', 'other')
      seedVisit(next, 'new', null, 3, 2)
      seedActivity(next, 0)
      return { before, closed, after: [reads.distribution(), reads.visits('new'), reads.latest()] }
    })
  })

  it.each(['distribution', 'visits', 'latest'] as const)(
    'preserves %s prepare/step sentinel identity without a fallback',
    (query) => {
      for (const stage of ['prepare', 'step'] as const)
        compare(({ db, reads, trace }) => {
          const failure = new Error('read sentinel')
          const tracking = traceStatements(db, trace, stage, failure)
          let caught: unknown
          try {
            query === 'visits' ? reads.visits('p') : reads[query]()
          } catch (error) {
            caught = error
          } finally {
            tracking.restore()
          }
          expect(caught).toBe(failure)
          expect(trace).toHaveLength(stage === 'prepare' ? 1 : 2)
        })
    },
  )

  it.each(['distribution', 'visits', 'latest'] as const)(
    'keeps %s damaged-column failure native and at prepare, allowing quoted spelling',
    (query) => {
      compare(({ db, reads, trace, original }) => {
        const table =
          query === 'distribution'
            ? 'problems'
            : query === 'visits'
              ? 'problem_visits'
              : 'activity_events'
        const column =
          query === 'distribution'
            ? 'platform'
            : query === 'visits'
              ? 'duration_seconds'
              : 'occurred_at'
        db.exec(`ALTER TABLE ${table} RENAME COLUMN ${column} TO damaged_column`)
        const tracking = traceStatements(db, trace)
        let caught: unknown
        try {
          query === 'visits' ? reads.visits('p') : reads[query]()
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        expect(caught).toBe(tracking.error())
        assert.ok(caught instanceof Error)
        expect(caught.name).toBe('SqliteError')
        assert.ok('code' in caught)
        expect(caught.code).toBe('SQLITE_ERROR')
        expect(caught.message).toMatch(/^no such column:/)
        expect(caught.message).toContain(column)
        if (original) expect(caught.message).toBe(`no such column: ${column}`)
        expect(trace).toEqual([`prepare:${query}`])
        return { name: caught.name, code: caught.code }
      })
    },
  )

  it.each(['distribution', 'visits', 'latest'] as const)(
    'preserves missing-table %s error without side effects',
    (query) => {
      compare(({ db, reads }) => {
        const table =
          query === 'distribution'
            ? 'problems'
            : query === 'visits'
              ? 'problem_visits'
              : 'activity_events'
        db.pragma('foreign_keys = OFF')
        db.exec(`DROP TABLE ${table}`)
        const result = outcome(() => (query === 'visits' ? reads.visits('p') : reads[query]()))
        expect(result.error).toEqual({
          name: 'SqliteError',
          message: `no such table: ${table}`,
          code: 'SQLITE_ERROR',
        })
        return result
      })
    },
  )
})
