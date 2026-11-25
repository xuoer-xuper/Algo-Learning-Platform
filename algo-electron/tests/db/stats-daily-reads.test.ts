import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import * as connection from '../../electron/db/connection'
import {
  getAcTrend,
  getDailyActiveStats,
  getSubmissionTrend,
  getVisitedTrend,
} from '../../electron/db/repositories/statsRepository'
import { subscribeDataChanges } from '../../electron/shared/dataEvents'
import type { DataChangedPayload } from '../../src/shared/types/data'
import {
  getOriginalAcTrend,
  getOriginalDailyActiveStats,
  getOriginalSubmissionTrend,
  getOriginalVisitedTrend,
} from './stats-daily-reads-oracle'

const NOW = new Date(2026, 10, 20, 0, 30, 0, 123).getTime()
const DAYS = [null, null, '', '2026-02-30', '2026-11-19', '2026-11-20', '2026-11-21', 'zzz']
const nativeGetDb = getDb
const directories: string[] = []
type Reads = {
  daily: typeof getDailyActiveStats
  visited: typeof getVisitedTrend
  ac: typeof getAcTrend
  submissions: typeof getSubmissionTrend
}
type Scenario = {
  db: Database.Database
  reads: Reads
  trace: string[]
  original: boolean
  setClock: (instant: number) => void
  failClock: (error: Error) => void
  clockCalls: () => number
}

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => {
  closeDb()
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const directory of directories.splice(0)) {
    assert.ok(
      path
        .resolve(directory)
        .startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-stats-daily-`),
    )
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function seed(
  db: Database.Database,
  day: string | null,
  base = 0,
  deletedAt: number | null = null,
) {
  db.prepare(
    `INSERT INTO user_daily_stats
    (local_day,active_seconds,duration_seconds,visited_problem_count,solved_problem_count,
     submission_count,ac_submission_count,platform_distribution_json,recomputed_at,created_at,updated_at,deleted_at)
    VALUES (?,?,?,?,?,?,?,'{"fixture":true}',1.75,0,2,?)`,
  ).run(day, base + 1, base + 2, base + 3, base + 4, base + 5, base + 6, deletedAt)
}

function seedMixed(db: Database.Database) {
  for (const [index, day] of DAYS.entries())
    seed(db, day, index * 10, day === '2026-11-20' ? 0 : null)
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

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape)
  if (value !== null && typeof value === 'object')
    return Object.entries(value).map(([key, entry]) => [key, shape(entry)])
  return value === null ? 'null' : typeof value
}

function compare(run: (scenario: Scenario) => unknown) {
  const results = []
  for (const original of [true, false]) {
    closeDb()
    const db = initDbAtPath(':memory:')
    const trace: string[] = []
    const events: DataChangedPayload[] = []
    const unsubscribe = subscribeDataChanges((event) => events.push(event))
    let instant = NOW
    let clockFailure: Error | undefined
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      trace.push('clock')
      if (clockFailure) throw clockFailure
      return instant
    })
    function checked<T>(read: () => T): T {
      let current: Database.Database | undefined
      try {
        current = nativeGetDb()
      } catch {
        /* Closed connection behavior is also compared. */
      }
      const before = current?.open ? snapshot(current) : undefined
      try {
        return read()
      } finally {
        if (before && current) expect(snapshot(current)).toEqual(before)
        expect(events).toEqual([])
      }
    }
    const reads: Reads = {
      daily: (days) =>
        checked(() =>
          original ? getOriginalDailyActiveStats(getDb(), days) : getDailyActiveStats(days),
        ),
      visited: (days) =>
        checked(() => (original ? getOriginalVisitedTrend(getDb(), days) : getVisitedTrend(days))),
      ac: (days) =>
        checked(() => (original ? getOriginalAcTrend(getDb(), days) : getAcTrend(days))),
      submissions: (days) =>
        checked(() =>
          original ? getOriginalSubmissionTrend(getDb(), days) : getSubmissionTrend(days),
        ),
    }
    try {
      const result = run({
        db,
        reads,
        trace,
        original,
        setClock: (value) => {
          instant = value
        },
        failClock: (error) => {
          clockFailure = error
        },
        clockCalls: () => clock.mock.calls.length,
      })
      results.push({ result, shape: shape(result), state: snapshot(nativeGetDb()), events, trace })
    } finally {
      unsubscribe()
      clock.mockRestore()
      closeDb()
    }
  }
  expect(results[1]).toEqual(results[0])
}

function bindingsText(bindings: unknown[]) {
  return bindings
    .map((value) =>
      typeof value === 'number'
        ? Object.is(value, -0)
          ? '-0'
          : String(value)
        : JSON.stringify(value),
    )
    .join(',')
}

function track(
  db: Database.Database,
  trace: string[],
  failureStage?: 'prepare' | 'all',
  sentinel = new Error('query sentinel'),
) {
  const get = vi.spyOn(connection, 'getDb').mockImplementation(() => {
    trace.push('getDb')
    return nativeGetDb()
  })
  const nativePrepare = db.prepare.bind(db)
  const restores: (() => void)[] = []
  let nativeError: unknown
  const prepare = vi.spyOn(db, 'prepare').mockImplementation((query) => {
    if (!/from ["`]?user_daily_stats/i.test(query) || !/order by .*local_day/i.test(query))
      return nativePrepare(query)
    const kind = /active_seconds/i.test(query)
      ? 'daily'
      : /ac_submission_count/i.test(query)
        ? 'submissions'
        : /visited_problem_count/i.test(query)
          ? 'visited'
          : 'ac'
    trace.push(`prepare:${kind}`)
    if (failureStage === 'prepare') {
      nativeError = sentinel
      throw sentinel
    }
    let statement
    try {
      statement = nativePrepare(query)
    } catch (error) {
      nativeError = error
      throw error
    }
    const nativeAll = statement.all.bind(statement)
    const all = vi.spyOn(statement, 'all').mockImplementation((...bindings: unknown[]) => {
      trace.push(`all:${kind}:[${bindingsText(bindings)}]`)
      if (failureStage === 'all') {
        nativeError = sentinel
        throw sentinel
      }
      try {
        return nativeAll(...bindings)
      } catch (error) {
        nativeError = error
        throw error
      }
    })
    restores.push(() => all.mockRestore())
    return statement
  })
  return {
    error: () => nativeError,
    restore: () => {
      get.mockRestore()
      prepare.mockRestore()
      for (const restore of restores) restore()
    },
  }
}

describe('daily cache reads frozen behavior', () => {
  it('returns empty arrays with no clock or data changes', () => {
    compare(({ reads, clockCalls }) => {
      const result = [reads.daily(), reads.visited(), reads.ac(), reads.submissions()]
      expect(result).toEqual([[], [], [], []])
      expect(clockCalls()).toBe(0)
      return result
    })
  })

  it.each([false, true])(
    'keeps multiple baseline NULL keys, exact metric aliases and native order; reverse=%s',
    (reverse) => {
      compare(({ db, reads, clockCalls }) => {
        seedMixed(db)
        expect(db.pragma('table_info(user_daily_stats)')).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'local_day', notnull: 0, pk: 1 }),
          ]),
        )
        expect(outcome(() => seed(db, '2026-11-20')).error).toEqual({
          name: 'SqliteError',
          message: 'UNIQUE constraint failed: user_daily_stats.local_day',
          code: 'SQLITE_CONSTRAINT_PRIMARYKEY',
        })
        if (reverse) db.pragma('reverse_unordered_selects = ON')
        const result = {
          daily: reads.daily(-1),
          visited: reads.visited(),
          ac: reads.ac(),
          submissions: reads.submissions(-1),
        }
        expect(result.daily.map((row) => row.local_day)).toEqual([
          'zzz',
          '2026-11-21',
          '2026-11-20',
          '2026-11-19',
          '2026-02-30',
          '',
          null,
          null,
        ])
        expect(result.visited.map((row) => row.local_day)).toEqual(DAYS)
        expect(result.ac.map((row) => row.local_day)).toEqual(DAYS)
        expect(result.daily.filter((row) => row.local_day === null)).toHaveLength(2)
        expect(result.daily.find((row) => row.local_day === '2026-11-20')).toEqual({
          local_day: '2026-11-20',
          active_seconds: 51,
          duration_seconds: 52,
          visited: 53,
          solved: 54,
          submissions: 55,
          ac: 56,
        })
        expect(result.ac.find((row) => row.local_day === '2026-11-20')?.count).toBe(54)
        for (const row of result.daily)
          expect(Object.keys(row)).toEqual([
            'local_day',
            'active_seconds',
            'duration_seconds',
            'visited',
            'solved',
            'submissions',
            'ac',
          ])
        for (const row of result.visited) expect(Object.keys(row)).toEqual(['local_day', 'count'])
        for (const row of result.ac) expect(Object.keys(row)).toEqual(['local_day', 'count'])
        for (const row of result.submissions)
          expect(Object.keys(row)).toEqual(['local_day', 'total', 'ac'])
        expect(clockCalls()).toBe(0)
        return result
      })
    },
  )

  it('preserves all-NULL rows and raw negative/fractional metrics with no date decoding', () => {
    compare(({ db, reads }) => {
      seed(db, null, -2.75, 0)
      seed(db, null, 0.25, NOW)
      const result = {
        daily: reads.daily(),
        visited: reads.visited(),
        ac: reads.ac(),
        submissions: reads.submissions(),
      }
      expect(result.daily).toHaveLength(2)
      expect(result.daily.every((row) => row.local_day === null)).toBe(true)
      expect(result.visited.map((row) => row.count)).toEqual([0.25, 3.25])
      expect(result.ac.map((row) => row.count)).toEqual([1.25, 4.25])
      expect(result.daily.some((row) => row.active_seconds === -1.75)).toBe(true)
      return result
    })
  })

  it('keeps default30 as row count instead of calendar horizon and leaves uncapped trends complete', () => {
    compare(({ db, reads }) => {
      for (let index = 0; index < 41; index++)
        seed(db, `2026-11-${String(index).padStart(2, '0')}`, index)
      seed(db, null)
      seed(db, null, 10)
      const result = {
        daily: reads.daily(),
        submissions: reads.submissions(),
        visited: reads.visited(),
        ac: reads.ac(),
      }
      expect(result.daily).toHaveLength(30)
      expect(result.submissions).toHaveLength(30)
      expect(result.visited).toHaveLength(43)
      expect(result.ac).toHaveLength(43)
      expect(result.daily[0].local_day).toBe('2026-11-40')
      return result
    })
  })
})

describe.each(['daily', 'submissions'] as const)('%s native LIMIT contract', (query) => {
  it.each([
    undefined,
    0,
    -0,
    1,
    3,
    30,
    99,
    -1,
    -5,
    1.25,
    -1.25,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
  ])('preserves bound LIMIT %s without an ORM omission/clamp', (days) => {
    compare(({ db, reads, trace, clockCalls }) => {
      seedMixed(db)
      const tracking = track(db, trace)
      let result
      try {
        result = outcome(() => reads[query](days))
      } finally {
        tracking.restore()
      }
      if (days === 0) expect(result.value).toEqual([])
      else if (days === 1) expect(result.value).toHaveLength(1)
      else if (days === -1 || days === -5 || days === undefined)
        expect(result.value).toHaveLength(DAYS.length)
      else if (days !== undefined && (!Number.isFinite(days) || !Number.isInteger(days)))
        expect(result).toHaveProperty('error')
      expect(trace).toEqual([
        'getDb',
        `prepare:${query}`,
        `all:${query}:[${bindingsText([days === undefined ? 30 : days])}]`,
      ])
      expect(clockCalls()).toBe(0)
      return result
    })
  })
})

describe.each(['visited', 'ac'] as const)('%s truthy cutoff contract', (query) => {
  it.each([undefined, 0, -0, NaN])(
    'keeps falsy %s all-time, never invoking cutoff or clock',
    (days) => {
      compare(({ db, reads, trace, failClock, clockCalls }) => {
        seedMixed(db)
        failClock(new Error('all-time must not read clock'))
        const tracking = track(db, trace)
        let result
        try {
          result = reads[query](days)
        } finally {
          tracking.restore()
        }
        expect(result.map((row) => row.local_day)).toEqual(DAYS)
        expect(trace).toEqual(['getDb', `prepare:${query}`, `all:${query}:[]`])
        expect(clockCalls()).toBe(0)
        return result
      })
    },
  )

  it.each([1, 2, 7, 30, -1, -2, 0.5, -0.5, Infinity, -Infinity, Number.MAX_SAFE_INTEGER])(
    'preserves truthy %s cutoff and prepare/clock/error order',
    (days) => {
      compare(({ db, reads, trace, clockCalls }) => {
        seedMixed(db)
        const tracking = track(db, trace)
        let result
        try {
          result = outcome(() => reads[query](days))
        } finally {
          tracking.restore()
        }
        expect(trace.slice(0, 3)).toEqual(['getDb', `prepare:${query}`, 'clock'])
        expect(clockCalls()).toBe(1)
        if (days === 1)
          expect(result.value).toEqual(
            ['2026-11-19', '2026-11-20', '2026-11-21', 'zzz'].map((day, index) => ({
              local_day: day,
              count: (index + 4) * 10 + (query === 'visited' ? 3 : 4),
            })),
          )
        if (days === -1)
          expect(result.value).toEqual([
            { local_day: '2026-11-21', count: query === 'visited' ? 63 : 64 },
            { local_day: 'zzz', count: query === 'visited' ? 73 : 74 },
          ])
        if (days === -2)
          expect(result.value).toEqual([{ local_day: 'zzz', count: query === 'visited' ? 73 : 74 }])
        if (!Number.isFinite(days) || !Number.isInteger(days)) {
          expect(result.error).toEqual({
            name: 'TypeError',
            message: 'Day shift must be an integer',
          })
          expect(trace).toHaveLength(3)
        }
        return result
      })
    },
  )

  it('captures a new local day each call across midnight without caching the cutoff', () => {
    compare(({ db, reads, trace, setClock }) => {
      seedMixed(db)
      const tracking = track(db, trace)
      const results = []
      try {
        setClock(new Date(2026, 10, 19, 23, 59, 59, 999).getTime())
        results.push(reads[query](1))
        setClock(new Date(2026, 10, 20, 0, 0, 0, 0).getTime())
        results.push(reads[query](1))
      } finally {
        tracking.restore()
      }
      expect(trace.filter((entry) => entry.startsWith('all:'))).toEqual([
        `all:${query}:["2026-11-18"]`,
        `all:${query}:["2026-11-19"]`,
      ])
      return results
    })
  })

  it.each([
    ['2024-03-01T00:30:00', '2024-02-29'],
    ['2026-01-01T00:30:00', '2025-12-31'],
    ['2026-03-09T00:30:00', '2026-03-08'],
    ['2026-11-02T00:30:00', '2026-11-01'],
  ])(
    'keeps host-local calendar cutoff at %s rather than subtracting a 24h instant',
    (clock, cutoff) => {
      compare(({ db, reads, trace, setClock }) => {
        seed(db, null, 10)
        seed(db, cutoff, 20)
        seed(db, clock.slice(0, 10), 30)
        seed(db, 'zzz', 40)
        setClock(new Date(clock).getTime())
        const tracking = track(db, trace)
        let result
        try {
          result = reads[query](1)
        } finally {
          tracking.restore()
        }
        expect(result.map((row) => row.local_day)).toEqual([cutoff, clock.slice(0, 10), 'zzz'])
        expect(trace).toEqual(['getDb', `prepare:${query}`, 'clock', `all:${query}:["${cutoff}"]`])
        return result
      })
    },
  )

  it('lets a native preparation failure win over a fractional shift and throwing clock', () => {
    compare(({ db, reads, trace, failClock, clockCalls }) => {
      db.exec('DROP TABLE user_daily_stats')
      failClock(new Error('clock must not execute'))
      const tracking = track(db, trace)
      let caught: unknown
      try {
        reads[query](1.5)
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      expect(caught).toBe(tracking.error())
      const result = outcome(() => {
        throw caught
      })
      expect(result.error).toEqual({
        name: 'SqliteError',
        message: 'no such table: user_daily_stats',
        code: 'SQLITE_ERROR',
      })
      expect(clockCalls()).toBe(0)
      expect(trace).toEqual(['getDb', `prepare:${query}`])
      return result
    })
  })

  it('propagates the same clock exception after preparation and before executing SELECT', () => {
    compare(({ db, reads, trace, failClock, clockCalls }) => {
      seedMixed(db)
      const failure = new Error('clock sentinel')
      failClock(failure)
      const tracking = track(db, trace)
      let caught: unknown
      try {
        reads[query](1)
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      expect(caught).toBe(failure)
      expect(clockCalls()).toBe(1)
      expect(trace).toEqual(['getDb', `prepare:${query}`, 'clock'])
    })
  })

  it.each([NaN, 1.75, 8640000000000001])(
    'keeps invalid captured instant %s errors after prepare',
    (instant) => {
      compare(({ db, reads, trace, setClock }) => {
        setClock(instant)
        const tracking = track(db, trace)
        let result
        try {
          result = outcome(() => reads[query](1))
        } finally {
          tracking.restore()
        }
        expect(result.error).toEqual(
          instant === 8640000000000001
            ? { name: 'RangeError', message: 'Timestamp is outside the Date range' }
            : { name: 'TypeError', message: 'Timestamp must be integer milliseconds' },
        )
        expect(trace).toEqual(['getDb', `prepare:${query}`, 'clock'])
        return result
      })
    },
  )
})

describe('daily read error/lifecycle ownership', () => {
  it.each(['daily', 'visited', 'ac', 'submissions'] as const)(
    'keeps exact %s prepare/step sentinel identity',
    (query) => {
      for (const stage of ['prepare', 'all'] as const)
        compare(({ db, reads, trace, clockCalls }) => {
          seedMixed(db)
          const failure = new Error('query sentinel')
          const tracking = track(db, trace, stage, failure)
          let caught: unknown
          try {
            reads[query](1)
          } catch (error) {
            caught = error
          } finally {
            tracking.restore()
          }
          expect(caught).toBe(failure)
          const hasClock = query === 'visited' || query === 'ac'
          expect(clockCalls()).toBe(stage === 'all' && hasClock ? 1 : 0)
          expect(trace.slice(0, 2)).toEqual(['getDb', `prepare:${query}`])
        })
    },
  )

  it.each(['daily', 'visited', 'ac', 'submissions'] as const)(
    'keeps damaged %s column failure native before the clock, allowing qualified wording',
    (query) => {
      compare(({ db, reads, trace, original, failClock, clockCalls }) => {
        const column =
          query === 'daily'
            ? 'active_seconds'
            : query === 'visited'
              ? 'visited_problem_count'
              : query === 'ac'
                ? 'solved_problem_count'
                : 'submission_count'
        db.exec(`ALTER TABLE user_daily_stats RENAME COLUMN ${column} TO damaged_column`)
        failClock(new Error('not reached'))
        const tracking = track(db, trace)
        let caught: unknown
        try {
          reads[query](1.25)
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        expect(caught).toBe(tracking.error())
        assert.ok(caught instanceof Error)
        assert.ok('code' in caught)
        expect(caught.name).toBe('SqliteError')
        expect(caught.code).toBe('SQLITE_ERROR')
        expect(caught.message).toContain(column)
        expect(caught.message).toMatch(/^no such column:/)
        if (original) expect(caught.message).toBe(`no such column: ${column}`)
        expect(trace).toEqual(['getDb', `prepare:${query}`])
        expect(clockCalls()).toBe(0)
        return { name: caught.name, code: caught.code }
      })
    },
  )

  it('reads all raw rows under query_only with no writes, repair, ledger/event or transaction changes', () => {
    compare(({ db, reads }) => {
      seedMixed(db)
      db.pragma('query_only = ON')
      return [reads.daily(-1), reads.visited(), reads.ac(1), reads.submissions(-1)]
    })
  })

  it('preserves facts and nullable rows on a real read-only file', () => {
    compare(({ reads }) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-stats-daily-'))
      directories.push(directory)
      closeDb()
      const file = path.join(directory, 'read.sqlite')
      const writable = initDbAtPath(file)
      seedMixed(writable)
      closeDb()
      const readonly = new Database(file, { readonly: true })
      const get = vi.spyOn(connection, 'getDb').mockReturnValue(readonly)
      const before = snapshot(readonly)
      try {
        const result = [reads.daily(-1), reads.visited(), reads.ac(1), reads.submissions(-1)]
        expect(snapshot(readonly)).toEqual(before)
        return result
      } finally {
        get.mockRestore()
        readonly.close()
        initDbAtPath(':memory:')
      }
    })
  })

  it('observes uncommitted rows and caller savepoints without owning the transaction', () => {
    compare(({ db, reads }) => {
      const observed: unknown[] = []
      const result = outcome(() =>
        db.transaction(() => {
          seed(db, null, 10)
          seed(db, '2026-11-20', 20)
          observed.push(reads.daily(-1), reads.visited(), reads.ac(1), reads.submissions(-1))
          expect(db.inTransaction).toBe(true)
          const nested = outcome(() =>
            db.transaction(() => {
              seed(db, null, 30)
              observed.push(reads.visited())
              expect(reads.ac()).toHaveLength(3)
              throw new Error('nested rollback')
            })(),
          )
          expect(nested.error?.message).toBe('nested rollback')
          expect(reads.visited()).toHaveLength(2)
          throw new Error('outer rollback')
        })(),
      )
      expect(result.error?.message).toBe('outer rollback')
      expect(db.inTransaction).toBe(false)
      expect([reads.daily(), reads.visited(), reads.ac(), reads.submissions()]).toEqual([
        [],
        [],
        [],
        [],
      ])
      return { observed, result }
    })
  })

  it('acquires current connection before a cutoff clock and follows close/reinit', () => {
    compare(({ db, reads, trace, clockCalls }) => {
      seedMixed(db)
      const previous = [reads.daily(-1), reads.visited(), reads.ac(), reads.submissions(-1)]
      closeDb()
      const calls = clockCalls()
      const failures = [
        outcome(() => reads.daily()),
        outcome(() => reads.visited(1.25)),
        outcome(() => reads.ac(Infinity)),
        outcome(() => reads.submissions()),
      ]
      for (const failure of failures)
        expect(failure.error?.message).toBe('Database not initialized. Call initDb() first.')
      expect(clockCalls()).toBe(calls)
      const next = initDbAtPath(':memory:')
      seed(next, '2026-11-21', 100)
      seed(next, null, 200)
      trace.length = 0
      const current = [reads.daily(-1), reads.visited(), reads.ac(), reads.submissions(-1)]
      expect(current.every((rows) => rows.length === 2)).toBe(true)
      return { previous, failures, current }
    })
  })
})
