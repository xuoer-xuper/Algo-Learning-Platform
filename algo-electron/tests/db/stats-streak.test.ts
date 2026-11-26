import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import * as connection from '../../electron/db/connection'
import { getStreakDays } from '../../electron/db/repositories/statsRepository'
import { dayDiff } from '../../electron/db/repositories/stats/date'
import { subscribeDataChanges } from '../../electron/shared/dataEvents'
import type { DataChangedPayload } from '../../src/shared/types/data'
import { localDayBounds } from '../../src/shared/time'
import { getOriginalStreakDays, invokeOriginalDayDiff } from './stats-streak-oracle'

const NOW = new Date(2026, 10, 20, 0, 30, 0, 123).getTime()
const TODAY = '2026-11-20'
const YESTERDAY = '2026-11-19'
const nativeGetDb = getDb
const directories: string[] = []
type Metrics = Partial<{
  active: number
  duration: number
  visited: number
  solved: number
  submissions: number
  ac: number
  deletedAt: number | null
}>
type Scenario = {
  db: Database.Database
  read: typeof getStreakDays
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
      path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-streak-`),
    )
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function seed(db: Database.Database, day: string | null, metrics: Metrics = { active: 300 }) {
  const { active = 0, duration = 0, visited = 0, solved = 0, submissions = 0, ac = 0 } = metrics
  db.prepare(
    `INSERT INTO user_daily_stats
    (local_day,active_seconds,duration_seconds,visited_problem_count,solved_problem_count,
     submission_count,ac_submission_count,recomputed_at,created_at,updated_at,deleted_at)
    VALUES (?,?,?,?,?,?,?,1.75,0,2,?)`,
  ).run(day, active, duration, visited, solved, submissions, ac, metrics.deletedAt ?? null)
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
    function read() {
      let current: Database.Database | undefined
      try {
        current = nativeGetDb()
      } catch {
        /* Uninitialized reads are also compared. */
      }
      const before = current?.open ? snapshot(current) : undefined
      try {
        return original ? getOriginalStreakDays(getDb()) : getStreakDays()
      } finally {
        if (before && current) expect(snapshot(current)).toEqual(before)
        expect(events).toEqual([])
      }
    }
    try {
      const result = run({
        db,
        read,
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
      results.push({ result, trace, state: snapshot(nativeGetDb()), events })
    } finally {
      unsubscribe()
      clock.mockRestore()
      closeDb()
    }
  }
  expect(results[1]).toEqual(results[0])
}

function track(
  db: Database.Database,
  trace: string[],
  stage?: 'getDb' | 'prepare' | 'all',
  sentinel = new Error('streak query sentinel'),
) {
  const get = vi.spyOn(connection, 'getDb').mockImplementation(() => {
    trace.push('getDb')
    if (stage === 'getDb') throw sentinel
    return nativeGetDb()
  })
  const nativePrepare = db.prepare.bind(db)
  const restores: (() => void)[] = []
  let nativeError: unknown
  const prepare = vi.spyOn(db, 'prepare').mockImplementation((query) => {
    if (!/from ["`]?user_daily_stats/i.test(query) || !/order by .*local_day/i.test(query))
      return nativePrepare(query)
    trace.push('prepare')
    if (stage === 'prepare') throw sentinel
    try {
      const statement = nativePrepare(query)
      const nativeAll = statement.all.bind(statement)
      const all = vi.spyOn(statement, 'all').mockImplementation((...bindings: unknown[]) => {
        trace.push(`all:${JSON.stringify(bindings)}`)
        if (stage === 'all') throw sentinel
        return nativeAll(...bindings)
      })
      restores.push(() => all.mockRestore())
      return statement
    } catch (error) {
      nativeError = error
      throw error
    }
  })
  const nativeParse = Date.parse
  const parse = vi.spyOn(Date, 'parse').mockImplementation((value) => {
    trace.push(`parse:${value}`)
    return nativeParse(value)
  })
  return {
    error: () => nativeError,
    restore: () => {
      get.mockRestore()
      prepare.mockRestore()
      parse.mockRestore()
      for (const restore of restores) restore()
    },
  }
}

describe('streak SQL and original algorithm parity', () => {
  it('keeps the empty shortcut before the clock', () => {
    compare(({ db, read, trace, failClock, clockCalls }) => {
      failClock(new Error('empty must not capture a clock'))
      const tracking = track(db, trace)
      try {
        expect(read()).toEqual({ current: 0, longest: 0 })
        expect(trace).toEqual(['getDb', 'prepare', 'all:[]'])
        expect(clockCalls()).toBe(0)
      } finally {
        tracking.restore()
      }
    })
  })

  it.each<{ name: string; metrics: Metrics; qualifies: boolean }>([
    { name: '299 seconds', metrics: { active: 299 }, qualifies: false },
    { name: '299.75 seconds', metrics: { active: 299.75 }, qualifies: false },
    { name: '300 seconds', metrics: { active: 300 }, qualifies: true },
    { name: '300.25 seconds', metrics: { active: 300.25 }, qualifies: true },
    { name: 'one submission', metrics: { submissions: 1 }, qualifies: true },
    { name: 'fractional submission', metrics: { submissions: 0.25 }, qualifies: true },
    { name: 'one solved', metrics: { solved: 1 }, qualifies: true },
    { name: 'fractional solved', metrics: { solved: 0.25 }, qualifies: true },
    { name: 'duration only', metrics: { duration: 10000 }, qualifies: false },
    { name: 'visits only', metrics: { visited: 10000 }, qualifies: false },
    { name: 'AC submissions only', metrics: { ac: 10000 }, qualifies: false },
    {
      name: 'negative metrics',
      metrics: { active: -300, submissions: -1, solved: -1 },
      qualifies: false,
    },
    { name: 'OR not AND', metrics: { active: -10, submissions: -1, solved: 1 }, qualifies: true },
    { name: 'epoch-zero tombstone', metrics: { active: 300, deletedAt: 0 }, qualifies: true },
  ])('preserves $name qualification', ({ metrics, qualifies }) => {
    compare(({ db, read, clockCalls }) => {
      seed(db, TODAY, metrics)
      const result = read()
      expect(result).toEqual({ current: qualifies ? 1 : 0, longest: qualifies ? 1 : 0 })
      expect(clockCalls()).toBe(qualifies ? 1 : 0)
      expect(Object.keys(result)).toEqual(['current', 'longest'])
      expect(typeof result.current).toBe('number')
      expect(typeof result.longest).toBe('number')
      return result
    })
  })

  it.each<{ name: string; days: string[]; current: number; longest: number }>([
    { name: 'yesterday has no grace period', days: [YESTERDAY], current: 0, longest: 1 },
    { name: 'today and yesterday', days: [YESTERDAY, TODAY], current: 2, longest: 2 },
    {
      name: 'future prevents today anchoring',
      days: [TODAY, '2026-11-21'],
      current: 0,
      longest: 2,
    },
    {
      name: 'gap separates current and longest',
      days: [TODAY, '2026-11-18', '2026-11-17', '2026-11-16'],
      current: 1,
      longest: 3,
    },
    {
      name: 'gap closes earlier longest',
      days: [TODAY, YESTERDAY, '2026-11-18', '2026-11-10'],
      current: 3,
      longest: 3,
    },
    {
      name: 'old longest still counts',
      days: ['2026-11-17', '2026-11-16', '2026-11-15'],
      current: 0,
      longest: 3,
    },
  ])('$name', ({ days, current, longest }) => {
    compare(({ db, read, clockCalls }) => {
      for (const day of days) seed(db, day)
      db.pragma('reverse_unordered_selects = ON')
      const result = read()
      expect(result).toEqual({ current, longest })
      expect(clockCalls()).toBe(1)
      return result
    })
  })

  it('runs the full longest pass before one clock and then the current pass', () => {
    compare(({ db, read, trace }) => {
      seed(db, YESTERDAY)
      seed(db, TODAY)
      const tracking = track(db, trace)
      try {
        const result = read()
        expect(result).toEqual({ current: 2, longest: 2 })
        const pair = [`parse:${TODAY}T00:00:00Z`, `parse:${YESTERDAY}T00:00:00Z`]
        expect(trace).toEqual(['getDb', 'prepare', 'all:[]', ...pair, 'clock', ...pair])
        return result
      } finally {
        tracking.restore()
      }
    })
  })

  it('does not cap older rows or stop longest traversal at the first gap', () => {
    compare(({ db, read }) => {
      seed(db, TODAY)
      for (let day = 1; day <= 31; day++) seed(db, `2026-10-${String(day).padStart(2, '0')}`)
      seed(db, '2026-09-30')
      const result = read()
      expect(result).toEqual({ current: 1, longest: 32 })
      return result
    })
  })

  it.each([null, '', 'zzz', '2026-02-30', '9999-12-31'])(
    'does not prevalidate singleton %s',
    (day) => {
      compare(({ db, read, trace, clockCalls }) => {
        seed(db, day)
        const tracking = track(db, trace)
        try {
          expect(read()).toEqual({ current: 0, longest: 1 })
          expect(clockCalls()).toBe(1)
          expect(trace).toEqual(['getDb', 'prepare', 'all:[]', 'clock'])
        } finally {
          tracking.restore()
        }
      })
    },
  )

  it.each<Array<string | null>>([
    [null, null],
    [TODAY, null],
    [TODAY, ''],
    [TODAY, 'zzz'],
    [TODAY, '2026-02-30'],
    ['9999-12-31', null],
    [TODAY, YESTERDAY, '2026-11-10', 'bad'],
  ])('preserves paired invalid days and error-before-clock: %j', (...days) => {
    compare(({ db, read, failClock, clockCalls }) => {
      for (const day of days) seed(db, day)
      failClock(new Error('longest validation must win'))
      const result = outcome(read)
      expect(result.error).toEqual(
        days.includes('9999-12-31')
          ? { name: 'RangeError', message: 'Local day is outside the supported calendar range' }
          : { name: 'TypeError', message: 'Invalid local day' },
      )
      expect(clockCalls()).toBe(0)
      return result
    })
  })

  it.each([null, 'bad', TODAY])('preserves clock exception identity for singleton %s', (day) => {
    compare(({ db, read, failClock, clockCalls }) => {
      seed(db, day)
      const error = new Error('clock sentinel')
      failClock(error)
      let caught: unknown
      try {
        read()
      } catch (failure) {
        caught = failure
      }
      expect(caught).toBe(error)
      expect(clockCalls()).toBe(1)
    })
  })

  it.each([NaN, Infinity, -Infinity, 1.25, 8640000000000001])(
    'preserves invalid clock %s',
    (instant) => {
      compare(({ db, read, setClock, clockCalls }) => {
        seed(db, null)
        setClock(instant)
        const result = outcome(read)
        expect(result.error).toEqual(
          instant === 8640000000000001
            ? { name: 'RangeError', message: 'Timestamp is outside the Date range' }
            : { name: 'TypeError', message: 'Timestamp must be integer milliseconds' },
        )
        expect(clockCalls()).toBe(1)
        return result
      })
    },
  )

  it('captures a fresh day each call across local midnight', () => {
    compare(({ db, read, setClock, clockCalls }) => {
      seed(db, YESTERDAY)
      seed(db, TODAY)
      setClock(new Date(2026, 10, 19, 23, 59, 59, 999).getTime())
      const before = read()
      setClock(new Date(2026, 10, 20, 0, 0, 0).getTime())
      const after = read()
      expect([before, after]).toEqual([
        { current: 0, longest: 2 },
        { current: 2, longest: 2 },
      ])
      expect(clockCalls()).toBe(2)
      return { before, after }
    })
  })
})

describe('ordered dayDiff validation and host calendar', () => {
  it.each([
    ['2026-03-09', '2026-03-08', 1],
    ['2026-11-02', '2026-11-01', 1],
    ['2024-03-01', '2024-02-29', 1],
    ['2024-02-29', '2024-02-28', 1],
    ['2026-01-01', '2025-12-31', 1],
    ['0001-01-01', '0000-12-31', 1],
    [TODAY, TODAY, 0],
    [YESTERDAY, TODAY, -1],
    [TODAY, '2026-11-10', 10],
  ] as const)('retains UTC-calendar ordinal %s minus %s', (later, earlier, expected) => {
    expect(dayDiff(later, earlier)).toBe(expected)
    expect(dayDiff(later, earlier)).toBe(invokeOriginalDayDiff(later, earlier))
  })

  it.each([
    [null, null],
    [null, '9999-12-31'],
    ['9999-12-31', null],
    ['9999-12-31', 'bad'],
    ['bad', '9999-12-31'],
    [TODAY, null],
    [TODAY, '9999-12-31'],
    ['', TODAY],
    ['2026-02-30', TODAY],
  ] as const)('validates later %s before earlier %s', (later, earlier) => {
    const expected = outcome(() => invokeOriginalDayDiff(later, earlier))
    expect(expected.error).toEqual(
      later === '9999-12-31' || (later === TODAY && earlier === '9999-12-31')
        ? { name: 'RangeError', message: 'Local day is outside the supported calendar range' }
        : { name: 'TypeError', message: 'Invalid local day' },
    )
    expect(outcome(() => dayDiff(later, earlier))).toEqual(expected)
  })

  it.each([
    ['2026-03-09', '2026-03-08'],
    ['2026-11-02', '2026-11-01'],
    ['2024-03-01', '2024-02-29'],
    ['2026-01-01', '2025-12-31'],
  ])('keeps the full streak across %s and %s', (later, earlier) => {
    compare(({ db, read, setClock }) => {
      seed(db, later)
      seed(db, earlier)
      setClock(new Date(`${later}T00:30:00`).getTime())
      expect(read()).toEqual({ current: 2, longest: 2 })
      if (process.env.TZ === 'America/New_York' && earlier === '2026-03-08') {
        const bounds = localDayBounds(earlier)
        expect(bounds.end - bounds.start).toBe(23 * 3600000)
      }
      if (process.env.TZ === 'America/New_York' && earlier === '2026-11-01') {
        const bounds = localDayBounds(earlier)
        expect(bounds.end - bounds.start).toBe(25 * 3600000)
      }
    })
  })

  it.each([
    ['2011-12-31', '2011-12-30'],
    ['2011-12-31', '2011-12-29'],
  ])('retains skipped-civil-day validation for %s and %s', (later, earlier) => {
    const isApia = process.env.TZ === 'Pacific/Apia'
    const expected = outcome(() => invokeOriginalDayDiff(later, earlier))
    expect(outcome(() => dayDiff(later, earlier))).toEqual(expected)
    if (isApia)
      expect(expected.error).toEqual({
        name: 'RangeError',
        message: 'Local calendar day does not exist',
      })
    else expect(expected.value).toBe(earlier.endsWith('30') ? 1 : 2)
    compare(({ db, read, setClock, clockCalls }) => {
      seed(db, later)
      seed(db, earlier)
      setClock(new Date(`${later}T00:30:00`).getTime())
      const result = outcome(read)
      if (isApia) expect(result.error).toEqual(expected.error)
      else
        expect(result.value).toEqual({
          current: earlier.endsWith('30') ? 2 : 1,
          longest: earlier.endsWith('30') ? 2 : 1,
        })
      expect(clockCalls()).toBe(isApia ? 0 : 1)
      return result
    })
  })
})

describe('streak read-only lifecycle and failure ownership', () => {
  it.each(['getDb', 'prepare', 'all'] as const)(
    'keeps %s failure identity before the clock',
    (stage) => {
      compare(({ db, read, trace, failClock, clockCalls }) => {
        seed(db, TODAY)
        failClock(new Error('clock must not win'))
        const sentinel = new Error('query sentinel')
        const tracking = track(db, trace, stage, sentinel)
        let caught: unknown
        try {
          read()
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        expect(caught).toBe(sentinel)
        expect(trace).toEqual(
          ['getDb', 'prepare', 'all:[]'].slice(
            0,
            stage === 'getDb' ? 1 : stage === 'prepare' ? 2 : 3,
          ),
        )
        expect(clockCalls()).toBe(0)
      })
    },
  )

  it.each(['active_seconds', 'submission_count', 'solved_problem_count'])(
    'preserves native damaged %s prepare failure',
    (column) => {
      compare(({ db, read, trace, original, failClock, clockCalls }) => {
        db.exec(`ALTER TABLE user_daily_stats RENAME COLUMN ${column} TO damaged_column`)
        failClock(new Error('clock must not win'))
        const tracking = track(db, trace)
        let caught: unknown
        try {
          read()
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        expect(caught).toBe(tracking.error())
        assert.ok(caught instanceof Error && 'code' in caught)
        expect(caught.name).toBe('SqliteError')
        expect(caught.code).toBe('SQLITE_ERROR')
        expect(caught.message).toMatch(/^no such column:/)
        expect(caught.message).toContain(column)
        if (original) expect(caught.message).toBe(`no such column: ${column}`)
        expect(trace).toEqual(['getDb', 'prepare'])
        expect(clockCalls()).toBe(0)
        return { name: caught.name, code: caught.code }
      })
    },
  )

  it('preserves schema, complete ledger, rows, total_changes and transaction state under query_only', () => {
    compare(({ db, read }) => {
      seed(db, TODAY, { active: 300, deletedAt: 0 })
      seed(db, YESTERDAY, { solved: 1 })
      seed(db, null, { ac: 1 })
      db.pragma('query_only = ON')
      expect(read()).toEqual({ current: 2, longest: 2 })
      return read()
    })
  })

  it('reads a real read-only file with no repair or ledger changes', () => {
    compare(({ read }) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-streak-'))
      directories.push(directory)
      closeDb()
      const file = path.join(directory, 'read.sqlite')
      const writable = initDbAtPath(file)
      seed(writable, TODAY, { active: 300, deletedAt: 0 })
      seed(writable, YESTERDAY)
      closeDb()
      const readonly = new Database(file, { readonly: true })
      const get = vi.spyOn(connection, 'getDb').mockReturnValue(readonly)
      const before = snapshot(readonly)
      try {
        const result = read()
        expect(result).toEqual({ current: 2, longest: 2 })
        expect(snapshot(readonly)).toEqual(before)
        return result
      } finally {
        get.mockRestore()
        readonly.close()
        initDbAtPath(':memory:')
      }
    })
  })

  it('observes caller-owned transactions/savepoints and rollback without emitting changes', () => {
    compare(({ db, read }) => {
      seed(db, TODAY)
      const observed: unknown[] = []
      expect(() =>
        db.transaction(() => {
          seed(db, YESTERDAY)
          observed.push(read())
          expect(db.inTransaction).toBe(true)
          expect(() =>
            db.transaction(() => {
              seed(db, '2026-11-18')
              observed.push(read())
              throw new Error('nested rollback')
            })(),
          ).toThrow('nested rollback')
          observed.push(read())
          throw new Error('outer rollback')
        })(),
      ).toThrow('outer rollback')
      observed.push(read())
      expect(db.inTransaction).toBe(false)
      expect(observed).toEqual([
        { current: 2, longest: 2 },
        { current: 3, longest: 3 },
        { current: 2, longest: 2 },
        { current: 1, longest: 1 },
      ])
      return observed
    })
  })

  it('uses the current handle after close and reinitialization', () => {
    compare(({ db, read, clockCalls }) => {
      seed(db, TODAY)
      expect(read()).toEqual({ current: 1, longest: 1 })
      closeDb()
      const calls = clockCalls()
      const closed = outcome(read)
      expect(closed.error).toEqual({
        name: 'Error',
        message: 'Database not initialized. Call initDb() first.',
      })
      expect(clockCalls()).toBe(calls)
      const next = initDbAtPath(':memory:')
      seed(next, null)
      next.pragma('query_only = ON')
      const result = read()
      expect(result).toEqual({ current: 0, longest: 1 })
      return { closed, result }
    })
  })
})
