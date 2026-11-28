import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as connection from '../../electron/db/connection'
import { closeDb, getDb, getKnownMigrations, initDbAtPath } from '../../electron/db/connection'
import { applyDrizzleMigrations } from '../../src/main/db/migrate'
import { loadMigrationResources } from '../../src/main/db/migration-resources'
import {
  recomputeDailyStats,
  recomputeDailyStatsForDates,
  recomputeAllDailyStats,
} from '../../electron/db/repositories/stats/recompute'
import {
  recomputeDailyStatsAt,
  recomputeAllDailyStatsAt,
} from '../../electron/db/repositories/stats/recompute-runtime'
import { subscribeDataChanges, withDataChangeTransaction } from '../../electron/shared/dataEvents'
import { localDayBounds } from '../../src/shared/time'
import type { DataChangedPayload } from '../../src/shared/types/data'
import {
  originalRecomputeDailyStatsAt,
  originalRecomputeAllDailyStatsAt,
  originalRecomputeDailyStats,
  originalRecomputeDailyStatsForDates,
  originalRecomputeAllDailyStats,
} from './stats-recompute-oracle'

const NOW = 1768443630123
const DAY = '2026-03-08'
const NEXT = '2026-03-09'
const CHANGE = { tables: ['stats'] }
const nativeGetDb = getDb
const stringify = JSON.stringify
const directories: string[] = []
type Raw = number | string | null
type Scenario = {
  db: Database.Database
  daily: typeof recomputeDailyStats
  selected: typeof recomputeDailyStatsForDates
  all: typeof recomputeAllDailyStats
  at: typeof recomputeDailyStatsAt
  allAt: typeof recomputeAllDailyStatsAt
  events: DataChangedPayload[]
  trace: string[]
  original: boolean
  clocks: (...values: number[]) => void
}

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => {
  closeDb()
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const directory of directories.splice(0)) {
    assert.ok(
      path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-recompute-`),
    )
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function cache(db: Database.Database, day: string | null = DAY) {
  db.prepare(
    `INSERT INTO user_daily_stats
    (local_day,active_seconds,duration_seconds,visited_problem_count,solved_problem_count,submission_count,ac_submission_count,platform_distribution_json,recomputed_at,created_at,updated_at,deleted_at)
    VALUES (?,91,92,93,94,95,96,'{"old":true}',1,2,3,4)`,
  ).run(day)
}
function problem(
  db: Database.Database,
  id: string | null = 'p',
  solved: Raw = null,
  deleted: Raw = null,
) {
  db.prepare(
    `INSERT INTO problems (id,platform,platform_problem_id,canonical_url,first_solved_at,first_seen_at,created_at,updated_at,deleted_at)
    VALUES (?,'test',?,'https://example.invalid',?,0,1,2,?)`,
  ).run(id, id ?? 'null-parent', solved, deleted)
}
function visit(
  db: Database.Database,
  id: string | null,
  instant: Raw,
  duration: Raw = 10,
  active: Raw = 2,
  parent = 'p',
  platform = 'test',
  deleted: Raw = null,
) {
  db.prepare(
    `INSERT INTO problem_visits (id,problem_id,platform,url,entered_at,duration_seconds,active_seconds,created_at,updated_at,deleted_at)
    VALUES (?,?,?,'https://example.invalid',?,?,?,?,2,?)`,
  ).run(id, parent, platform, instant, duration, active, 1, deleted)
}
function submission(
  db: Database.Database,
  id: string | null,
  instant: Raw,
  verdict = 'AC',
  deleted: Raw = null,
) {
  db.prepare(
    `INSERT INTO submissions (id,problem_id,platform,platform_submission_id,verdict,submitted_at,created_at,updated_at,deleted_at)
    VALUES (?,'p','test',?,?,?,1,2,?)`,
  ).run(id, id ?? 'null-submission', verdict, instant, deleted)
}
function event(db: Database.Database, instant: Raw) {
  db.prepare(
    `INSERT INTO activity_events (event_type,occurred_at,local_day,created_at,deleted_at)
    VALUES ('fixture',?,'untrusted-label',0,7)`,
  ).run(instant)
}
function state(db: Database.Database) {
  const tables = db
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
  return {
    schema: db.prepare('SELECT * FROM sqlite_schema ORDER BY type,name').all(),
    tables: tables.map(({ name }) => ({
      name,
      rows: db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all(),
    })),
    types: tables.some(({ name }) => name === 'user_daily_stats')
      ? db
          .prepare(
            `SELECT typeof(active_seconds),typeof(duration_seconds),typeof(visited_problem_count),typeof(solved_problem_count),typeof(submission_count),typeof(ac_submission_count),typeof(platform_distribution_json),typeof(recomputed_at),typeof(created_at),typeof(updated_at),typeof(deleted_at) FROM user_daily_stats ORDER BY rowid`,
          )
          .raw()
          .all()
      : [],
    changes: db.prepare('SELECT total_changes() AS count').get(),
    inTransaction: db.inTransaction,
  }
}
function ledger(db: Database.Database) {
  return db
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE '%migrations%' ORDER BY name",
    )
    .all()
    .map(({ name }) => ({ name, rows: db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all() }))
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
    applyDrizzleMigrations(
      db,
      loadMigrationResources(path.resolve('drizzle')),
      getKnownMigrations(),
    )
    const initialLedger = ledger(db)
    const trace: string[] = [],
      events: DataChangedPayload[] = []
    let clocks = [NOW]
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      trace.push('clock')
      const now = clocks.length > 1 ? clocks.shift() : clocks[0]
      assert.notEqual(now, undefined)
      return now ?? NOW
    })
    const getter = vi.spyOn(connection, 'getDb').mockImplementation(() => {
      trace.push('db')
      return nativeGetDb()
    })
    const unsubscribe = subscribeDataChanges((payload) => {
      events.push(payload)
      trace.push(`event:${nativeGetDb().inTransaction}`)
    })
    try {
      const result = run({
        db,
        original,
        trace,
        events,
        clocks: (...values) => {
          clocks = values
        },
        daily: original ? originalRecomputeDailyStats : recomputeDailyStats,
        selected: original ? originalRecomputeDailyStatsForDates : recomputeDailyStatsForDates,
        all: original ? originalRecomputeAllDailyStats : recomputeAllDailyStats,
        at: original ? originalRecomputeDailyStatsAt : recomputeDailyStatsAt,
        allAt: original ? originalRecomputeAllDailyStatsAt : recomputeAllDailyStatsAt,
      })
      let finalDb: Database.Database | undefined
      try {
        finalDb = nativeGetDb()
      } catch {
        /* Closed-connection assertions have no final snapshot. */
      }
      if (db.open) expect(ledger(db)).toEqual(initialLedger)
      results.push({ result, events, trace, state: finalDb?.open ? state(finalDb) : undefined })
    } finally {
      unsubscribe()
      getter.mockRestore()
      clock.mockRestore()
      closeDb()
    }
  }
  expect(results[1]).toEqual(results[0])
}
function traceSql(
  db: Database.Database,
  trace: string[],
  failPrepare = 0,
  failure = new Error('prepare sentinel'),
) {
  const prepare = db.prepare.bind(db)
  const restores: (() => void)[] = []
  const queries: string[] = []
  const bindings: unknown[][] = []
  let error: unknown
  const spy = vi.spyOn(db, 'prepare').mockImplementation((query) => {
    queries.push(query)
    const normalized = query.toLowerCase().replaceAll('"', '')
    const kind = normalized.startsWith('insert')
      ? 'write'
      : normalized.includes('union')
        ? 'facts'
        : normalized.includes('group by')
          ? 'platforms'
          : normalized.includes('from user_daily_stats')
            ? 'cache'
            : normalized.includes('from problem_visits')
              ? 'visits'
              : normalized.includes('from submissions')
                ? 'submissions'
                : 'solved'
    trace.push(`prepare:${kind}`)
    if (queries.length === failPrepare) throw failure
    let statement: Database.Statement
    try {
      statement = prepare(query)
    } catch (caught) {
      error = caught
      throw caught
    }
    for (const method of ['get', 'all', 'run'] as const) {
      const native = statement[method].bind(statement)
      const methodSpy = vi.spyOn(statement, method).mockImplementation((...values: unknown[]) => {
        trace.push(
          `${method}:${kind}:${stringify(values, (_key, value: unknown) => (typeof value === 'bigint' ? `${value}n` : value))}`,
        )
        bindings.push(values)
        try {
          return native(...values)
        } catch (caught) {
          error = caught
          throw caught
        }
      })
      restores.push(() => methodSpy.mockRestore())
    }
    return statement
  })
  return {
    queries,
    bindings,
    error: () => error,
    restore: () => {
      spy.mockRestore()
      for (const restore of restores) restore()
    },
  }
}
function audit(db: Database.Database, operation: 'INSERT' | 'UPDATE', mode = 'audit') {
  db.exec(`CREATE TABLE stats_audit (phase TEXT,day TEXT);
    CREATE TRIGGER stats_before BEFORE ${operation} ON user_daily_stats BEGIN
      INSERT INTO stats_audit VALUES ('before',NEW.local_day);
      ${mode === 'audit' ? '' : mode === 'IGNORE' ? 'SELECT RAISE(IGNORE);' : `SELECT RAISE(${mode},'stats rejected');`}
    END;
    CREATE TRIGGER stats_after AFTER ${operation} ON user_daily_stats BEGIN
      INSERT INTO stats_audit VALUES ('after',NEW.local_day);
    END;`)
}
function rows(db: Database.Database) {
  return db.prepare('SELECT * FROM user_daily_stats ORDER BY rowid').all()
}

describe('runtime daily recompute differential', () => {
  it.each([false, true])(
    'preserves explicit safe-integer aggregate decoding (nonempty=%s)',
    (nonempty) => {
      compare(({ db, at, trace }) => {
        if (nonempty) {
          problem(db)
          visit(db, 'safe-integer', localDayBounds(DAY).start)
        }
        db.defaultSafeIntegers(true)
        const tracking = traceSql(db, trace)
        let result
        try {
          result = outcome(() => at(db, DAY, NOW))
        } finally {
          tracking.restore()
          db.defaultSafeIntegers(false)
        }
        expect(tracking.queries).toHaveLength(5)
        if (nonempty) {
          expect(result.error).toEqual({
            name: 'TypeError',
            message: 'Do not know how to serialize a BigInt',
          })
          expect(rows(db)).toEqual([])
        } else {
          expect(tracking.bindings[4]).toEqual([DAY, 0n, 0n, 0n, 0n, 0n, 0n, null, NOW, NOW, NOW])
          expect(result.error).toBeUndefined()
        }
        return result
      })
    },
  )
  it.each([0, 1.75, NOW, 8640000000000001])(
    'keeps empty SQL aggregates, raw timestamp %s, and cache metadata',
    (now) => {
      compare(({ db, at, trace }) => {
        const tracking = traceSql(db, trace)
        try {
          at(db, DAY, now)
        } finally {
          tracking.restore()
        }
        expect(tracking.bindings).toEqual([
          ...Array.from({ length: 4 }, () => Object.values(localDayBounds(DAY))),
          [DAY, 0, 0, 0, 0, 0, 0, null, now, now, now],
        ])
        expect(rows(db)).toEqual([
          expect.objectContaining({
            local_day: DAY,
            platform_distribution_json: null,
            created_at: now,
            updated_at: now,
            recomputed_at: now,
            deleted_at: null,
          }),
        ])
        db.prepare('UPDATE user_daily_stats SET created_at=3.5,deleted_at=0').run()
        at(db, DAY, now)
        expect(rows(db)).toEqual([expect.objectContaining({ created_at: 3.5, deleted_at: 0 })])
        return tracking.bindings
      })
    },
  )
  it('preserves native SUM/counts, tombstones, orphans, empty identifiers, group order and JSON bytes', () => {
    compare(({ db, at, trace, original }) => {
      const { start, end } = localDayBounds(DAY)
      db.pragma('foreign_keys=OFF')
      problem(db, 'p', start)
      problem(db, '', end - 1)
      problem(db, null, start)
      problem(db, 'deleted', start, 0)
      problem(db, 'next', end)
      visit(db, null, start, null, null, 'p', 'z', 0)
      visit(db, 'v1', end - 1, 1.25, -2.5, '', 'A')
      visit(db, 'v2', start + 1, -3, 'text', 'orphan', 'z')
      visit(db, 'v3', start - 1, 999, 999)
      visit(db, 'v4', end, 999, 999)
      submission(db, null, start, 'AC', 0)
      submission(db, 's1', end - 1, 'ac')
      submission(db, 's2', start + 1, 'AC ')
      submission(db, 's3', end, 'AC')
      const tracking = traceSql(db, trace)
      try {
        at(db, DAY, NOW)
      } finally {
        tracking.restore()
      }
      expect(rows(db)).toEqual([
        expect.objectContaining({
          active_seconds: -2.5,
          duration_seconds: -1.75,
          visited_problem_count: 3,
          solved_problem_count: 3,
          submission_count: 3,
          ac_submission_count: 1,
          platform_distribution_json: '[{"platform":"A","count":1},{"platform":"z","count":2}]',
        }),
      ])
      expect(tracking.queries).toHaveLength(5)
      const insert = tracking.queries[4]
      assert.ok(insert)
      expect(insert.match(/\?/g) ?? []).toHaveLength(11)
      const columns = insert
        .slice(insert.indexOf('(') + 1, insert.indexOf(')'))
        .split(',')
        .map((c) => c.trim().replaceAll('"', ''))
      expect(columns).toHaveLength(original ? 11 : 12)
      if (!original) expect(columns.at(-1)).toBe('deleted_at')
      return rows(db)
    })
  })
  it('fires exactly the historical nine UPDATE OF columns, preserving unrelated cache fields', () => {
    compare(({ db, daily }) => {
      cache(db)
      db.exec('CREATE TABLE update_audit (name TEXT)')
      const changed = [
        'active_seconds',
        'duration_seconds',
        'visited_problem_count',
        'solved_problem_count',
        'submission_count',
        'ac_submission_count',
        'platform_distribution_json',
        'recomputed_at',
        'updated_at',
      ]
      for (const name of [...changed, 'local_day', 'created_at', 'deleted_at'])
        db.exec(
          `CREATE TRIGGER audit_${name} AFTER UPDATE OF ${name} ON user_daily_stats BEGIN INSERT INTO update_audit VALUES ('${name}'); END;`,
        )
      daily(DAY)
      expect(db.prepare('SELECT name FROM update_audit ORDER BY name').all()).toEqual(
        changed.sort().map((name) => ({ name })),
      )
      expect(rows(db)).toEqual([expect.objectContaining({ created_at: 2, deleted_at: 4 })])
    })
  })
  for (const conflict of [false, true])
    it.each(['audit', 'IGNORE', 'FAIL', 'ABORT'])(
      `preserves ${conflict ? 'conflict' : 'fresh'} trigger %s effects and notification`,
      (mode) => {
        compare(({ db, daily, events }) => {
          if (conflict) cache(db)
          audit(db, conflict ? 'UPDATE' : 'INSERT', mode)
          const result = outcome(() => daily(DAY))
          expect(events).toEqual(['audit', 'IGNORE'].includes(mode) ? [CHANGE] : [])
          expect(db.prepare('SELECT phase FROM stats_audit ORDER BY rowid').all()).toEqual(
            mode === 'ABORT'
              ? []
              : mode === 'audit'
                ? [{ phase: 'before' }, { phase: 'after' }]
                : [{ phase: 'before' }],
          )
          return result
        })
      },
    )
  it.each([1, 2, 3, 4, 5])('preserves prepare %s failure identity and prefix ordering', (index) => {
    compare(({ db, daily, trace, events }) => {
      const sentinel = new Error('prepare sentinel'),
        tracking = traceSql(db, trace, index, sentinel)
      let caught: unknown
      try {
        daily(DAY)
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      expect(caught).toBe(sentinel)
      expect(events).toEqual([])
      expect(tracking.queries).toHaveLength(index)
    })
  })
  it('keeps integer overflow before later INSERT prepare and propagates the native error object', () => {
    compare(({ db, daily, trace, events }) => {
      problem(db)
      visit(db, 'a', localDayBounds(DAY).start)
      visit(db, 'b', localDayBounds(DAY).start)
      db.exec(
        "UPDATE problem_visits SET duration_seconds=CASE id WHEN 'a' THEN 9223372036854775807 ELSE 1 END; DROP TABLE user_daily_stats",
      )
      expect(
        db.prepare('SELECT typeof(duration_seconds) AS type FROM problem_visits').all(),
      ).toEqual([{ type: 'integer' }, { type: 'integer' }])
      const tracking = traceSql(db, trace)
      let caught: unknown
      try {
        daily(DAY)
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      expect(caught).toBe(tracking.error())
      expect(caught).toMatchObject({
        name: 'SqliteError',
        message: 'integer overflow',
        code: 'SQLITE_ERROR',
      })
      expect(tracking.queries).toHaveLength(1)
      expect(events).toEqual([])
    })
  })
  it.each([false, true])(
    'prepares INSERT before JSON serialization (broken INSERT=%s)',
    (broken) => {
      compare(({ db, daily, trace }) => {
        problem(db)
        visit(db, 'v', localDayBounds(DAY).start)
        if (broken) db.exec('DROP TABLE user_daily_stats')
        const sentinel = new Error('serialization sentinel'),
          tracking = traceSql(db, trace)
        const serialize = vi.spyOn(JSON, 'stringify').mockImplementation((value) => {
          if (!Array.isArray(value)) return stringify(value)
          trace.push('json')
          throw sentinel
        })
        let caught: unknown
        try {
          daily(DAY)
        } catch (error) {
          caught = error
        } finally {
          serialize.mockRestore()
          tracking.restore()
        }
        if (broken) {
          expect(caught).toBe(tracking.error())
          expect(trace).not.toContain('json')
        } else {
          expect(caught).toBe(sentinel)
          expect(trace.at(-2)).toBe('prepare:write')
          expect(trace.at(-1)).toBe('json')
        }
      })
    },
  )
  it('does not serialize empty platforms', () => {
    compare(({ db, at }) => {
      const serialize = vi.spyOn(JSON, 'stringify').mockImplementation((value) => {
        if (Array.isArray(value)) throw new Error('unexpected JSON')
        return stringify(value)
      })
      try {
        at(db, DAY, NOW)
      } finally {
        serialize.mockRestore()
      }
    })
  })
})

describe('runtime all-days and wrapper sequencing', () => {
  it.each(['daily', 'all'] as const)(
    'keeps %s explicit core independent of clocks, globals and transactions',
    (mode) => {
      compare(({ db, at, allAt, trace, events }) => {
        cache(db)
        const forbidden = () => {
          throw new Error('explicit core acquired an unrelated dependency')
        }
        const clock = vi.spyOn(Date, 'now').mockImplementation(forbidden)
        const getter = vi.spyOn(connection, 'getDb').mockImplementation(forbidden)
        const transaction = vi.spyOn(db, 'transaction').mockImplementation(forbidden)
        const exec = vi.spyOn(db, 'exec').mockImplementation(forbidden)
        try {
          if (mode === 'daily') at(db, DAY, 1.75)
          else expect(allAt(db, 1.75)).toBe(1)
        } finally {
          clock.mockRestore()
          getter.mockRestore()
          transaction.mockRestore()
          exec.mockRestore()
        }
        expect(trace).toEqual([])
        expect(events).toEqual([])
        expect(rows(db)).toEqual([expect.objectContaining({ recomputed_at: 1.75 })])
      })
    },
  )
  it('materializes one four-arm distinct UNION and keeps cache insertion order without sorting', () => {
    compare(({ db, all, trace, events }) => {
      const { start } = localDayBounds(DAY)
      cache(db, NEXT)
      cache(db, DAY)
      cache(db, '2025-12-31')
      problem(db, 'p', start, 0)
      visit(db, 'v', start)
      submission(db, 's', start)
      event(db, start)
      event(db, localDayBounds('2026-01-01').start)
      const tracking = traceSql(db, trace)
      try {
        expect(all()).toBe(4)
      } finally {
        tracking.restore()
      }
      const queries = tracking.queries.filter((query) => /union/i.test(query))
      expect(queries).toHaveLength(1)
      expect(queries[0]?.match(/union/gi)).toHaveLength(3)
      expect(queries[0]).not.toMatch(/union all|deleted_at|order by/i)
      expect(tracking.bindings.filter((b) => b.length === 11).map((b) => b[0])).toEqual([
        '2025-12-31',
        DAY,
        NEXT,
        '2026-01-01',
      ])
      expect(events).toEqual([CHANGE])
      expect(trace.filter((entry) => entry === 'clock')).toHaveLength(1)
    })
  })
  it.each([false, true])(
    'converts every fact before cache validation/writes (reversed=%s)',
    (reverse) => {
      for (const invalid of [1.5, 'bad-time', 9007199254740992, 8640000000000001])
        compare(({ db, all, trace, events }) => {
          cache(db)
          cache(db, 'bad-day')
          event(db, invalid)
          if (reverse) db.pragma('reverse_unordered_selects=ON')
          const before = state(db),
            tracking = traceSql(db, trace)
          let result
          try {
            result = outcome(all)
          } finally {
            tracking.restore()
          }
          expect(state(db)).toEqual(before)
          expect(events).toEqual([])
          expect(tracking.queries).toHaveLength(2)
          expect(result.error).toEqual(
            invalid === 8640000000000001
              ? { name: 'RangeError', message: 'Timestamp is outside the Date range' }
              : { name: 'TypeError', message: 'Timestamp must be integer milliseconds' },
          )
          return result
        })
    },
  )
  it.each([false, true])(
    'validates NULL cache keys only at their original iteration point (reversed=%s)',
    (reverse) => {
      compare(({ db, all, events, trace }) => {
        cache(db, null)
        cache(db)
        if (reverse) db.pragma('reverse_unordered_selects=ON')
        const cached = db
          .prepare<[], { local_day: string | null }>('SELECT local_day FROM user_daily_stats')
          .all()
        expect(cached.map((row) => row.local_day)).toEqual(reverse ? [DAY, null] : [null, DAY])
        const tracking = traceSql(db, trace)
        try {
          expect(outcome(all).error).toEqual({ name: 'TypeError', message: 'Invalid local day' })
        } finally {
          tracking.restore()
        }
        expect(tracking.bindings.filter((b) => b.length === 11)).toHaveLength(reverse ? 1 : 0)
        expect(
          db.prepare('SELECT updated_at FROM user_daily_stats WHERE local_day=?').get(DAY),
        ).toEqual({ updated_at: reverse ? NOW : 3 })
        expect(events).toEqual([])
      })
    },
  )
  it.each(['malformed', 'extreme'])(
    'retains earlier autocommitted rows before a late %s day failure',
    (mode) => {
      compare(({ db, all, events }) => {
        cache(db)
        if (mode === 'malformed') cache(db, 'zz-invalid')
        else event(db, 8640000000000000)
        const result = outcome(all)
        expect(result.error).toEqual({ name: 'TypeError', message: 'Invalid local day' })
        expect(
          db.prepare('SELECT updated_at FROM user_daily_stats WHERE local_day=?').get(DAY),
        ).toEqual({ updated_at: NOW })
        expect(events).toEqual([])
        return result
      })
    },
  )
  it('has no writes or events for empty all-days but consumes exactly one clock', () => {
    compare(({ db, all, events, trace }) => {
      const before = state(db)
      expect(all()).toBe(0)
      expect(state(db)).toEqual(before)
      expect(events).toEqual([])
      expect(trace).toEqual(['db', 'clock'])
    })
  })
  it('gets DB before clocks and preserves the two-clock default-day midnight boundary', () => {
    compare(({ db, daily, clocks, trace }) => {
      const midnight = localDayBounds(NEXT).start
      clocks(midnight - 1, midnight)
      daily()
      expect(rows(db)).toEqual([expect.objectContaining({ local_day: DAY, created_at: midnight })])
      expect(trace).toEqual(['db', 'clock', 'clock', 'event:false'])
      trace.length = 0
      clocks(NOW)
      daily(NEXT)
      expect(trace).toEqual(['db', 'clock', 'event:false'])
      trace.length = 0
      expect(() => daily('2026-02-30')).toThrow('Invalid local day')
      expect(trace).toEqual(['db', 'clock'])
    })
  })
  it('fully consumes iterables before accessing DB, then default-sorts/deduplicates and notifies per date', () => {
    compare(({ db, selected, trace, events }) => {
      const dates: Iterable<string> = {
        get [Symbol.iterator]() {
          trace.push('iterator:get')
          return function* () {
            trace.push('iterator:start')
            for (const date of [NEXT, DAY, NEXT]) {
              trace.push(`yield:${date}`)
              yield date
            }
            trace.push('iterator:end')
          }
        },
      }
      expect(selected(dates)).toBe(2)
      expect(trace).toEqual([
        'iterator:get',
        'iterator:start',
        `yield:${NEXT}`,
        `yield:${DAY}`,
        `yield:${NEXT}`,
        'iterator:end',
        'db',
        'clock',
        'event:false',
        'db',
        'clock',
        'event:false',
      ])
      expect(rows(db)).toEqual([
        expect.objectContaining({ local_day: DAY }),
        expect.objectContaining({ local_day: NEXT }),
      ])
      expect(events).toEqual([CHANGE, CHANGE])
    })
  })
  it('preserves iterator failure identity and empty selected success even without initialization', () => {
    compare(({ selected, all, daily, trace }) => {
      closeDb()
      trace.length = 0
      expect(selected([])).toBe(0)
      expect(trace).toEqual([])
      const sentinel = new Error('iterator sentinel')
      const iterable: Iterable<string> = {
        *[Symbol.iterator]() {
          yield DAY
          throw sentinel
        },
      }
      let caught: unknown
      try {
        selected(iterable)
      } catch (error) {
        caught = error
      }
      expect(caught).toBe(sentinel)
      expect(trace).toEqual([])
      const errors = [outcome(() => daily()), outcome(all)]
      expect(trace).toEqual(['db', 'db'])
      return errors
    })
  })
  it('selected failure preserves earlier writes and notifications, unlike all-days failure', () => {
    compare(({ db, selected, events }) => {
      expect(() => selected(['zz-invalid', DAY])).toThrow('Invalid local day')
      expect(rows(db)).toHaveLength(1)
      expect(events).toEqual([CHANGE])
    })
  })
  it('preserves reentrant subscribers and isolates throwing subscribers after committed writes', () => {
    compare(({ db, daily, events, trace }) => {
      let reentered = false
      const offThrow = subscribeDataChanges(() => {
        throw new Error('listener sentinel')
      })
      const offReenter = subscribeDataChanges(() => {
        if (!reentered) {
          reentered = true
          daily(NEXT)
        }
      })
      try {
        daily(DAY)
      } finally {
        offThrow()
        offReenter()
      }
      expect(rows(db)).toHaveLength(2)
      expect(events).toEqual([CHANGE, CHANGE])
      expect(trace).toEqual(['db', 'clock', 'event:false', 'db', 'clock', 'event:false'])
    })
  })
  it('follows reinitialization and explicit standalone handles without caching the global connection', () => {
    compare(({ db, daily, at, events }) => {
      const other = new Database(':memory:')
      try {
        const schemas = db
          .prepare<[], { sql: string }>(
            "SELECT sql FROM sqlite_schema WHERE type='table' AND name IN ('problems','problem_visits','submissions','user_daily_stats')",
          )
          .all()
        for (const { sql } of schemas) other.exec(sql)
        at(other, DAY, 0)
        expect(rows(other)).toHaveLength(1)
        expect(rows(db)).toEqual([])
        expect(events).toEqual([])
        closeDb()
        expect(() => daily(DAY)).toThrow('Database not initialized')
        at(other, NEXT, 1.75)
        expect(rows(other)).toHaveLength(2)
        const reopened = initDbAtPath(':memory:')
        daily(DAY)
        expect(rows(reopened)).toHaveLength(1)
      } finally {
        other.close()
      }
    })
  })
  it('keeps query-only, readonly, and closed-handle errors native', () => {
    compare(({ db, daily, at, events, trace }) => {
      db.pragma('query_only=ON')
      const before = state(db),
        tracking = traceSql(db, trace)
      let caught: unknown
      try {
        daily(DAY)
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      expect(caught).toBe(tracking.error())
      expect(caught).toMatchObject({ code: 'SQLITE_READONLY' })
      expect(state(db)).toEqual(before)
      expect(events).toEqual([])
      db.pragma('query_only=OFF')
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-recompute-'))
      directories.push(dir)
      const target = path.join(dir, 'read-only.sqlite')
      db.prepare('VACUUM INTO ?').run(target)
      const readonly = new Database(target, { readonly: true })
      const errors = []
      try {
        errors.push(outcome(() => at(readonly, DAY, NOW)))
        expect(rows(readonly)).toEqual([])
      } finally {
        readonly.close()
      }
      errors.push(outcome(() => at(readonly, DAY, NOW)))
      return errors
    })
  })
})

describe('runtime recompute transaction and calendar boundaries', () => {
  it.each(['commit', 'rollback', 'inner-rollback', 'commit-failure'])(
    'preserves real transaction ownership and notification on %s',
    (mode) => {
      compare(({ db, daily, events }) => {
        if (mode === 'commit-failure')
          db.exec(`CREATE TRIGGER deferred_cache_fk AFTER INSERT ON user_daily_stats BEGIN
        INSERT INTO submissions (id,problem_id,platform,platform_submission_id,verdict,submitted_at,created_at,updated_at)
        VALUES (NEW.local_day,'missing-parent','fixture',NEW.local_day,'WA',0,0,0);
      END;`)
        let callbackFinished = false
        const result = outcome(() =>
          withDataChangeTransaction(() =>
            db.transaction(() => {
              if (mode === 'commit-failure') db.pragma('defer_foreign_keys=ON')
              daily(DAY)
              expect(events).toEqual([])
              expect(rows(db)).toHaveLength(1)
              const nested = () =>
                withDataChangeTransaction(() =>
                  db.transaction(() => {
                    daily(NEXT)
                    if (mode === 'inner-rollback') throw new Error('inner rollback')
                  })(),
                )
              if (mode === 'inner-rollback') expect(nested).toThrow('inner rollback')
              else nested()
              expect(events).toEqual([])
              if (mode === 'rollback') throw new Error('outer rollback')
              callbackFinished = true
            })(),
          ),
        )
        const committed = mode === 'commit' || mode === 'inner-rollback'
        expect(events).toEqual(committed ? [CHANGE] : [])
        expect(rows(db)).toHaveLength(mode === 'commit' ? 2 : mode === 'inner-rollback' ? 1 : 0)
        expect(db.inTransaction).toBe(false)
        if (mode === 'commit-failure') {
          expect(callbackFinished).toBe(true)
          expect(result.error).toEqual({
            name: 'SqliteError',
            message: 'FOREIGN KEY constraint failed',
            code: 'SQLITE_CONSTRAINT_FOREIGNKEY',
          })
          expect(db.prepare('SELECT * FROM submissions').all()).toEqual([])
        }
        return { result, callbackFinished }
      })
    },
  )
  it.each(['2026-03-08', '2026-11-01', '2024-02-29', '2025-12-31', '2026-01-01'])(
    'uses indexed half-open local ranges for %s',
    (day) => {
      compare(({ db, at, trace }) => {
        const { start, end } = localDayBounds(day)
        problem(db)
        for (const [index, instant] of [start - 1, start, end - 1, end].entries())
          visit(db, `v${index}`, instant)
        const tracking = traceSql(db, trace)
        try {
          at(db, day, NOW)
        } finally {
          tracking.restore()
        }
        expect(tracking.bindings.slice(0, 4)).toEqual(Array.from({ length: 4 }, () => [start, end]))
        expect(rows(db)).toEqual([
          expect.objectContaining({ active_seconds: 4, duration_seconds: 20 }),
        ])
        if (process.env.TZ === 'America/New_York' && day === '2026-03-08')
          expect(end - start).toBe(23 * 3600000)
        if (process.env.TZ === 'America/New_York' && day === '2026-11-01')
          expect(end - start).toBe(25 * 3600000)
        for (const query of tracking.queries.slice(0, 4))
          expect(query).not.toMatch(/datetime\(|strftime\(|date\(/i)
      })
    },
  )
  it('preserves skipped-day validation before the first SQL statement', () => {
    compare(({ db, at, trace }) => {
      const tracking = traceSql(db, trace)
      let result
      try {
        result = outcome(() => at(db, '2011-12-30', NOW))
      } finally {
        tracking.restore()
      }
      if (process.env.TZ === 'Pacific/Apia') {
        expect(result.error).toEqual({
          name: 'RangeError',
          message: 'Local calendar day does not exist',
        })
        expect(tracking.queries).toEqual([])
      } else expect(result.error).toBeUndefined()
      return result
    })
  })
  it('documents the excluded altered-default counterexample without widening the frozen-schema contract', () => {
    const deleted = []
    for (const at of [originalRecomputeDailyStatsAt, recomputeDailyStatsAt]) {
      closeDb()
      const db = initDbAtPath(':memory:')
      const definition = db
        .prepare<[], { sql: string }>(
          "SELECT sql FROM sqlite_schema WHERE type='table' AND name='user_daily_stats'",
        )
        .get()
      assert.ok(definition)
      const changed = definition.sql.replace(
        /deleted_at\s+INTEGER/i,
        'deleted_at INTEGER DEFAULT 7',
      )
      expect(changed).not.toBe(definition.sql)
      db.exec('DROP TABLE user_daily_stats')
      db.exec(changed)
      at(db, DAY, NOW)
      deleted.push(db.prepare('SELECT deleted_at FROM user_daily_stats').get())
    }
    expect(deleted).toEqual([{ deleted_at: 7 }, { deleted_at: null }])
  })
})
