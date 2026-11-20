import assert from 'node:assert/strict'
import { localDayBounds, toLocalDay } from '../../src/shared/time'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection.ts'
import { deleteProblem } from '../../electron/db/repositories/problemRepository.ts'
import { recomputeDailyStatsForDates } from '../../electron/db/repositories/statsRepository.ts'
import type { Logger } from '../../electron/shared/logger.ts'
import {
  emitDataChanged,
  subscribeDataChanges,
  withDataChangeTransaction,
} from '../../electron/shared/dataEvents'
import type { DataChangedPayload } from '../../src/shared/types/data'
import { runOriginalProblemDelete } from './problem-delete-oracle'

const NOW = new Date(2026, 2, 8, 12, 34, 56, 789).getTime()
const CHANGE = { tables: ['problems', 'submissions', 'stats'] }

let temporaryDirectory = ''

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-delete-problem-'))
  initDbAtPath(path.join(temporaryDirectory, 'delete-problem.sqlite'))
})

afterEach(() => {
  closeDb()
  vi.restoreAllMocks()
  vi.useRealTimers()
  expect(
    path
      .resolve(temporaryDirectory)
      .startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-delete-problem-`),
  ).toBe(true)
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
})

function insertProblem(
  db: Database.Database,
  id: string | null,
  platformProblemId: string,
  firstSolvedAt: number | null = null,
): void {
  const now = new Date(2026, 7, 18, 8, 0).getTime()
  db.prepare(
    `
    INSERT INTO problems (
      id, platform, platform_problem_id, canonical_url, status,
      first_seen_at, first_solved_at, created_at, updated_at
    ) VALUES (?, 'codeforces', ?, ?, 'visited', ?, ?, ?, ?)
  `,
  ).run(
    id,
    platformProblemId,
    `https://codeforces.com/problemset/problem/${platformProblemId}`,
    now,
    firstSolvedAt,
    now,
    now,
  )
}

function insertVisit(
  db: Database.Database,
  id: string | null,
  problemId: string,
  enteredAt: number,
  durationSeconds: number,
  activeSeconds: number,
): void {
  db.prepare(
    `
    INSERT INTO problem_visits (
      id, problem_id, platform, url, entered_at, left_at,
      duration_seconds, active_seconds, created_at, updated_at
    ) VALUES (?, ?, 'codeforces', ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    problemId,
    `https://codeforces.com/problemset/problem/${problemId}`,
    enteredAt,
    enteredAt,
    durationSeconds,
    activeSeconds,
    enteredAt,
    enteredAt,
  )
}

function insertSubmission(
  db: Database.Database,
  id: string | null,
  problemId: string | null,
  submittedAt: number,
  verdict: 'AC' | 'WA',
): void {
  db.prepare(
    `
    INSERT INTO submissions (
      id, problem_id, platform, platform_submission_id, verdict,
      submitted_at, created_at, updated_at
    ) VALUES (?, ?, 'codeforces', ?, ?, ?, ?, ?)
  `,
  ).run(id, problemId, id ?? 'null-submission-id', verdict, submittedAt, submittedAt, submittedAt)
}

function insertActivity(
  db: Database.Database,
  id: string | null,
  problemId: string | null,
  occurredAt: number,
): void {
  db.prepare(
    `
    INSERT INTO activity_events (
      id, event_type, occurred_at, local_day, problem_id, platform, created_at
    ) VALUES (?, 'visit_start', ?, ?, ?, 'codeforces', ?)
  `,
  ).run(id, occurredAt, toLocalDay(occurredAt), problemId, occurredAt)
}

interface DailyStatsRow {
  active_seconds: number
  duration_seconds: number
  visited_problem_count: number
  solved_problem_count: number
  submission_count: number
  ac_submission_count: number
}

function dailyStats(db: Database.Database, day: string): DailyStatsRow {
  const row = db
    .prepare<[string], DailyStatsRow>(
      `
    SELECT active_seconds, duration_seconds, visited_problem_count,
      solved_problem_count, submission_count, ac_submission_count
    FROM user_daily_stats WHERE local_day = ?
  `,
    )
    .get(day)
  assert.ok(row)
  return row
}

class MemoryLogger implements Logger {
  readonly warnings: Array<{ message: string; data: unknown[] }> = []

  debug(): void {}
  info(): void {}
  warn(message: string, ...data: unknown[]): void {
    this.warnings.push({ message, data })
  }
  error(): void {}
  fatal(): void {}
  getLogFilePath(): string | null {
    return null
  }
}

describe('deleteProblem', () => {
  it('recomputes every affected daily-stat date from the remaining facts', () => {
    const db = getDb()
    insertProblem(db, 'target', '1900A', new Date(2026, 7, 20, 8, 0).getTime())
    insertProblem(db, 'retained', '1900B', new Date(2026, 7, 20, 9, 0).getTime())
    insertVisit(db, 'target-visit', 'target', new Date(2026, 7, 18, 10, 0).getTime(), 100, 80)
    insertVisit(db, 'retained-visit', 'retained', new Date(2026, 7, 18, 11, 0).getTime(), 60, 50)
    insertSubmission(
      db,
      'target-submission',
      'target',
      new Date(2026, 7, 19, 10, 0).getTime(),
      'AC',
    )
    insertSubmission(
      db,
      'retained-submission',
      'retained',
      new Date(2026, 7, 19, 11, 0).getTime(),
      'WA',
    )
    insertActivity(db, 'target-activity', 'target', new Date(2026, 7, 21, 10, 0).getTime())

    const days = ['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']
    recomputeDailyStatsForDates(days)
    db.prepare(
      `
      UPDATE user_daily_stats
      SET active_seconds = 99, duration_seconds = 99, visited_problem_count = 99,
        solved_problem_count = 99, submission_count = 99, ac_submission_count = 99
      WHERE local_day = '2026-08-21'
    `,
    ).run()

    expect(deleteProblem('target')).toBe(true)

    expect(dailyStats(db, '2026-08-18')).toMatchObject({
      active_seconds: 50,
      duration_seconds: 60,
      visited_problem_count: 1,
    })
    expect(dailyStats(db, '2026-08-19')).toMatchObject({
      submission_count: 1,
      ac_submission_count: 0,
    })
    expect(dailyStats(db, '2026-08-20').solved_problem_count).toBe(1)
    expect(dailyStats(db, '2026-08-21')).toEqual({
      active_seconds: 0,
      duration_seconds: 0,
      visited_problem_count: 0,
      solved_problem_count: 0,
      submission_count: 0,
      ac_submission_count: 0,
    })
  })

  it('rolls back earlier deletes when a later table delete fails', () => {
    const db = getDb()
    insertProblem(db, 'target', '2000A')
    insertVisit(db, 'target-visit', 'target', new Date(2026, 7, 18, 10, 0).getTime(), 100, 80)
    insertSubmission(
      db,
      'target-submission',
      'target',
      new Date(2026, 7, 18, 10, 1).getTime(),
      'AC',
    )
    insertActivity(db, 'target-activity', 'target', new Date(2026, 7, 18, 10, 0).getTime())
    db.exec(`
      CREATE TRIGGER reject_problem_visit_delete
      BEFORE DELETE ON problem_visits
      BEGIN
        SELECT RAISE(ABORT, 'problem visit delete rejected');
      END;
    `)

    expect(() => deleteProblem('target')).toThrow(/problem visit delete rejected/)

    for (const table of ['problems', 'problem_visits', 'submissions', 'activity_events']) {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
      expect(row.count).toBe(1)
    }
  })

  it('logs a post-commit stats failure without reporting the successful delete as failed', () => {
    const db = getDb()
    const logger = new MemoryLogger()
    insertProblem(db, 'target', '2100A')
    insertVisit(db, 'target-visit', 'target', new Date(2026, 7, 18, 10, 0).getTime(), 100, 80)
    recomputeDailyStatsForDates(['2026-08-18'])
    db.exec(`
      CREATE TRIGGER reject_daily_stats_update
      BEFORE UPDATE ON user_daily_stats
      BEGIN
        SELECT RAISE(ABORT, 'daily stats update rejected');
      END;
    `)

    expect(deleteProblem('target', logger)).toBe(true)
    expect(db.prepare('SELECT COUNT(*) AS count FROM problems').get()).toEqual({ count: 0 })
    expect(logger.warnings).toHaveLength(1)
    expect(logger.warnings[0].message).toBe('problem.delete-stats-recompute-failed')
    expect(logger.warnings[0].data[0]).toMatchObject({
      problemId: 'target',
      affectedDates: ['2026-08-18'],
    })
  })
})

function rawState(): Record<string, Record<string, unknown>[]> {
  const database = getDb()
  const tables = database
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name",
    )
    .all()
  return Object.fromEntries(
    tables.map(({ name }) => [
      name,
      database.prepare<[], Record<string, unknown>>(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
    ]),
  )
}

function errorDetails(error: unknown): { name: string; message: string; code?: unknown } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...('code' in error ? { code: error.code } : {}),
    }
  }
  return { name: typeof error, message: String(error) }
}

interface DeleteScenario {
  db: Database.Database
  remove: (id: string) => boolean
  events: DataChangedPayload[]
  transactionStates: boolean[]
  logger: MemoryLogger
  resetObservations: () => void
}

function compareDelete(run: (scenario: DeleteScenario) => void): void {
  const outcomes: unknown[] = []
  closeDb()
  for (const implementation of ['original', 'drizzle']) {
    const db = initDbAtPath(':memory:')
    const logger = new MemoryLogger()
    const events: DataChangedPayload[] = []
    const transactionStates: boolean[] = []
    const results: unknown[] = []
    const unsubscribe = subscribeDataChanges((payload) => {
      events.push(payload)
      transactionStates.push(getDb().inTransaction)
    })
    try {
      run({
        db,
        logger,
        events,
        transactionStates,
        remove: (id) => {
          try {
            const result =
              implementation === 'original'
                ? runOriginalProblemDelete(getDb(), id, logger)
                : deleteProblem(id, logger)
            results.push({ result })
            return result
          } catch (error) {
            results.push({ error: errorDetails(error) })
            throw error
          }
        },
        resetObservations: () => {
          events.length = 0
          transactionStates.length = 0
          logger.warnings.length = 0
        },
      })
      outcomes.push({
        rows: rawState(),
        results,
        events,
        transactionStates,
        warnings: logger.warnings.map(({ message, data }) => ({
          message,
          data: JSON.parse(
            JSON.stringify(data, (_key, value: unknown) =>
              value instanceof Error ? errorDetails(value) : value,
            ),
          ),
        })),
        inTransaction: getDb().inTransaction,
      })
      expect(
        getDb().prepare("SELECT name FROM sqlite_schema WHERE name='__drizzle_migrations'").get(),
      ).toBeUndefined()
    } finally {
      unsubscribe()
      closeDb()
    }
  }
  expect(outcomes[1]).toEqual(outcomes[0])
}

function seedFacts(db: Database.Database, id = 'target', instant = NOW): void {
  insertProblem(db, id, 'target-key', instant)
  insertVisit(db, 'target-visit', id, instant, 100, 80)
  insertSubmission(db, 'target-submission', id, instant, 'AC')
  insertActivity(db, 'target-activity', id, instant)
  db.prepare(
    'INSERT INTO notes(id,problem_id,title,file_path,created_at,updated_at) VALUES (?,?,?,?,?,?)',
  ).run('target-note', id, 'Retained note', 'synthetic.md', instant, instant)
}

function expectNoObservations(scenario: Pick<DeleteScenario, 'events' | 'logger'>): void {
  expect(scenario.events).toEqual([])
  expect(scenario.logger.warnings).toEqual([])
}

describe('problem deletion original-SQL equivalence', () => {
  it('returns false for an empty or missing parent without events or recomputation', () => {
    compareDelete((scenario) => {
      expect(scenario.remove('missing')).toBe(false)
      seedFacts(scenario.db)
      const before = rawState()
      expect(scenario.remove('other')).toBe(false)
      expect(rawState()).toEqual(before)
      expectNoObservations(scenario)
    })
  })

  it.each(['target', '', "literal_' OR 1=1 --_%"])(
    'binds the exact ID %j, leaves null IDs and notes, and deletes children with nullable own IDs',
    (id) => {
      compareDelete(({ db, remove, events, transactionStates }) => {
        seedFacts(db, id)
        insertProblem(db, null, 'null-parent')
        insertProblem(db, 'retained', 'retained-parent')
        db.exec(
          'UPDATE submissions SET id=NULL; UPDATE problem_visits SET id=NULL; UPDATE activity_events SET id=NULL',
        )
        insertSubmission(db, 'unlinked-submission', null, NOW, 'WA')
        insertActivity(db, 'unlinked-activity', null, NOW)
        expect(remove(id)).toBe(true)
        expect(db.prepare('SELECT id FROM problems ORDER BY rowid').all()).toEqual([
          { id: null },
          { id: 'retained' },
        ])
        expect(db.prepare('SELECT id FROM notes').all()).toEqual([{ id: 'target-note' }])
        expect(db.prepare('SELECT id FROM submissions').all()).toEqual([
          { id: 'unlinked-submission' },
        ])
        expect(db.prepare('SELECT id FROM problem_visits').all()).toEqual([])
        expect(db.prepare('SELECT id FROM activity_events').all()).toEqual([
          { id: 'unlinked-activity' },
        ])
        expect(events).toEqual([CHANGE, { tables: ['stats'] }])
        expect(transactionStates).toEqual([false, false])
        expect(remove(id)).toBe(false)
        expect(events).toHaveLength(2)
      })
    },
  )

  it('deletes matching orphan children despite false result, with no derived writes or events', () => {
    compareDelete((scenario) => {
      const { db, remove } = scenario
      seedFacts(db)
      db.pragma('foreign_keys = OFF')
      db.prepare('DELETE FROM problems WHERE id=?').run('target')
      db.pragma('foreign_keys = ON')
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(remove('target')).toBe(false)
      for (const table of [
        'submissions',
        'problem_visits',
        'activity_events',
        'user_daily_stats',
      ]) {
        expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 })
      }
      expect(db.prepare('SELECT id FROM notes').all()).toEqual([{ id: 'target-note' }])
      expectNoObservations(scenario)
    })
  })
  it('includes tombstones and all raw branches, using occurred_at not stored local_day', () => {
    compareDelete(({ db, remove, events, transactionStates, resetObservations }) => {
      const instants = [
        new Date(2026, 2, 7, 23, 59, 59, 999).getTime(),
        new Date(2026, 2, 8).getTime(),
        new Date(2026, 2, 9).getTime(),
        0,
      ]
      seedFacts(db, 'target', instants[3])
      db.prepare('UPDATE problem_visits SET entered_at=?, deleted_at=0').run(instants[0])
      db.prepare('UPDATE submissions SET submitted_at=?, deleted_at=0').run(instants[1])
      db.prepare(
        "UPDATE activity_events SET occurred_at=?, local_day='1900-01-01', deleted_at=0",
      ).run(instants[2])
      db.exec('UPDATE problems SET deleted_at=0')
      const days = [...new Set(instants.map(toLocalDay))].sort()
      recomputeDailyStatsForDates([...days, '1900-01-01'])
      db.exec(
        'UPDATE user_daily_stats SET visited_problem_count=99, solved_problem_count=99, submission_count=99',
      )
      resetObservations()
      expect(remove('target')).toBe(true)
      expect(events).toEqual([CHANGE, ...days.map(() => ({ tables: ['stats'] }))])
      expect(transactionStates).toEqual(events.map(() => false))
      for (const day of days)
        expect(dailyStats(db, day)).toMatchObject({
          visited_problem_count: 0,
          solved_problem_count: 0,
          submission_count: 0,
        })
      expect(dailyStats(db, '1900-01-01').visited_problem_count).toBe(99)
    })
  })

  it('deduplicates raw instants and local days, including a DST transition day', () => {
    compareDelete(({ db, remove, events }) => {
      const { start, end } = localDayBounds('2026-03-08')
      seedFacts(db, 'target', start)
      insertVisit(db, 'same-day-visit', 'target', end - 1, 10, 9)
      insertSubmission(db, 'same-instant', 'target', end - 1, 'WA')
      if (process.env.TZ === 'America/New_York') expect(end - start).toBe(23 * 60 * 60 * 1000)
      expect(remove('target')).toBe(true)
      expect(events).toEqual([CHANGE, { tables: ['stats'] }])
      expect(db.prepare('SELECT local_day FROM user_daily_stats').all()).toEqual([
        { local_day: '2026-03-08' },
      ])
    })
  })

  it('excludes a null first-solved instant and never recomputes when no dates exist', () => {
    compareDelete(({ db, remove, events }) => {
      insertProblem(db, 'target', 'nullable-solved')
      expect(remove('target')).toBe(true)
      expect(events).toEqual([CHANGE])
      expect(db.prepare('SELECT * FROM user_daily_stats').all()).toEqual([])
    })
  })
  for (const [table, column] of [
    ['problem_visits', 'entered_at'],
    ['submissions', 'submitted_at'],
    ['activity_events', 'occurred_at'],
    ['problems', 'first_solved_at'],
  ]) {
    it.each([
      { value: 1.75, name: 'TypeError', message: 'Timestamp must be integer milliseconds' },
      {
        value: 'not-an-instant',
        name: 'TypeError',
        message: 'Timestamp must be integer milliseconds',
      },
      {
        value: Number.MAX_SAFE_INTEGER + 1,
        name: 'TypeError',
        message: 'Timestamp must be integer milliseconds',
      },
      {
        value: 8640000000000001,
        name: 'RangeError',
        message: 'Timestamp is outside the Date range',
      },
    ])(`rejects raw ${table}.${column}=$value before any DELETE`, ({ value, name, message }) => {
      compareDelete((scenario) => {
        seedFacts(scenario.db)
        scenario.db.prepare(`UPDATE ${table} SET ${column}=?`).run(value)
        const before = rawState()
        let thrown: unknown
        try {
          scenario.remove('target')
        } catch (error) {
          thrown = error
        }
        expect(errorDetails(thrown)).toEqual({ name, message })
        expect(rawState()).toEqual(before)
        expectNoObservations(scenario)
      })
    })
  }

  it('still validates malformed orphan timestamps before deleting missing-parent children', () => {
    compareDelete((scenario) => {
      seedFacts(scenario.db)
      scenario.db.pragma('foreign_keys = OFF')
      scenario.db.exec("DELETE FROM problems; UPDATE activity_events SET occurred_at='broken'")
      scenario.db.pragma('foreign_keys = ON')
      const before = rawState()
      expect(() => scenario.remove('target')).toThrow('Timestamp must be integer milliseconds')
      expect(rawState()).toEqual(before)
      expectNoObservations(scenario)
    })
  })

  it('executes one distinct UNION and the exact child-before-parent DELETE order', () => {
    compareDelete(({ db, remove }) => {
      seedFacts(db)
      db.exec('CREATE TABLE delete_probe (name TEXT)')
      for (const table of ['submissions', 'problem_visits', 'activity_events', 'problems']) {
        db.exec(
          `CREATE TRIGGER observe_${table}_delete AFTER DELETE ON ${table} BEGIN INSERT INTO delete_probe VALUES ('${table}'); END`,
        )
      }
      const prepare = vi.spyOn(db, 'prepare')
      try {
        expect(remove('target')).toBe(true)
        const union = prepare.mock.calls
          .map(([statement]) => statement)
          .filter((statement) => /\bUNION\b/i.test(statement))
        expect(union).toHaveLength(1)
        expect(union[0].match(/\bUNION\b/gi)).toHaveLength(3)
        expect(union[0]).not.toMatch(/UNION ALL|CAST\(/i)
      } finally {
        prepare.mockRestore()
      }
      expect(db.prepare('SELECT * FROM delete_probe ORDER BY rowid').all()).toEqual(
        ['submissions', 'problem_visits', 'activity_events', 'problems'].map((name) => ({ name })),
      )
    })
  })

  it.each(['submissions', 'problem_visits', 'activity_events', 'problems'])(
    'rolls back all rows and events on a %s DELETE trigger failure',
    (table) => {
      compareDelete((scenario) => {
        seedFacts(scenario.db)
        scenario.db.exec(
          `CREATE TRIGGER reject_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, 'delete rejected'); END`,
        )
        const before = rawState()
        expect(() => scenario.remove('target')).toThrow('delete rejected')
        expect(rawState()).toEqual(before)
        expect(scenario.db.inTransaction).toBe(false)
        expectNoObservations(scenario)
      })
    },
  )

  it('rolls back a real deferred-FK COMMIT failure after the final DELETE finishes', () => {
    compareDelete((scenario) => {
      seedFacts(scenario.db)
      scenario.db.exec(
        "CREATE TABLE commit_probe(problem_id TEXT REFERENCES problems(id) DEFERRABLE INITIALLY DEFERRED); INSERT INTO commit_probe VALUES ('target')",
      )
      let deleted = false
      scenario.db.function('observe_delete', () => {
        deleted = true
        return 1
      })
      scenario.db.exec(
        'CREATE TRIGGER observe_parent AFTER DELETE ON problems BEGIN SELECT observe_delete(); END',
      )
      const before = rawState()
      expect(() => scenario.remove('target')).toThrow('FOREIGN KEY constraint failed')
      expect(deleted).toBe(true)
      expect(rawState()).toEqual(before)
      expect(scenario.db.inTransaction).toBe(false)
      expectNoObservations(scenario)
    })
  })
  it.each(['commit', 'callback-rollback', 'commit-failure'] as const)(
    'keeps inner deletion and statistics within the caller transaction: %s',
    (mode) => {
      compareDelete(({ db, remove, events, transactionStates }) => {
        seedFacts(db)
        db.exec(
          'CREATE TABLE outer_probe(problem_id TEXT REFERENCES problems(id) DEFERRABLE INITIALLY DEFERRED)',
        )
        const before = rawState()
        let callbackFinished = false
        const operation = () =>
          withDataChangeTransaction(() =>
            db.transaction(() => {
              expect(remove('target')).toBe(true)
              expect(db.prepare('SELECT * FROM problems').all()).toEqual([])
              expect(db.prepare('SELECT local_day FROM user_daily_stats').all()).toEqual([
                { local_day: toLocalDay(NOW) },
              ])
              expect(db.inTransaction).toBe(true)
              expect(events).toEqual([])
              callbackFinished = true
              if (mode === 'callback-rollback') throw new Error('outer rollback')
              if (mode === 'commit-failure') db.exec("INSERT INTO outer_probe VALUES ('missing')")
            })(),
          )
        if (mode === 'commit') {
          operation()
          expect(events).toEqual([CHANGE])
          expect(transactionStates).toEqual([false])
        } else {
          expect(operation).toThrow(
            mode === 'callback-rollback' ? 'outer rollback' : 'FOREIGN KEY constraint failed',
          )
          expect(rawState()).toEqual(before)
          expect(events).toEqual([])
        }
        expect(callbackFinished).toBe(true)
        expect(db.inTransaction).toBe(false)
      })
    },
  )

  it.each(['delete-failure', 'caller-savepoint-rollback'] as const)(
    'preserves unrelated outer work after a caught %s',
    (mode) => {
      compareDelete(({ db, remove, events }) => {
        seedFacts(db)
        db.exec('CREATE TABLE outer_probe(value TEXT)')
        if (mode === 'delete-failure')
          db.exec(
            "CREATE TRIGGER reject_parent BEFORE DELETE ON problems BEGIN SELECT RAISE(ABORT, 'delete rejected'); END",
          )
        const before = rawState()
        withDataChangeTransaction(() =>
          db.transaction(() => {
            db.exec("INSERT INTO outer_probe VALUES ('retained')")
            emitDataChanged(['sites'])
            expect(() =>
              withDataChangeTransaction(() =>
                db.transaction(() => {
                  expect(remove('target')).toBe(true)
                  throw new Error('savepoint rollback')
                })(),
              ),
            ).toThrow(mode === 'delete-failure' ? 'delete rejected' : 'savepoint rollback')
            expect(events).toEqual([])
            expect(rawState()).toEqual({ ...before, outer_probe: [{ value: 'retained' }] })
          })(),
        )
        expect(events).toEqual([{ tables: ['sites'] }])
        expect(db.inTransaction).toBe(false)
      })
    },
  )

  it('keeps deletion and first-day stats when the second sorted day fails, preserving later days', () => {
    compareDelete(({ db, remove, events, transactionStates, logger, resetObservations }) => {
      const days = ['2026-03-07', '2026-03-08', '2026-03-09']
      seedFacts(db, 'target', localDayBounds(days[2]).start)
      db.prepare('UPDATE problem_visits SET entered_at=?').run(localDayBounds(days[0]).start)
      db.prepare('UPDATE submissions SET submitted_at=?').run(localDayBounds(days[1]).start)
      recomputeDailyStatsForDates(days)
      db.exec('UPDATE user_daily_stats SET visited_problem_count=99')
      db.exec(
        "CREATE TRIGGER reject_second_day BEFORE UPDATE ON user_daily_stats WHEN NEW.local_day='2026-03-08' BEGIN SELECT RAISE(ABORT, 'second day rejected'); END",
      )
      resetObservations()
      expect(remove('target')).toBe(true)
      expect(db.prepare('SELECT * FROM problems').all()).toEqual([])
      expect(dailyStats(db, days[0]).visited_problem_count).toBe(0)
      expect(dailyStats(db, days[1]).visited_problem_count).toBe(99)
      expect(dailyStats(db, days[2]).visited_problem_count).toBe(99)
      expect(events).toEqual([CHANGE, { tables: ['stats'] }])
      expect(transactionStates).toEqual([false, false])
      expect(logger.warnings).toHaveLength(1)
      expect(logger.warnings[0]).toMatchObject({
        message: 'problem.delete-stats-recompute-failed',
        data: [{ problemId: 'target', affectedDates: days, error: expect.any(Error) }],
      })
    })
  })

  it('follows a reinitialized connection instead of caching an ORM adapter', () => {
    compareDelete(({ db, remove, events }) => {
      seedFacts(db)
      expect(remove('target')).toBe(true)
      closeDb()
      const next = initDbAtPath(':memory:')
      seedFacts(next, 'replacement', 0)
      expect(remove('replacement')).toBe(true)
      expect(next.prepare('SELECT * FROM problems').all()).toEqual([])
      expect(events).toEqual([CHANGE, { tables: ['stats'] }, CHANGE, { tables: ['stats'] }])
    })
  })
})
