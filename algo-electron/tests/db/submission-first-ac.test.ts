import assert from 'node:assert/strict'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import {
  recomputeProblemSubmissionState,
  updateFirstAc,
  upsertSubmission,
} from '../../electron/db/repositories/submissionRepository'
import * as dateHelpers from '../../electron/db/repositories/stats/date'
import { subscribeDataChanges, withDataChangeTransaction } from '../../electron/shared/dataEvents'
import { toLocalDay } from '../../src/shared/time'
import type { DataChangedPayload } from '../../src/shared/types/data'
import {
  runOriginalRecomputeProblemSubmissionState,
  runOriginalUpdateFirstAc,
} from './submission-first-ac-oracle'

const NOW = 1768443630123
const EARLY = Date.parse('2026-03-07T12:00:00Z')
const LATE = Date.parse('2026-03-10T12:00:00Z')
const CHANGE = { tables: ['problems', 'stats'] }
type RawInstant = number | string

type Scenario = {
  db: Database.Database
  update: typeof updateFirstAc
  recompute: typeof recomputeProblemSubmissionState
  events: DataChangedPayload[]
  trace: string[]
  clockCalls: () => number
  original: boolean
}

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => {
  closeDb()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function seedProblem(
  db: Database.Database,
  id: string | null = 'p',
  status = 'unknown',
  firstAc: RawInstant | null = null,
  deletedAt: number | null = null,
) {
  db.prepare(
    `INSERT INTO problems
    (id, platform, platform_problem_id, canonical_url, status, first_solved_at,
     first_seen_at, created_at, updated_at, deleted_at)
    VALUES (?, 'test', ?, 'https://example.invalid/problem', ?, ?, 10, 11, 12, ?)`,
  ).run(id, id ?? 'null-parent', status, firstAc, deletedAt)
}

function seedSubmission(
  db: Database.Database,
  problemId: string | null = 'p',
  submittedAt: RawInstant = EARLY,
  verdict = 'AC',
  id: string | null = 's',
  deletedAt: number | null = null,
) {
  const count = db.prepare<[], { total: number }>('SELECT COUNT(*) AS total FROM submissions').get()
  assert.ok(count)
  db.prepare(
    `INSERT INTO submissions
    (id, problem_id, platform, platform_submission_id, verdict, submitted_at,
     created_at, updated_at, deleted_at)
    VALUES (?, ?, 'test', ?, ?, ?, 21, 22, ?)`,
  ).run(id, problemId, `key-${count.total}`, verdict, submittedAt, deletedAt)
}

function snapshot(db: Database.Database) {
  return {
    problems: db.prepare('SELECT * FROM problems ORDER BY rowid').all(),
    submissions: db.prepare('SELECT * FROM submissions ORDER BY rowid').all(),
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
    const transactionStates: boolean[] = []
    const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const localDay = dateHelpers.localDayFromTimestamp
    const day = vi.spyOn(dateHelpers, 'localDayFromTimestamp').mockImplementation((instant) => {
      trace.push(`day:${instant}`)
      return localDay(instant)
    })
    const unsubscribe = subscribeDataChanges((event) => {
      events.push(event)
      transactionStates.push(getDb().inTransaction)
      trace.push('event')
    })
    try {
      const result = run({
        db,
        update: original ? (id) => runOriginalUpdateFirstAc(getDb(), id) : updateFirstAc,
        recompute: original
          ? (ids) => runOriginalRecomputeProblemSubmissionState(getDb(), ids)
          : recomputeProblemSubmissionState,
        events,
        trace,
        clockCalls: () => clock.mock.calls.length,
        original,
      })
      results.push({
        result,
        state: snapshot(getDb()),
        events,
        transactionStates,
        trace,
        clockCalls: clock.mock.calls.length,
        inTransaction: getDb().inTransaction,
      })
    } finally {
      unsubscribe()
      day.mockRestore()
      clock.mockRestore()
      closeDb()
    }
  }
  expect(results[1]).toEqual(results[0])
}

function traceStatements(
  db: Database.Database,
  trace: string[],
  failAt = 0,
  failure = new Error('prepare sentinel'),
) {
  const prepareNative = db.prepare.bind(db)
  const restores: (() => void)[] = []
  let count = 0
  const prepare = vi.spyOn(db, 'prepare').mockImplementation((query) => {
    const kind = /^\s*update/i.test(query)
      ? 'update'
      : /count\(\*\)/i.test(query)
        ? 'aggregate'
        : /from ["`]?submissions/i.test(query)
          ? 'ac'
          : 'parent'
    trace.push(`prepare:${kind}`)
    if (++count === failAt) throw failure
    const statement = prepareNative(query)
    const nativeGet = statement.get.bind(statement)
    const get = vi.spyOn(statement, 'get').mockImplementation((...bindings: unknown[]) => {
      // Drizzle binds fixed LIMIT 1, unlike the original SQL literal; keep that outside semantic traces.
      const normalized = kind === 'ac' ? bindings.slice(0, 1) : bindings
      trace.push(`get:${kind}:${JSON.stringify(normalized)}`)
      return nativeGet(...bindings)
    })
    const nativeRun = statement.run.bind(statement)
    const run = vi.spyOn(statement, 'run').mockImplementation((...bindings: unknown[]) => {
      trace.push(`run:${kind}:${JSON.stringify(bindings)}`)
      return nativeRun(...bindings)
    })
    restores.push(
      () => get.mockRestore(),
      () => run.mockRestore(),
    )
    return statement
  })
  return () => {
    prepare.mockRestore()
    for (const restore of restores) restore()
  }
}

function iterable(trace: string[], ids: string[], failure?: Error): Iterable<string> {
  return {
    get [Symbol.iterator]() {
      trace.push('iterator:get')
      return function* () {
        trace.push('iterator:start')
        for (const id of ids) {
          trace.push(`iterator:yield:${id}`)
          yield id
        }
        if (failure) throw failure
        trace.push('iterator:end')
      }
    },
  }
}

function installAudit(db: Database.Database, mode = 'audit') {
  db.exec(`CREATE TABLE first_ac_audit (phase TEXT, id TEXT, status TEXT, first_ac INTEGER, updated_at INTEGER);
    CREATE TRIGGER first_ac_before BEFORE UPDATE ON problems BEGIN
      INSERT INTO first_ac_audit VALUES ('before',NEW.id,NEW.status,NEW.first_solved_at,NEW.updated_at);
      ${mode === 'audit' ? '' : mode === 'IGNORE' ? 'SELECT RAISE(IGNORE);' : `SELECT RAISE(${mode}, 'first-ac rejected');`}
    END;
    CREATE TRIGGER first_ac_after AFTER UPDATE ON problems BEGIN
      INSERT INTO first_ac_audit VALUES ('after',NEW.id,NEW.status,NEW.first_solved_at,NEW.updated_at);
    END;`)
  for (const column of ['status', 'first_solved_at', 'updated_at']) {
    db.exec(`CREATE TRIGGER first_ac_of_${column} AFTER UPDATE OF ${column} ON problems BEGIN
      INSERT INTO first_ac_audit VALUES ('${column}',NEW.id,NEW.status,NEW.first_solved_at,NEW.updated_at);
    END;`)
  }
  db.exec(`CREATE TRIGGER first_ac_unrelated AFTER UPDATE OF title ON problems BEGIN
    INSERT INTO first_ac_audit VALUES ('unexpected-title',NEW.id,NEW.status,NEW.first_solved_at,NEW.updated_at);
  END;`)
}

function auditRows(db: Database.Database) {
  return db.prepare('SELECT * FROM first_ac_audit ORDER BY rowid').all()
}

function firstState(db: Database.Database, id = 'p') {
  return db
    .prepare<
      [string],
      { status: string; first_solved_at: RawInstant | null; updated_at: RawInstant }
    >('SELECT status, first_solved_at, updated_at FROM problems WHERE id = ?')
    .get(id)
}

describe('append-only first AC frozen behavior', () => {
  it.each(['missing', 'no-ac', 'wrong-case', 'old-only', 'orphan'])(
    'keeps parent/AC branching: %s',
    (kind) => {
      compare(({ db, update, events, trace, clockCalls }) => {
        if (kind !== 'missing' && kind !== 'orphan')
          seedProblem(db, 'p', 'attempted', kind === 'old-only' ? LATE : null)
        if (kind === 'wrong-case') {
          seedSubmission(db, 'p', EARLY, 'ac')
          seedSubmission(db, 'p', EARLY - 1, 'WA', 'wa')
        }
        if (kind === 'orphan') {
          db.pragma('foreign_keys = OFF')
          seedSubmission(db)
          db.pragma('foreign_keys = ON')
        }
        const stop = traceStatements(db, trace)
        let dates
        try {
          dates = update('p')
        } finally {
          stop()
        }
        expect(dates).toEqual(
          kind === 'orphan' ? [toLocalDay(EARLY)] : kind === 'old-only' ? [toLocalDay(LATE)] : [],
        )
        expect(trace.slice(0, 4)).toEqual([
          'prepare:parent',
          'get:parent:["p"]',
          'prepare:ac',
          'get:ac:["p"]',
        ])
        expect(trace.filter((entry) => entry === 'prepare:update')).toHaveLength(
          kind === 'orphan' ? 1 : 0,
        )
        expect(events).toEqual([])
        expect(clockCalls()).toBe(1)
        return dates
      })
    },
  )

  it.each([null, EARLY - 86400000, EARLY, LATE])(
    'keeps original null-or-greater predicate for old %s',
    (previous) => {
      compare(({ db, update, events, trace }) => {
        seedProblem(db, 'p', 'attempted', previous, 0)
        seedSubmission(db, 'p', EARLY, 'AC', null, 0)
        seedSubmission(db, 'p', LATE, 'AC', '', 0)
        const stop = traceStatements(db, trace)
        let dates
        try {
          dates = update('p')
        } finally {
          stop()
        }
        const changed = previous === null || previous > EARLY
        expect(firstState(db)).toEqual({
          status: changed ? 'solved' : 'attempted',
          first_solved_at: changed ? EARLY : previous,
          updated_at: changed ? NOW : 12,
        })
        expect(events).toEqual(changed ? [CHANGE] : [])
        expect(dates).toEqual([
          ...new Set([...(previous === null ? [] : [toLocalDay(previous)]), toLocalDay(EARLY)]),
        ])
        expect(trace).toContain(`run:update:${JSON.stringify([EARLY, NOW, 'p', EARLY])}`)
        return dates
      })
    },
  )

  it('does not prepare an unused broken UPDATE when there is no AC', () => {
    compare(({ db, update, events, trace }) => {
      seedProblem(db, 'p', 'solved', EARLY)
      db.exec('ALTER TABLE problems RENAME COLUMN updated_at TO unused_updated_at')
      db.pragma('query_only = ON')
      const stop = traceStatements(db, trace)
      try {
        expect(update('p')).toEqual([toLocalDay(EARLY)])
      } finally {
        stop()
      }
      expect(trace).not.toContain('prepare:update')
      expect(events).toEqual([])
    })
  })

  it.each(['equal', 'earlier', 'orphan'])(
    'actually executes no-match UPDATE under readonly: %s',
    (kind) => {
      compare(({ db, update, events, trace }) => {
        if (kind !== 'orphan')
          seedProblem(db, 'p', 'attempted', kind === 'equal' ? EARLY : EARLY - 1)
        else db.pragma('foreign_keys = OFF')
        seedSubmission(db)
        db.pragma('query_only = ON')
        const stop = traceStatements(db, trace)
        let result
        try {
          result = outcome(() => update('p'))
        } finally {
          stop()
        }
        expect(result).toHaveProperty('error.message', 'attempt to write a readonly database')
        expect(trace).toContain('prepare:update')
        expect(trace.some((entry) => entry.startsWith('run:update:'))).toBe(true)
        expect(trace.some((entry) => entry.startsWith('day:'))).toBe(false)
        expect(events).toEqual([])
        return result
      })
    },
  )
})

describe.each(['append', 'recompute'] as const)('%s shared raw/native contracts', (mode) => {
  it.each([0, -1, 1.75, 8640000000000001, Number.MAX_SAFE_INTEGER + 1, 'diagnostic-text'])(
    'preserves raw instant %s and omits only invalid days',
    (instant) => {
      compare(({ db, update, recompute, events, clockCalls }) => {
        seedProblem(db, 'p', 'unknown', null)
        seedSubmission(db, 'p', instant)
        const clock = vi
          .spyOn(Date, 'now')
          .mockReturnValue(typeof instant === 'number' ? instant : 1.75)
        try {
          const dates = mode === 'append' ? update('p') : recompute(['p'])
          expect(firstState(db)).toEqual({
            status: 'solved',
            first_solved_at: instant,
            updated_at: typeof instant === 'number' ? instant : 1.75,
          })
          expect(dates).toEqual(instant === 0 || instant === -1 ? [toLocalDay(instant)] : [])
          expect(events).toEqual([CHANGE])
          expect(clockCalls()).toBe(1)
          return {
            dates,
            storage: db
              .prepare(
                'SELECT typeof(first_solved_at) AS first_ac, typeof(updated_at) AS updated FROM problems',
              )
              .all(),
          }
        } finally {
          clock.mockReturnValue(NOW)
        }
      })
    },
  )

  it.each(['', "q'_%\\\u2603", '\u0000literal', '\ud800'])(
    'preserves exact bound IDs %j, not LIKE or normalization',
    (id) => {
      compare(({ db, update, recompute }) => {
        seedProblem(db, id)
        seedProblem(db, 'other')
        seedSubmission(db, id, 0, 'AC', null, 0)
        seedSubmission(db, 'other', EARLY, 'WA', 'other')
        const dates = mode === 'append' ? update(id) : recompute([id])
        expect(firstState(db, id)).toEqual({
          status: 'solved',
          first_solved_at: 0,
          updated_at: NOW,
        })
        expect(firstState(db, 'other')).toEqual({
          status: 'unknown',
          first_solved_at: null,
          updated_at: 12,
        })
        return dates
      })
    },
  )

  it.each(['audit', 'IGNORE', 'FAIL', 'ABORT'])(
    'keeps %s trigger effects and three UPDATE OF targets',
    (trigger) => {
      compare(({ db, update, recompute, events, trace }) => {
        seedProblem(db, 'p', 'visited', LATE)
        seedSubmission(db)
        installAudit(db, trigger)
        const result = outcome(() => (mode === 'append' ? update('p') : recompute(['p'])))
        const audit = auditRows(db)
        if (trigger === 'audit') {
          expect(audit).toHaveLength(5)
          expect(events).toEqual([CHANGE])
          expect(result.value).toEqual([toLocalDay(LATE), toLocalDay(EARLY)])
          expect(trace).toEqual(['event', `day:${LATE}`, `day:${EARLY}`])
        } else {
          expect(audit).toHaveLength(trigger === 'ABORT' ? 0 : 1)
          expect(events).toEqual([])
          expect(firstState(db)).toEqual({
            status: 'visited',
            first_solved_at: LATE,
            updated_at: 12,
          })
          if (trigger === 'IGNORE')
            expect(result.value).toEqual([toLocalDay(LATE), toLocalDay(EARLY)])
          else {
            expect(result.error).toEqual({
              name: 'SqliteError',
              message: 'first-ac rejected',
              code: 'SQLITE_CONSTRAINT_TRIGGER',
            })
            expect(trace).toEqual([])
          }
        }
        return { result, audit }
      })
    },
  )

  it('keeps event before day conversion and snapshot values despite a reentrant listener', () => {
    compare(({ db, update, recompute, trace, events }) => {
      seedProblem(db, 'p', 'unknown', LATE)
      seedSubmission(db)
      const observed: unknown[] = []
      const unsubscribe = subscribeDataChanges(() => {
        observed.push(firstState(db))
        db.prepare('UPDATE problems SET first_solved_at = ? WHERE id = ?').run(0, 'p')
        db.prepare('UPDATE submissions SET submitted_at = ?').run(0)
        trace.push('listener')
      })
      try {
        const dates = mode === 'append' ? update('p') : recompute(['p'])
        expect(dates).toEqual([toLocalDay(LATE), toLocalDay(EARLY)])
        expect(observed).toEqual([{ status: 'solved', first_solved_at: EARLY, updated_at: NOW }])
        expect(trace).toEqual(['event', 'listener', `day:${LATE}`, `day:${EARLY}`])
        expect(events).toEqual([CHANGE])
        return { dates, observed }
      } finally {
        unsubscribe()
      }
    })
  })

  it('keeps early unwrapped transaction events and guards subscriber failures', () => {
    compare(({ db, update, recompute, events }) => {
      seedProblem(db)
      seedSubmission(db)
      let observedTransaction = false
      const unsubscribe = subscribeDataChanges(() => {
        observedTransaction = db.inTransaction
        throw new Error('listener failure')
      })
      try {
        const result = outcome(() =>
          db.transaction(() => {
            mode === 'append' ? update('p') : recompute(['p'])
            throw new Error('unwrapped rollback')
          })(),
        )
        expect(result.error?.message).toBe('unwrapped rollback')
        expect(observedTransaction).toBe(true)
        expect(events).toEqual([CHANGE])
        expect(firstState(db)?.first_solved_at).toBe(null)
        return result
      } finally {
        unsubscribe()
      }
    })
  })

  it.each(['commit', 'rollback', 'inner-rollback', 'commit-failure'])(
    'retains caller-owned native transaction: %s',
    (transactionMode) => {
      compare(({ db, update, recompute, events }) => {
        seedProblem(db)
        seedProblem(db, 'nested')
        seedSubmission(db)
        seedSubmission(db, 'nested', LATE, 'AC', 'nested')
        if (transactionMode === 'commit-failure')
          db.exec(`CREATE TRIGGER deferred_first_ac AFTER UPDATE ON problems BEGIN
        INSERT INTO submissions (id, problem_id, platform, platform_submission_id, verdict, submitted_at, created_at, updated_at)
        VALUES ('deferred-' || NEW.id, 'missing', 'deferred', NEW.id, 'WA', 0, 0, 0);
      END;`)
        let callbackFinished = false
        const result = outcome(() =>
          withDataChangeTransaction(() =>
            db.transaction(() => {
              if (transactionMode === 'commit-failure') db.pragma('defer_foreign_keys = ON')
              mode === 'append' ? update('p') : recompute(['p'])
              expect(events).toEqual([])
              const nested = () =>
                withDataChangeTransaction(() =>
                  db.transaction(() => {
                    mode === 'append' ? update('nested') : recompute(['nested'])
                    if (transactionMode === 'inner-rollback') throw new Error('inner rollback')
                  })(),
                )
              if (transactionMode === 'inner-rollback') expect(nested).toThrow('inner rollback')
              else nested()
              expect(events).toEqual([])
              if (transactionMode === 'rollback') throw new Error('outer rollback')
              callbackFinished = true
            })(),
          ),
        )
        const commits = transactionMode === 'commit' || transactionMode === 'inner-rollback'
        expect(firstState(db)?.first_solved_at).toBe(commits ? EARLY : null)
        expect(firstState(db, 'nested')?.first_solved_at).toBe(
          transactionMode === 'commit' ? LATE : null,
        )
        expect(events).toEqual(commits ? [CHANGE] : [])
        expect(db.inTransaction).toBe(false)
        if (transactionMode === 'commit-failure') {
          expect(callbackFinished).toBe(true)
          expect(result.error).toEqual({
            name: 'SqliteError',
            message: 'FOREIGN KEY constraint failed',
            code: 'SQLITE_CONSTRAINT_FOREIGNKEY',
          })
          expect(db.prepare('SELECT * FROM submissions').all()).toHaveLength(2)
        }
        return { result, callbackFinished }
      })
    },
  )
})

describe('recomputed submission state frozen behavior', () => {
  it.each(['unknown', 'solved', 'attempted', 'visited', 'custom'])(
    'uses empty aggregate truthfully for prior status %s',
    (status) => {
      compare(({ db, recompute, events, trace, clockCalls }) => {
        seedProblem(db, 'p', status, status === 'solved' ? 0 : null)
        const stop = traceStatements(db, trace)
        let dates
        try {
          dates = recompute(['missing', 'p', 'p'])
        } finally {
          stop()
        }
        const changed = status !== 'unknown' && status !== 'visited'
        expect(firstState(db)).toEqual({
          status: status === 'unknown' ? 'unknown' : 'visited',
          first_solved_at: null,
          updated_at: changed ? NOW : 12,
        })
        expect(dates).toEqual(status === 'solved' ? [toLocalDay(0)] : [])
        expect(events).toEqual(changed ? [CHANGE] : [])
        expect(trace.filter((entry) => entry.startsWith('get:aggregate:'))).toEqual([
          'get:aggregate:["p"]',
        ])
        expect(trace.filter((entry) => entry.startsWith('run:update:'))).toHaveLength(1)
        expect(clockCalls()).toBe(1)
        return dates
      })
    },
  )

  it('counts NULL/empty child IDs, wrong-case AC and tombstones without fixing null parents', () => {
    compare(({ db, recompute, events }) => {
      seedProblem(db, 'p', 'solved', 0, 0)
      seedProblem(db, '', 'unknown', null, 0)
      seedProblem(db, null, 'unknown', null, 0)
      seedSubmission(db, 'p', EARLY, 'ac', null, 0)
      seedSubmission(db, '', LATE, 'WA', '', 0)
      seedSubmission(db, null, LATE, 'AC', 'unattached')
      const dates = recompute(['p', '', 'missing'])
      expect(firstState(db)?.status).toBe('attempted')
      expect(firstState(db, '')?.status).toBe('attempted')
      expect(events).toEqual([CHANGE, CHANGE])
      expect(dates).toEqual([toLocalDay(0)])
      return dates
    })
  })

  it('moves first solves earlier/later, clears replaced AC and deduplicates old/new dates in input order', () => {
    compare(({ db, recompute, events, trace }) => {
      seedProblem(db, 'later', 'solved', EARLY)
      seedProblem(db, 'earlier', 'solved', LATE)
      seedProblem(db, 'clear', 'solved', EARLY)
      seedProblem(db, 'same', 'solved', EARLY)
      seedSubmission(db, 'later', LATE, 'AC', 's1')
      seedSubmission(db, 'earlier', EARLY, 'AC', 's2')
      seedSubmission(db, 'clear', 0, 'WA', 's3')
      seedSubmission(db, 'same', EARLY, 'AC', 's4')
      const stop = traceStatements(db, trace)
      let dates
      try {
        dates = recompute(
          iterable(trace, ['later', 'earlier', 'later', 'clear', 'same', 'missing']),
        )
      } finally {
        stop()
      }
      expect(dates).toEqual([toLocalDay(EARLY), toLocalDay(LATE)])
      expect(firstState(db, 'later')?.first_solved_at).toBe(LATE)
      expect(firstState(db, 'earlier')?.first_solved_at).toBe(EARLY)
      expect(firstState(db, 'clear')).toEqual({
        status: 'attempted',
        first_solved_at: null,
        updated_at: NOW,
      })
      expect(firstState(db, 'same')?.updated_at).toBe(12)
      expect(events).toEqual([CHANGE, CHANGE, CHANGE])
      expect(trace.slice(0, 5)).toEqual([
        'prepare:parent',
        'prepare:aggregate',
        'prepare:update',
        'iterator:get',
        'iterator:start',
      ])
      expect(trace.indexOf('iterator:end')).toBeLessThan(trace.indexOf('get:parent:["later"]'))
      expect(trace.filter((entry) => entry.startsWith('run:update:'))).toEqual([
        `run:update:${JSON.stringify(['solved', LATE, NOW, 'later', 'solved', LATE])}`,
        `run:update:${JSON.stringify(['solved', EARLY, NOW, 'earlier', 'solved', EARLY])}`,
        `run:update:${JSON.stringify(['attempted', null, NOW, 'clear', 'attempted', null])}`,
        `run:update:${JSON.stringify(['solved', EARLY, NOW, 'same', 'solved', EARLY])}`,
      ])
      return dates
    })
  })

  it('preserves local-day boundaries around spring/fall DST and same-day deduplication', () => {
    compare(({ db, recompute }) => {
      const instants = [
        '2026-03-08T01:59:59-05:00',
        '2026-03-08T03:00:00-04:00',
        '2026-11-01T01:30:00-04:00',
        '2026-11-01T01:30:00-05:00',
      ].map(Date.parse)
      for (const [index, instant] of instants.entries()) {
        seedProblem(db, `p${index}`, 'solved', instant + 86400000)
        seedSubmission(db, `p${index}`, instant, 'AC', `s${index}`)
      }
      const dates = recompute(['p2', 'p0', 'p3', 'p1', 'p2'])
      const expected: string[] = []
      for (const index of [2, 0, 3, 1]) {
        const instant = instants[index]
        assert.ok(instant !== undefined)
        expected.push(toLocalDay(instant + 86400000), toLocalDay(instant))
      }
      expect(dates).toEqual([...new Set(expected)])
      return dates
    })
  })

  it('prepares three statements for empty readonly input before the iterator', () => {
    compare(({ db, recompute, events, trace, clockCalls }) => {
      db.pragma('query_only = ON')
      const stop = traceStatements(db, trace)
      try {
        expect(recompute(iterable(trace, []))).toEqual([])
      } finally {
        stop()
      }
      expect(trace).toEqual([
        'prepare:parent',
        'prepare:aggregate',
        'prepare:update',
        'iterator:get',
        'iterator:start',
        'iterator:end',
      ])
      expect(events).toEqual([])
      expect(clockCalls()).toBe(1)
    })
  })

  it.each([1, 2, 3])(
    'propagates prepare %s identity before touching even an empty iterable',
    (position) => {
      compare(({ db, recompute, trace, events }) => {
        const failure = new Error('prepare sentinel')
        const stop = traceStatements(db, trace, position, failure)
        let caught: unknown
        try {
          recompute(iterable(trace, []))
        } catch (error) {
          caught = error
        } finally {
          stop()
        }
        expect(caught).toBe(failure)
        expect(trace).toEqual(
          ['prepare:parent', 'prepare:aggregate', 'prepare:update'].slice(0, position),
        )
        expect(events).toEqual([])
      })
    },
  )

  it.each(['getter', 'after-yield'])(
    'consumes the entire throwing iterable before any parent query: %s',
    (kind) => {
      compare(({ db, recompute, trace, events }) => {
        seedProblem(db)
        seedSubmission(db)
        const failure = new Error('iterator sentinel')
        const ids =
          kind === 'after-yield'
            ? iterable(trace, ['p'], failure)
            : {
                get [Symbol.iterator](): () => Iterator<string> {
                  trace.push('iterator:get')
                  throw failure
                },
              }
        const stop = traceStatements(db, trace)
        let caught: unknown
        try {
          recompute(ids)
        } catch (error) {
          caught = error
        } finally {
          stop()
        }
        expect(caught).toBe(failure)
        expect(trace.slice(0, 4)).toEqual([
          'prepare:parent',
          'prepare:aggregate',
          'prepare:update',
          'iterator:get',
        ])
        expect(trace.some((entry) => entry.startsWith('get:') || entry.startsWith('run:'))).toBe(
          false,
        )
        expect(firstState(db)?.first_solved_at).toBe(null)
        expect(events).toEqual([])
      })
    },
  )

  it('runs a readonly no-op for an existing parent, but skips a missing parent', () => {
    compare(({ db, recompute, events, trace }) => {
      seedProblem(db)
      db.pragma('query_only = ON')
      const stop = traceStatements(db, trace)
      let result
      try {
        expect(recompute(['missing'])).toEqual([])
        result = outcome(() => recompute(['p']))
      } finally {
        stop()
      }
      expect(result.error?.message).toBe('attempt to write a readonly database')
      expect(trace.filter((entry) => entry.startsWith('run:'))).toHaveLength(1)
      expect(events).toEqual([])
      return result
    })
  })

  it('retains earlier autocommit rows/events when a later ID raises FAIL', () => {
    compare(({ db, recompute, events, trace }) => {
      seedProblem(db)
      seedProblem(db, 'bad')
      seedSubmission(db)
      seedSubmission(db, 'bad', LATE, 'AC', 'bad')
      db.exec(`CREATE TABLE partial_audit (id TEXT);
        CREATE TRIGGER partial_failure BEFORE UPDATE ON problems BEGIN
          INSERT INTO partial_audit VALUES (NEW.id);
          SELECT CASE WHEN NEW.id='bad' THEN RAISE(FAIL,'later rejected') END;
        END;`)
      const result = outcome(() => recompute(['p', 'bad']))
      expect(result.error?.message).toBe('later rejected')
      expect(firstState(db)?.status).toBe('solved')
      expect(firstState(db, 'bad')?.status).toBe('unknown')
      expect(events).toEqual([CHANGE])
      expect(trace).toEqual(['event', `day:${EARLY}`])
      const audit = db.prepare('SELECT * FROM partial_audit ORDER BY rowid').all()
      expect(audit).toEqual([{ id: 'p' }, { id: 'bad' }])
      return { result, audit }
    })
  })

  it('reads subsequent IDs after synchronous earlier listeners, not in a prefetched batch', () => {
    compare(({ db, recompute, events, trace }) => {
      seedProblem(db)
      seedProblem(db, 'next')
      seedSubmission(db)
      seedSubmission(db, 'next', EARLY, 'AC', 'next')
      let calls = 0
      const unsubscribe = subscribeDataChanges(() => {
        if (++calls === 1) {
          db.prepare("UPDATE submissions SET submitted_at = ? WHERE problem_id = 'next'").run(LATE)
          trace.push('listener:next')
        }
      })
      try {
        const dates = recompute(['p', 'next'])
        expect(firstState(db, 'next')?.first_solved_at).toBe(LATE)
        expect(dates).toEqual([toLocalDay(EARLY), toLocalDay(LATE)])
        expect(trace).toEqual(['event', 'listener:next', `day:${EARLY}`, 'event', `day:${LATE}`])
        expect(events).toEqual([CHANGE, CHANGE])
        return dates
      } finally {
        unsubscribe()
      }
    })
  })
})

describe('first-AC failure and connection boundaries', () => {
  it.each([1, 2, 3])(
    'append failure at prepare %s keeps exact error identity and earlier read order',
    (position) => {
      compare(({ db, update, trace, events }) => {
        seedProblem(db)
        seedSubmission(db)
        const failure = new Error('prepare sentinel')
        const stop = traceStatements(db, trace, position, failure)
        let caught: unknown
        try {
          update('p')
        } catch (error) {
          caught = error
        } finally {
          stop()
        }
        expect(caught).toBe(failure)
        const expected = [
          'prepare:parent',
          'get:parent:["p"]',
          'prepare:ac',
          'get:ac:["p"]',
          'prepare:update',
        ]
        expect(trace).toEqual(expected.slice(0, position * 2 - 1))
        expect(events).toEqual([])
      })
    },
  )

  it.each(['append', 'recompute'] as const)(
    'preserves native failure stage for damaged %s SQL without promising qualified error spelling',
    (mode) => {
      for (const column of ['first_solved_at', 'submitted_at', 'updated_at']) {
        compare(({ db, update, recompute, trace, events, original }) => {
          seedProblem(db)
          seedSubmission(db)
          const table = column === 'submitted_at' ? 'submissions' : 'problems'
          db.exec(`ALTER TABLE ${table} RENAME COLUMN ${column} TO damaged_column`)
          const stop = traceStatements(db, trace)
          let result
          try {
            result = outcome(() =>
              mode === 'append' ? update('p') : recompute(iterable(trace, [])),
            )
          } finally {
            stop()
          }
          assert.ok(result.error)
          expect(result.error.name).toBe('SqliteError')
          expect(result.error.code).toBe('SQLITE_ERROR')
          if (original) expect(result.error.message).toBe(`no such column: ${column}`)
          else {
            // Quoted/qualified generated identifiers can change damaged-DDL wording only.
            expect(result.error.message).toMatch(/^no such column:/)
            expect(result.error.message).toContain(column)
          }
          expect(trace).not.toContain('iterator:get')
          expect(trace.some((entry) => entry.startsWith('run:') || entry.startsWith('day:'))).toBe(
            false,
          )
          expect(events).toEqual([])
          return { name: result.error.name, code: result.error.code }
        })
      }
    },
  )

  it('leaves an earlier submission insert/event committed when first-AC update fails', () => {
    compare(({ db, update, events }) => {
      seedProblem(db)
      db.exec(
        "CREATE TRIGGER reject_state BEFORE UPDATE ON problems BEGIN SELECT RAISE(ABORT,'state rejected'); END;",
      )
      // The caller owns this autocommit sequence; compare stable rows rather than generated UUIDs.
      expect(
        upsertSubmission({
          problemId: 'p',
          platform: 'test',
          platformSubmissionId: 'batch',
          verdict: 'AC',
          submittedAt: EARLY,
        }),
      ).toBe(true)
      db.prepare("UPDATE submissions SET id = 'stable-batch-id'").run()
      const result = outcome(() => update('p'))
      expect(result.error?.message).toBe('state rejected')
      expect(events).toEqual([{ tables: ['submissions', 'problems', 'stats'] }])
      expect(firstState(db)?.status).toBe('unknown')
      return result
    })
  })

  it('uses the current connection after close/reinit with no cached adapter', () => {
    compare(({ db, update, recompute, events }) => {
      seedProblem(db)
      seedSubmission(db)
      expect(update('p')).toEqual([toLocalDay(EARLY)])
      closeDb()
      const missing = outcome(() => recompute([]))
      expect(missing).toHaveProperty('error')
      const next = initDbAtPath(':memory:')
      seedProblem(next, 'new')
      seedSubmission(next, 'new', 0)
      expect(update('p')).toEqual([])
      expect(recompute(['new'])).toEqual([toLocalDay(0)])
      expect(events).toEqual([CHANGE, CHANGE])
      return missing
    })
  })
})
