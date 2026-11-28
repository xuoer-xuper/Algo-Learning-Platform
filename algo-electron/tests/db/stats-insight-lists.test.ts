import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import * as connection from '../../electron/db/connection'
import {
  getTimeline,
  getRevisitStats,
  getWrongProblems,
  getUnreviewedProblems,
} from '../../electron/db/repositories/statsRepository'
import { subscribeDataChanges } from '../../electron/shared/dataEvents'
import { localDayBounds, shiftLocalDay, toLocalDay } from '../../src/shared/time'
import type { DataChangedPayload } from '../../src/shared/types/data'
import {
  getOriginalTimeline,
  getOriginalRevisitStats,
  getOriginalWrongProblems,
  getOriginalUnreviewedProblems,
} from './stats-insight-lists-oracle'

const NOW = new Date(2026, 10, 20, 0, 30, 0, 123).getTime()
const nativeGetDb = getDb
const directories: string[] = []
type Reads = {
  timeline: typeof getTimeline
  revisit: typeof getRevisitStats
  wrong: typeof getWrongProblems
  unreviewed: typeof getUnreviewedProblems
}
const QUERIES = ['timeline', 'revisit', 'wrong', 'unreviewed'] as const
type Query = (typeof QUERIES)[number]
type Scenario = {
  db: Database.Database
  reads: Reads
  trace: string[]
  setClocks: (...values: number[]) => void
  failClock: (at: number, error: Error) => void
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
        .startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-insight-lists-`),
    )
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function problem(
  db: Database.Database,
  id: string | null,
  key = id ?? 'null',
  last: number | string | null = 0,
  status = 'unknown',
  deleted: number | null = null,
) {
  db.prepare(
    `INSERT INTO problems
    (id,platform,platform_problem_id,canonical_url,title,status,last_visited_at,first_seen_at,created_at,updated_at,deleted_at)
    VALUES (?,'test',?,?,NULL,?,?,0,1,2,?)`,
  ).run(id, key, `https://example.invalid/${key}`, status, last, deleted)
}
function visit(
  db: Database.Database,
  parent: string,
  id: string | null,
  time: number | string = 0,
  deleted: number | null = null,
) {
  db.prepare(
    `INSERT INTO problem_visits
    (id,problem_id,platform,url,entered_at,created_at,updated_at,deleted_at)
    VALUES (?,?,'test','https://example.invalid/visit',?,0,0,?)`,
  ).run(id, parent, time, deleted)
}
function submission(
  db: Database.Database,
  parent: string | null,
  id: string | null,
  key: string,
  verdict = 'WA',
  time: number | string = 0,
  deleted: number | null = null,
) {
  db.prepare(
    `INSERT INTO submissions
    (id,problem_id,platform,platform_submission_id,verdict,submitted_at,created_at,updated_at,deleted_at)
    VALUES (?,?,'test',?,?,?,0,0,?)`,
  ).run(id, parent, key, verdict, time, deleted)
}
function activity(
  db: Database.Database,
  id: string | null,
  time: number | string = 0,
  deleted: number | null = null,
) {
  db.prepare(
    `INSERT INTO activity_events
    (id,event_type,occurred_at,local_day,platform,url,problem_id,payload_json,created_at,deleted_at)
    VALUES (?,'visit_start',?,'raw-day','test','https://private.invalid/visit','raw-parent','private payload',0,?)`,
  ).run(id, time, deleted)
}
function seedAll(db: Database.Database, count = 3) {
  for (let i = 0; i < count; i++) {
    const id = `p${i}`
    problem(db, id, id, i)
    visit(db, id, `v${i}a`, i)
    visit(db, id, `v${i}b`, i + 0.75)
    submission(db, id, `s${i}`, `key${i}`, 'WA', i)
    activity(db, `e${i}`, i)
  }
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
    let clocks = [NOW],
      failAt = -1,
      calls = 0
    let failure: Error | undefined
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      trace.push('clock')
      calls++
      if (calls === failAt && failure) throw failure
      return clocks.length > 1 ? clocks.splice(0, 1)[0] : clocks[0]
    })
    function checked<T>(read: () => T): T {
      let current: Database.Database | undefined
      try {
        current = nativeGetDb()
      } catch {
        /* Closed-handle outcomes are also compared. */
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
      timeline: (limit) =>
        checked(() => (original ? getOriginalTimeline(getDb(), limit) : getTimeline(limit))),
      revisit: (limit) =>
        checked(() =>
          original ? getOriginalRevisitStats(getDb(), limit) : getRevisitStats(limit),
        ),
      wrong: (limit) =>
        checked(() =>
          original ? getOriginalWrongProblems(getDb(), limit) : getWrongProblems(limit),
        ),
      unreviewed: (days, limit) =>
        checked(() =>
          original
            ? getOriginalUnreviewedProblems(getDb(), days, limit)
            : getUnreviewedProblems(days, limit),
        ),
    }
    try {
      const result = run({
        db,
        reads,
        trace,
        setClocks: (...values) => {
          clocks = values
        },
        failClock: (at, error) => {
          failAt = at
          failure = error
        },
        clockCalls: () => calls,
      })
      results.push({ result, shape: shape(result), trace, state: snapshot(nativeGetDb()), events })
    } finally {
      unsubscribe()
      clock.mockRestore()
      closeDb()
    }
  }
  expect(results[1]).toEqual(results[0])
}
function readLimit(reads: Reads, query: Query, limit?: number) {
  return query === 'unreviewed' ? reads.unreviewed(undefined, limit) : reads[query](limit)
}
function bindingText(values: unknown[]) {
  return values
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
  stage?: 'getDb' | 'prepare' | 'all',
  sentinel = new Error('query sentinel'),
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
    if (!/order by/i.test(query) || !/limit/i.test(query)) return nativePrepare(query)
    trace.push('prepare')
    if (stage === 'prepare') throw sentinel
    try {
      const statement = nativePrepare(query)
      const nativeAll = statement.all.bind(statement)
      const all = vi.spyOn(statement, 'all').mockImplementation((...bindings: unknown[]) => {
        trace.push(`all:[${bindingText(bindings)}]`)
        if (stage === 'all') throw sentinel
        try {
          return nativeAll(...bindings)
        } catch (error) {
          nativeError = error
          throw error
        }
      })
      restores.push(() => all.mockRestore())
      return statement
    } catch (error) {
      nativeError = error
      throw error
    }
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

describe('independent insight list SQL parity', () => {
  it('returns four empty lists, only unreviewed captures its two clocks', () => {
    compare(({ reads, clockCalls }) => {
      expect([reads.timeline(), reads.revisit(), reads.wrong()]).toEqual([[], [], []])
      expect(clockCalls()).toBe(0)
      expect(reads.unreviewed()).toEqual([])
      expect(clockCalls()).toBe(2)
    })
  })
  it.each([false, true])(
    'retains nullable/empty timeline IDs, six keys, ties and tombstones; reverse=%s',
    (reverse) => {
      compare(({ db, reads, failClock }) => {
        for (const [index, id] of [null, null, '', '0', "quote'%_", '\u9898\u76ee'].entries())
          activity(db, id, index === 5 ? 4 : index, 0)
        db.pragma(`reverse_unordered_selects = ${reverse ? 'ON' : 'OFF'}`)
        failClock(1, new Error('timeline cannot capture time'))
        const rows = reads.timeline(-1)
        expect(rows).toHaveLength(6)
        expect(rows.filter((row) => row.id === null)).toHaveLength(2)
        for (const row of rows) {
          expect(Object.keys(row)).toEqual([
            'id',
            'event_type',
            'occurred_at',
            'platform',
            'url',
            'problem_id',
          ])
          expect(row.event_type).toBe('visit_start')
          expect(row.url).toBe('https://private.invalid/visit')
          expect(row.problem_id).toBe('raw-parent')
        }
        return rows
      })
    },
  )
  it.each([0, -1, 1.75, -0.5, 8640000000000001, Number.MAX_SAFE_INTEGER + 1, 'raw-time'])(
    'preserves raw timeline and child MAX scalar %s',
    (instant) => {
      compare(({ db, reads }) => {
        activity(db, null, instant, 0)
        problem(db, 'p')
        visit(db, 'p', 'a', instant, 0)
        visit(db, 'p', 'b', instant)
        submission(db, 'p', null, 'raw', 'WA', instant, 0)
        const result = [reads.timeline(), reads.revisit(), reads.wrong()]
        expect(reads.timeline()[0]?.occurred_at).toBe(instant)
        expect(reads.revisit()[0]?.last_visit).toBe(instant)
        expect(reads.wrong()[0]?.last_attempt).toBe(instant)
        return result
      })
    },
  )
  it.each([false, true])(
    'counts identified visits only while anonymous tombstones supply MAX; reverse=%s',
    (reverse) => {
      compare(({ db, reads }) => {
        for (const id of ['', 'two', 'one', 'deleted', "quote'%_", '\u9898\u76ee'])
          problem(db, id, id, 0, 'solved', id === 'deleted' ? 0 : null)
        problem(db, null, 'null-parent')
        for (const id of ['', 'two', 'deleted', "quote'%_", '\u9898\u76ee']) {
          visit(db, id, `${id}a`, 1, 0)
          visit(db, id, `${id}b`, 2)
          visit(db, id, null, 9.75, 0)
        }
        visit(db, 'one', 'only', 1)
        visit(db, 'one', null, 100)
        db.pragma('foreign_keys = OFF')
        visit(db, 'orphan', 'orphan-a')
        visit(db, 'orphan', 'orphan-b')
        db.pragma('foreign_keys = ON')
        db.pragma(`reverse_unordered_selects = ${reverse ? 'ON' : 'OFF'}`)
        const rows = reads.revisit(-1)
        expect(rows.map((row) => row.problem_id).sort()).toEqual(
          ['', 'two', "quote'%_", '\u9898\u76ee'].sort(),
        )
        for (const row of rows) {
          expect(Object.keys(row)).toEqual([
            'problem_id',
            'platform',
            'platform_problem_id',
            'title',
            'canonical_url',
            'visit_count',
            'last_visit',
          ])
          expect(row.visit_count).toBe(2)
          expect(row.last_visit).toBe(9.75)
          expect(typeof row.problem_id).toBe('string')
        }
        return rows
      })
    },
  )
  it.each([false, true])(
    'keeps nonexact verdicts, zero-ID counts, anti-AC tombstones and parent status; reverse=%s',
    (reverse) => {
      compare(({ db, reads }) => {
        for (const id of ['', 'nonexact', 'anonymous', 'accepted', 'deleted'])
          problem(db, id, id, 0, 'visited', id === 'deleted' ? 0 : null)
        problem(db, null, 'null-parent')
        submission(db, null, 'null-fk', 'null-fk', 'WA', 100)
        for (const [index, verdict] of ['WA', 'TESTING', 'UNKNOWN', 'ac', 'AC ', ''].entries())
          submission(db, 'nonexact', `s${index}`, `key${index}`, verdict, index, 0)
        submission(db, 'nonexact', null, 'latest-null', 'WA', 50.75, 0)
        submission(db, 'anonymous', null, 'only-null', 'WA', 40.25)
        submission(db, 'accepted', 'wa', 'wa', 'WA', 100)
        submission(db, 'accepted', null, 'ac', 'AC', 0, 0)
        submission(db, 'deleted', 'deleted-wa', 'deleted-wa')
        submission(db, '', '', 'empty', 'UNKNOWN', 30)
        db.pragma('foreign_keys = OFF')
        submission(db, 'orphan', 'orphan', 'orphan')
        db.pragma('foreign_keys = ON')
        db.pragma(`reverse_unordered_selects = ${reverse ? 'ON' : 'OFF'}`)
        const rows = reads.wrong(-1)
        expect(rows.map((row) => [row.id, row.wrong_count, row.last_attempt])).toEqual([
          ['nonexact', 6, 50.75],
          ['anonymous', 0, 40.25],
          ['', 1, 30],
        ])
        for (const row of rows)
          expect(Object.keys(row)).toEqual([
            'id',
            'platform',
            'platform_problem_id',
            'title',
            'canonical_url',
            'wrong_count',
            'last_attempt',
          ])
        return rows
      })
    },
  )
  it('preserves multiple NULL unreviewed IDs, strict cutoff, status exclusion and raw fractions', () => {
    compare(({ db, reads }) => {
      const cutoff = localDayBounds(shiftLocalDay(toLocalDay(NOW), -30)).start
      problem(db, null, 'null-a', cutoff - 1, 'solved')
      problem(db, null, 'null-b', cutoff - 2, 'attempted')
      problem(db, '', 'empty', cutoff - 3.25, 'custom-status')
      problem(db, 'boundary', 'boundary', cutoff)
      problem(db, 'future', 'future', cutoff + 1)
      problem(db, 'missing-time', 'missing-time', null)
      problem(db, 'visited', 'visited', 0, 'visited')
      problem(db, 'deleted', 'deleted', 0, 'solved', 0)
      const rows = reads.unreviewed()
      expect(rows.map((row) => row.platform_problem_id)).toEqual(['empty', 'null-b', 'null-a'])
      expect(rows.map((row) => row.id)).toEqual(['', null, null])
      expect(rows[0]?.last_visited_at).toBe(cutoff - 3.25)
      for (const row of rows)
        expect(Object.keys(row)).toEqual([
          'id',
          'platform',
          'platform_problem_id',
          'title',
          'canonical_url',
          'last_visited_at',
          'days_since',
        ])
      return rows
    })
  })
  it('keeps default50 as a row limit for all four lists with no extra cap', () => {
    compare(({ db, reads }) => {
      seedAll(db, 55)
      const results = QUERIES.map((query) => ({
        limited: readLimit(reads, query),
        all: readLimit(reads, query, -1),
      }))
      for (const result of results) {
        expect(result.limited).toHaveLength(50)
        expect(result.all).toHaveLength(55)
      }
      return results
    })
  })
})

describe.each(QUERIES)('%s native LIMIT and read ownership', (query) => {
  it.each([
    undefined,
    0,
    -0,
    1,
    2,
    -1,
    -5,
    1.25,
    -1.25,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
  ])('forwards LIMIT %s without changing native behavior or binding count', (limit) => {
    compare(({ db, reads, trace, clockCalls }) => {
      seedAll(db)
      const tracking = track(db, trace)
      let result
      try {
        result = outcome(() => readLimit(reads, query, limit))
      } finally {
        tracking.restore()
      }
      const effective = limit === undefined ? 50 : limit
      const cutoff = localDayBounds(shiftLocalDay(toLocalDay(NOW), -30)).start
      const bindings = query === 'unreviewed' ? [NOW, cutoff, effective] : [effective]
      expect(trace).toEqual([
        'getDb',
        'prepare',
        ...(query === 'unreviewed' ? ['clock', 'clock'] : []),
        `all:[${bindingText(bindings)}]`,
      ])
      expect(clockCalls()).toBe(query === 'unreviewed' ? 2 : 0)
      if (effective === 0) expect(result.value).toEqual([])
      else if (effective === 1 || effective === 2) expect(result.value).toHaveLength(effective)
      else if (Number.isFinite(effective) && Number.isInteger(effective))
        expect(result.value).toHaveLength(3)
      else
        expect(result.error).toEqual({
          name: 'SqliteError',
          message: 'datatype mismatch',
          code: 'SQLITE_MISMATCH',
        })
      return result
    })
  })
  it.each(['getDb', 'prepare', 'all'] as const)(
    'preserves %s sentinel identity and clock/error ordering',
    (stage) => {
      compare(({ db, reads, trace, clockCalls }) => {
        seedAll(db)
        const sentinel = new Error('query sentinel'),
          tracking = track(db, trace, stage, sentinel)
        let caught: unknown
        try {
          readLimit(reads, query)
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        expect(caught).toBe(sentinel)
        expect(clockCalls()).toBe(stage === 'all' && query === 'unreviewed' ? 2 : 0)
        expect(trace[0]).toBe('getDb')
        if (stage !== 'getDb') expect(trace[1]).toBe('prepare')
      })
    },
  )
  it('keeps a missing-table prepare error before invalid days or clocks', () => {
    compare(({ db, reads, trace, failClock, clockCalls }) => {
      db.pragma('foreign_keys = OFF')
      db.exec(`DROP TABLE ${query === 'timeline' ? 'activity_events' : 'problems'}`)
      failClock(1, new Error('not reached'))
      const tracking = track(db, trace)
      let caught: unknown
      try {
        query === 'unreviewed' ? reads.unreviewed(1.25) : reads[query]()
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      expect(caught).toBe(tracking.error())
      assert.ok(caught instanceof Error && 'code' in caught)
      expect(caught.code).toBe('SQLITE_ERROR')
      expect(caught.message).toMatch(/^no such table:/)
      expect(trace).toEqual(['getDb', 'prepare'])
      expect(clockCalls()).toBe(0)
      return { name: caught.name, code: caught.code }
    })
  })
})

describe('unreviewed prepare, two-clock and calendar contract', () => {
  it.each([
    undefined,
    0,
    -0,
    1,
    30,
    -1,
    -2,
    0.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER,
  ])('preserves days %s validation after preparing and both clocks', (days) => {
    compare(({ db, reads, trace, clockCalls }) => {
      seedAll(db)
      const tracking = track(db, trace)
      let result
      try {
        result = outcome(() => reads.unreviewed(days))
      } finally {
        tracking.restore()
      }
      expect(trace.slice(0, 4)).toEqual(['getDb', 'prepare', 'clock', 'clock'])
      expect(clockCalls()).toBe(2)
      if (days !== undefined && !Number.isSafeInteger(days)) {
        expect(result.error).toEqual({ name: 'TypeError', message: 'Day shift must be an integer' })
        expect(trace).toHaveLength(4)
      } else if (days === Number.MAX_SAFE_INTEGER) {
        expect(result.error).toEqual({
          name: 'RangeError',
          message: 'Local day is outside the supported calendar range',
        })
        expect(trace).toHaveLength(4)
      } else expect(result.value).toHaveLength(3)
      return result
    })
  })
  it('uses first clock for elapsed days and second clock for midnight cutoff', () => {
    compare(({ db, reads, trace, setClocks }) => {
      const first = new Date(2026, 10, 20, 23, 59, 59, 999).getTime(),
        second = new Date(2026, 10, 21, 0, 0).getTime(),
        cutoff = new Date(2026, 10, 20, 0, 0).getTime()
      problem(db, 'included', 'included', new Date(2026, 10, 19, 0, 0).getTime())
      problem(db, 'equal', 'equal', cutoff)
      setClocks(first, second)
      const tracking = track(db, trace)
      try {
        const rows = reads.unreviewed(1, -1)
        expect(rows.map((row) => [row.id, row.days_since])).toEqual([['included', 1]])
        expect(trace).toEqual(['getDb', 'prepare', 'clock', 'clock', `all:[${first},${cutoff},-1]`])
        return rows
      } finally {
        tracking.restore()
      }
    })
  })
  it('retains SQLite truncation toward zero for future rows admitted by a negative cutoff', () => {
    compare(({ db, reads }) => {
      problem(db, null, 'future-half-day', NOW + 43200000)
      const rows = reads.unreviewed(-2)
      expect(rows[0]?.days_since).toBe(0)
      expect(rows[0]?.last_visited_at).toBe(NOW + 43200000)
      return rows
    })
  })
  it.each([1, 2])('retains clock %i exception identity before binding', (at) => {
    compare(({ db, reads, trace, failClock, clockCalls }) => {
      const sentinel = new Error('clock sentinel')
      failClock(at, sentinel)
      const tracking = track(db, trace)
      let caught: unknown
      try {
        reads.unreviewed()
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      expect(caught).toBe(sentinel)
      expect(clockCalls()).toBe(at)
      expect(trace).toEqual(['getDb', 'prepare', ...Array.from({ length: at }, () => 'clock')])
    })
  })
  it.each([NaN, Infinity, -Infinity, 1.25, 8640000000000001])(
    'keeps invalid second clock %s before step',
    (instant) => {
      compare(({ db, reads, trace, setClocks }) => {
        setClocks(NOW, instant)
        const tracking = track(db, trace)
        let result
        try {
          result = outcome(() => reads.unreviewed())
        } finally {
          tracking.restore()
        }
        expect(result.error).toEqual(
          instant === 8640000000000001
            ? { name: 'RangeError', message: 'Timestamp is outside the Date range' }
            : { name: 'TypeError', message: 'Timestamp must be integer milliseconds' },
        )
        expect(trace).toEqual(['getDb', 'prepare', 'clock', 'clock'])
        return result
      })
    },
  )
  it.each([NaN, Infinity, -Infinity, 1.25, 8640000000000001])(
    'does not newly validate first clock %s used only by SQL',
    (instant) => {
      compare(({ db, reads, trace, setClocks }) => {
        problem(db, 'old')
        setClocks(instant, NOW)
        const tracking = track(db, trace)
        try {
          const rows = reads.unreviewed()
          expect(rows).toHaveLength(1)
          expect(trace).toHaveLength(5)
          expect(trace[4]).toContain(`all:[${String(instant)},`)
          if (Number.isNaN(instant)) expect(rows[0]?.days_since).toBeNull()
          return rows
        } finally {
          tracking.restore()
        }
      })
    },
  )
  it.each([
    ['2026-03-09', '2026-03-08'],
    ['2026-11-02', '2026-11-01'],
    ['2024-03-01', '2024-02-29'],
    ['2026-01-01', '2025-12-31'],
  ])('keeps local cutoff but elapsed-day arithmetic at %s', (today, yesterday) => {
    compare(({ db, reads, setClocks }) => {
      const now = new Date(`${today}T00:30:00`).getTime(),
        old = new Date(`${yesterday}T00:00:00`).getTime()
      problem(db, 'old', 'old', old)
      setClocks(now)
      const rows = reads.unreviewed(0)
      expect(rows[0]?.days_since).toBe(Math.trunc((now - old) / 86400000))
      if (process.env.TZ === 'America/New_York' && yesterday === '2026-03-08')
        expect(rows[0]?.days_since).toBe(0)
      if (process.env.TZ === 'America/New_York' && yesterday === '2026-11-01')
        expect(rows[0]?.days_since).toBe(1)
      return rows
    })
  })
  it('retains skipped civil cutoff failure instead of normalizing it', () => {
    compare(({ reads, setClocks, clockCalls }) => {
      setClocks(new Date('2011-12-31T12:00:00').getTime())
      const result = outcome(() => reads.unreviewed(1))
      if (process.env.TZ === 'Pacific/Apia')
        expect(result.error).toEqual({
          name: 'RangeError',
          message: 'Local calendar day does not exist',
        })
      else expect(result.value).toEqual([])
      expect(clockCalls()).toBe(2)
      return result
    })
  })
})

describe('insight read-only state and connection ownership', () => {
  it.each(QUERIES)(
    'propagates a damaged %s column error at prepare without rewriting it',
    (query) => {
      compare(({ db, reads, trace, failClock, clockCalls }) => {
        const table =
          query === 'timeline'
            ? 'activity_events'
            : query === 'revisit'
              ? 'problem_visits'
              : query === 'wrong'
                ? 'submissions'
                : 'problems'
        const column =
          query === 'timeline'
            ? 'event_type'
            : query === 'revisit'
              ? 'entered_at'
              : query === 'wrong'
                ? 'submitted_at'
                : 'last_visited_at'
        db.exec(`ALTER TABLE ${table} RENAME COLUMN ${column} TO damaged_column`)
        failClock(1, new Error('prepare must precede clocks'))
        const tracking = track(db, trace)
        let caught: unknown
        try {
          readLimit(reads, query)
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
        expect(trace).toEqual(['getDb', 'prepare'])
        expect(clockCalls()).toBe(0)
        return { name: caught.name, code: caught.code }
      })
    },
  )

  it.each([false, true])(
    'retains tied wrong/unreviewed rows and literal/Unicode IDs; reverse=%s',
    (reverse) => {
      compare(({ db, reads }) => {
        for (const [index, id] of ["quote'%_", '\u9898\u76ee', 'Case', 'case'].entries()) {
          problem(db, id, id, 0)
          submission(db, id, `child${index}`, `key${index}`, 'UNKNOWN', 1.75)
        }
        db.pragma(`reverse_unordered_selects = ${reverse ? 'ON' : 'OFF'}`)
        const result = { wrong: reads.wrong(-1), unreviewed: reads.unreviewed(30, -1) }
        expect(result.wrong).toHaveLength(4)
        expect(result.unreviewed).toHaveLength(4)
        expect(
          result.wrong.every((row) => row.wrong_count === 1 && row.last_attempt === 1.75),
        ).toBe(true)
        return result
      })
    },
  )

  it.each([-1.75, -8640000000000001])(
    'retains raw unreviewed instant %s without Date decoding',
    (instant) => {
      compare(({ db, reads }) => {
        problem(db, null, 'raw-old', instant)
        const rows = reads.unreviewed()
        expect(rows[0]?.last_visited_at).toBe(instant)
        expect(rows[0]?.days_since).toBe(Math.trunc((NOW - instant) / 86400000))
        return rows
      })
    },
  )

  it('reads under query_only without mutating any row, ledger, schema, transaction or notification', () => {
    compare(({ db, reads }) => {
      seedAll(db)
      activity(db, null, 99, 0)
      problem(db, null, 'anonymous')
      db.pragma('query_only = ON')
      return QUERIES.map((query) => readLimit(reads, query, -1))
    })
  })
  it('reads a real readonly file without repair or ledger changes', () => {
    compare(({ reads }) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-insight-lists-'))
      directories.push(directory)
      closeDb()
      const file = path.join(directory, 'read.sqlite'),
        writable = initDbAtPath(file)
      seedAll(writable)
      problem(writable, null)
      activity(writable, null)
      closeDb()
      const readonly = new Database(file, { readonly: true }),
        get = vi.spyOn(connection, 'getDb').mockReturnValue(readonly),
        before = snapshot(readonly)
      try {
        const result = QUERIES.map((query) => readLimit(reads, query))
        expect(snapshot(readonly)).toEqual(before)
        return result
      } finally {
        get.mockRestore()
        readonly.close()
        initDbAtPath(':memory:')
      }
    })
  })
  it('observes caller transactions and savepoints without retaining rolled-back rows', () => {
    compare(({ db, reads }) => {
      const results: unknown[] = []
      expect(() =>
        db.transaction(() => {
          seedAll(db, 1)
          results.push(QUERIES.map((query) => readLimit(reads, query)))
          expect(db.inTransaction).toBe(true)
          expect(() =>
            db.transaction(() => {
              problem(db, null, 'nested')
              activity(db, null)
              results.push(reads.timeline(), reads.unreviewed())
              throw new Error('nested rollback')
            })(),
          ).toThrow('nested rollback')
          expect(reads.timeline()).toHaveLength(1)
          expect(reads.unreviewed()).toHaveLength(1)
          throw new Error('outer rollback')
        })(),
      ).toThrow('outer rollback')
      expect(db.inTransaction).toBe(false)
      expect(QUERIES.map((query) => readLimit(reads, query))).toEqual([[], [], [], []])
      return results
    })
  })
  it('uses the current handle after close/reinit and fails before clock on uninitialized access', () => {
    compare(({ db, reads, clockCalls }) => {
      seedAll(db)
      expect(reads.timeline()).toHaveLength(3)
      closeDb()
      const count = clockCalls(),
        errors = QUERIES.map((query) => outcome(() => readLimit(reads, query)))
      for (const result of errors)
        expect(result.error).toEqual({
          name: 'Error',
          message: 'Database not initialized. Call initDb() first.',
        })
      expect(clockCalls()).toBe(count)
      const next = initDbAtPath(':memory:')
      activity(next, null)
      problem(next, null)
      next.pragma('query_only = ON')
      expect(reads.timeline().map((row) => row.id)).toEqual([null])
      expect(reads.unreviewed().map((row) => row.id)).toEqual([null])
      expect(reads.revisit()).toEqual([])
      expect(reads.wrong()).toEqual([])
      return errors
    })
  })
})
