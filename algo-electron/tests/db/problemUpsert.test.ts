import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import { upsertProblem } from '../../electron/db/repositories/problemRepository'
import {
  emitDataChanged,
  subscribeDataChanges,
  withDataChangeTransaction,
} from '../../electron/shared/dataEvents'
import type { ProblemIdentity } from '../../electron/shared/types'
import type { DataChangedPayload } from '../../src/shared/types/data'
import { runOriginalProblemUpsert } from './problem-upsert-oracle'

const NOW = 1768443630123
const CHINESE_TITLE = '\u4e2d\u6587\u9898\u76ee'
const CHANGE = { tables: ['problems', 'stats'] }

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
})

afterEach(() => {
  closeDb()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function identity(overrides: Partial<ProblemIdentity> = {}): ProblemIdentity {
  return {
    platform: 'codeforces',
    platformProblemId: '1000A',
    canonicalUrl: 'https://example.test/new',
    confidence: 'url',
    ...overrides,
  }
}

function seedProblem(
  options: {
    id?: string | null
    key?: string
    title?: string | null
    deletedAt?: number | null
  } = {},
): void {
  getDb()
    .prepare(
      `INSERT INTO problems (
        id, platform, platform_problem_id, canonical_url, title, status,
        contest_id, problem_index, source_platform, source_problem_id, difficulty, tags_json,
        first_seen_at, last_visited_at, first_solved_at, extra_json, created_at, updated_at, deleted_at
      ) VALUES (?, 'codeforces', ?, 'https://example.test/original', ?, 'solved',
        'old-contest', 'old-index', 'old-source', 'old-source-key', 'hard', '["graph"]',
        11, 12, 13, '{"retained":true}', 14, 15, ?)`,
    )
    .run(
      options.id === undefined ? 'existing' : options.id,
      options.key ?? '1000A',
      options.title === undefined ? 'Stored English title' : options.title,
      options.deletedAt ?? null,
    )
}

function readRows(): Record<string, unknown>[] {
  return getDb().prepare<[], Record<string, unknown>>('SELECT * FROM problems ORDER BY rowid').all()
}

function readRow(key = '1000A'): Record<string, unknown> {
  const row = getDb()
    .prepare<[string], Record<string, unknown>>(
      'SELECT * FROM problems WHERE platform_problem_id = ?',
    )
    .get(key)
  assert.ok(row)
  return row
}

type Scenario = {
  db: Database.Database
  upsert: (input: ProblemIdentity) => void
  events: DataChangedPayload[]
  transactionStates: boolean[]
  uuidCalls: () => number
}

function compareWithOriginal(run: (scenario: Scenario) => void): void {
  const outcomes = []
  for (const implementation of ['original', 'drizzle']) {
    vi.setSystemTime(NOW)
    let sequence = 0
    const uuid = vi
      .spyOn(crypto, 'randomUUID')
      .mockImplementation(() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`)
    const db = initDbAtPath(':memory:')
    const events: DataChangedPayload[] = []
    const transactionStates: boolean[] = []
    const unsubscribe = subscribeDataChanges((payload) => {
      events.push(payload)
      transactionStates.push(getDb().inTransaction)
    })
    try {
      run({
        db,
        upsert:
          implementation === 'original'
            ? (input) => runOriginalProblemUpsert(getDb(), input)
            : upsertProblem,
        events,
        transactionStates,
        uuidCalls: () => uuid.mock.calls.length,
      })
      const current = getDb()
      outcomes.push({
        rows: readRows(),
        events,
        transactionStates,
        uuidCalls: uuid.mock.calls.length,
        inTransaction: current.inTransaction,
        migrationLedger: current
          .prepare("SELECT name FROM sqlite_schema WHERE name = '__drizzle_migrations'")
          .get(),
      })
    } finally {
      unsubscribe()
      closeDb()
      uuid.mockRestore()
    }
  }
  expect(outcomes[1]).toEqual(outcomes[0])
}

describe('problem upsert compatibility', () => {
  it.each([0, NOW])(
    'should insert one visited row with a single captured millisecond instant %s',
    (instant) => {
      compareWithOriginal(({ upsert, events, transactionStates, uuidCalls }) => {
        vi.setSystemTime(instant)
        const clock = vi.spyOn(Date, 'now')
        try {
          expect(upsert(identity())).toBeUndefined()
          expect(clock).toHaveBeenCalledTimes(1)
        } finally {
          clock.mockRestore()
        }
        expect(readRows()).toHaveLength(1)
        expect(readRow()).toEqual({
          id: '00000000-0000-4000-8000-000000000001',
          platform: 'codeforces',
          platform_problem_id: '1000A',
          canonical_url: 'https://example.test/new',
          title: null,
          status: 'visited',
          contest_id: null,
          problem_index: null,
          source_platform: null,
          source_problem_id: null,
          difficulty: null,
          tags_json: null,
          extra_json: null,
          first_seen_at: instant,
          last_visited_at: instant,
          first_solved_at: null,
          created_at: instant,
          updated_at: instant,
          deleted_at: null,
        })
        expect(
          getDb()
            .prepare(
              `SELECT typeof(first_seen_at) AS first_seen,
        typeof(last_visited_at) AS last_visited, typeof(created_at) AS created,
        typeof(updated_at) AS updated FROM problems`,
            )
            .get(),
        ).toEqual({
          first_seen: 'integer',
          last_visited: 'integer',
          created: 'integer',
          updated: 'integer',
        })
        expect(uuidCalls()).toBe(1)
        expect(events).toEqual([CHANGE])
        expect(transactionStates).toEqual([false])
      })
    },
  )

  it('should insert optional fields and trim a valid title without changing literal keys', () => {
    compareWithOriginal(({ upsert }) => {
      upsert(
        identity({
          platformProblemId: "A_%'",
          title: '  Valid title  ',
          contestId: '',
          problemIndex: 'A',
          sourcePlatform: 'source',
          sourceProblemId: 'source-key',
        }),
      )
      expect(readRow("A_%'")).toMatchObject({
        title: 'Valid title',
        contest_id: '',
        problem_index: 'A',
        source_platform: 'source',
        source_problem_id: 'source-key',
      })
    })
  })

  it('should update only the existing six columns without replacing identity or insert-only fields', () => {
    compareWithOriginal(({ upsert, events, uuidCalls }) => {
      seedProblem()
      const before = readRow()
      upsert(
        identity({
          title: CHINESE_TITLE,
          contestId: 'new-contest',
          problemIndex: '',
          sourcePlatform: 'ignored-source',
          sourceProblemId: 'ignored-key',
        }),
      )
      expect(readRows()).toHaveLength(1)
      expect(readRow()).toEqual({
        ...before,
        canonical_url: 'https://example.test/new',
        contest_id: 'new-contest',
        problem_index: '',
        title: CHINESE_TITLE,
        last_visited_at: NOW,
        updated_at: NOW,
      })
      expect(uuidCalls()).toBe(0)
      expect(events).toEqual([CHANGE])
    })
  })

  it.each([
    { existing: null, incoming: '  Valid replacement  ', expected: 'Valid replacement' },
    { existing: 'Problem - E', incoming: 'Valid replacement', expected: 'Valid replacement' },
    { existing: 'English title', incoming: CHINESE_TITLE, expected: CHINESE_TITLE },
    { existing: CHINESE_TITLE, incoming: 'English title', expected: CHINESE_TITLE },
    { existing: 'English title', incoming: 'Other English title', expected: 'English title' },
    { existing: 'English title', incoming: 'Loading', expected: 'English title' },
    { existing: 'English title', incoming: 'X'.repeat(201), expected: 'English title' },
    { existing: 'English title', incoming: '  ', expected: 'English title' },
    { existing: 'English title', incoming: undefined, expected: 'English title' },
  ])(
    'should preserve title quality for $existing -> $incoming',
    ({ existing, incoming, expected }) => {
      compareWithOriginal(({ upsert }) => {
        seedProblem({ title: existing })
        upsert(identity({ title: incoming }))
        expect(readRow().title).toBe(expected)
      })
    },
  )

  it.each([undefined, null, '', 'replacement'])(
    'should preserve nullish versus empty optional input %s',
    (value) => {
      compareWithOriginal(({ upsert }) => {
        seedProblem()
        // Exercise legacy runtime nulls without widening the production input type.
        const input: ProblemIdentity = JSON.parse(
          JSON.stringify({
            ...identity(),
            contestId: value,
            problemIndex: value,
          }),
        )
        upsert(input)
        expect(readRow()).toMatchObject({
          contest_id: value ?? 'old-contest',
          problem_index: value ?? 'old-index',
        })
      })
    },
  )

  it.each([0, NOW])(
    'should update a tombstoned key without resurrecting it at deletion time %s',
    (deletedAt) => {
      compareWithOriginal(({ upsert, events, uuidCalls }) => {
        seedProblem({ deletedAt })
        upsert(identity())
        expect(readRows()).toHaveLength(1)
        expect(readRow()).toMatchObject({
          id: 'existing',
          deleted_at: deletedAt,
          canonical_url: 'https://example.test/new',
          updated_at: NOW,
        })
        expect(events).toEqual([CHANGE])
        expect(uuidCalls()).toBe(0)
      })
    },
  )

  it('should run a bound-null UPDATE without changing either nullable-ID row and still notify', () => {
    compareWithOriginal(({ db, upsert, events, uuidCalls }) => {
      seedProblem({ id: null })
      seedProblem({ id: null, key: 'other' })
      const before = db.serialize()
      upsert(identity({ title: CHINESE_TITLE }))
      expect(db.serialize()).toEqual(before)
      expect(events).toEqual([CHANGE])
      expect(uuidCalls()).toBe(0)
    })
  })

  it.each(['', "id'quoted"])('should update only the matching literal ID %j', (id) => {
    compareWithOriginal(({ upsert, uuidCalls }) => {
      seedProblem({ id })
      seedProblem({ id: 'other', key: 'other' })
      upsert(identity())
      expect(readRow()).toMatchObject({ id, updated_at: NOW })
      expect(readRow('other').updated_at).toBe(15)
      expect(uuidCalls()).toBe(0)
    })
  })

  it('should retain all six SET targets even when title and optional fields retain their values', () => {
    compareWithOriginal(({ db, upsert }) => {
      seedProblem()
      db.exec('CREATE TABLE update_audit (column_name TEXT NOT NULL)')
      const columns = [
        'canonical_url',
        'contest_id',
        'problem_index',
        'title',
        'last_visited_at',
        'updated_at',
      ]
      for (const column of [...columns, 'source_platform', 'status']) {
        db.exec(`CREATE TRIGGER audit_${column} AFTER UPDATE OF ${column} ON problems
          BEGIN INSERT INTO update_audit VALUES ('${column}'); END;`)
      }
      upsert(identity({ title: 'Other English title' }))
      expect(db.prepare('SELECT column_name FROM update_audit ORDER BY column_name').all()).toEqual(
        columns.sort().map((column_name) => ({ column_name })),
      )
      expect(readRow()).toMatchObject({
        title: 'Stored English title',
        contest_id: 'old-contest',
        problem_index: 'old-index',
      })
    })
  })

  it.each([null, 'existing'])(
    'should propagate read-only UPDATE failure and suppress notification for ID %s',
    (id) => {
      compareWithOriginal(({ db, upsert, events }) => {
        seedProblem({ id })
        const before = readRows()
        db.pragma('query_only = ON')
        expect(() => upsert(identity())).toThrow(/readonly/i)
        expect(readRows()).toEqual(before)
        expect(events).toEqual([])
      })
    },
  )

  it('should still prepare the UPDATE and report a missing SET column for a null ID', () => {
    compareWithOriginal(({ db, upsert, events }) => {
      seedProblem({ id: null })
      db.exec('ALTER TABLE problems RENAME COLUMN canonical_url TO missing_canonical_url')
      const before = readRows()
      expect(() => upsert(identity())).toThrow(/no such column/i)
      expect(readRows()).toEqual(before)
      expect(events).toEqual([])
    })
  })

  it.each(['INSERT', 'UPDATE'])(
    'should propagate an aborted %s without row changes or notification',
    (operation) => {
      compareWithOriginal(({ db, upsert, events }) => {
        if (operation === 'UPDATE') seedProblem()
        const before = readRows()
        db.exec(`CREATE TRIGGER reject_upsert BEFORE ${operation} ON problems
        BEGIN SELECT RAISE(ABORT, 'upsert rejected'); END;`)
        expect(() => upsert(identity())).toThrow('upsert rejected')
        expect(readRows()).toEqual(before)
        expect(events).toEqual([])
      })
    },
  )

  it('should publish a single combined event only after the existing outer transaction commits', () => {
    compareWithOriginal(({ db, upsert, events, transactionStates }) => {
      withDataChangeTransaction(() =>
        db.transaction(() => {
          upsert(identity())
          upsert(identity({ canonicalUrl: 'https://example.test/second' }))
          expect(readRows()).toHaveLength(1)
          expect(db.inTransaction).toBe(true)
          expect(events).toEqual([])
        })(),
      )
      expect(readRow().canonical_url).toBe('https://example.test/second')
      expect(events).toEqual([CHANGE])
      expect(transactionStates).toEqual([false])
    })
  })

  it('should discard writes and null-ID no-op notifications on an outer callback rollback', () => {
    compareWithOriginal(({ db, upsert, events }) => {
      seedProblem({ id: null, key: 'null-key' })
      const before = readRows()
      expect(() =>
        withDataChangeTransaction(() =>
          db.transaction(() => {
            upsert(identity())
            upsert(identity({ platformProblemId: 'null-key' }))
            expect(events).toEqual([])
            throw new Error('outer rollback')
          })(),
        ),
      ).toThrow('outer rollback')
      expect(readRows()).toEqual(before)
      expect(events).toEqual([])
    })
  })

  it('should discard notifications when the callback succeeds but deferred FK validation fails at COMMIT', () => {
    compareWithOriginal(({ db, upsert, events }) => {
      db.exec(
        'CREATE TABLE commit_probe (problem_id TEXT REFERENCES problems(id) DEFERRABLE INITIALLY DEFERRED)',
      )
      let callbackFinished = false
      expect(() =>
        withDataChangeTransaction(() =>
          db.transaction(() => {
            upsert(identity())
            db.prepare('INSERT INTO commit_probe VALUES (?)').run('missing')
            callbackFinished = true
            expect(events).toEqual([])
          })(),
        ),
      ).toThrow('FOREIGN KEY constraint failed')
      expect(callbackFinished).toBe(true)
      expect(db.inTransaction).toBe(false)
      expect(readRows()).toEqual([])
      expect(events).toEqual([])
    })
  })

  it('should discard a caught savepoint rollback including null-ID topics while retaining outer work', () => {
    compareWithOriginal(({ db, upsert, events, transactionStates }) => {
      seedProblem({ id: null, key: 'null-key' })
      const before = readRows()
      db.exec('CREATE TABLE outer_probe (value TEXT)')
      withDataChangeTransaction(() =>
        db.transaction(() => {
          db.exec("INSERT INTO outer_probe VALUES ('committed')")
          emitDataChanged(['sites'])
          expect(() =>
            withDataChangeTransaction(() =>
              db.transaction(() => {
                upsert(identity())
                upsert(identity({ platformProblemId: 'null-key' }))
                throw new Error('inner rollback')
              })(),
            ),
          ).toThrow('inner rollback')
          expect(events).toEqual([])
        })(),
      )
      expect(readRows()).toEqual(before)
      expect(db.prepare('SELECT value FROM outer_probe').all()).toEqual([{ value: 'committed' }])
      expect(events).toEqual([{ tables: ['sites'] }])
      expect(transactionStates).toEqual([false])
    })
  })

  it('should buffer a successful null-ID no-op notification until outer commit', () => {
    compareWithOriginal(({ db, upsert, events, transactionStates }) => {
      seedProblem({ id: null })
      const before = readRows()
      withDataChangeTransaction(() =>
        db.transaction(() => {
          upsert(identity())
          expect(events).toEqual([])
        })(),
      )
      expect(readRows()).toEqual(before)
      expect(events).toEqual([CHANGE])
      expect(transactionStates).toEqual([false])
    })
  })

  it('should retain a committed autocommit write and event when a later item fails', () => {
    compareWithOriginal(({ db, upsert, events }) => {
      db.exec(`CREATE TRIGGER reject_second BEFORE INSERT ON problems
        WHEN NEW.platform_problem_id = 'second' BEGIN SELECT RAISE(ABORT, 'second rejected'); END;`)
      upsert(identity())
      expect(() => upsert(identity({ platformProblemId: 'second' }))).toThrow('second rejected')
      expect(readRows()).toHaveLength(1)
      expect(events).toEqual([CHANGE])
    })
  })

  it('should follow close and reinitialization without caching a connection or creating a ledger', () => {
    compareWithOriginal(({ db, upsert, events }) => {
      upsert(identity())
      closeDb()
      expect(db.open).toBe(false)
      expect(() => upsert(identity())).toThrow('Database not initialized')
      const reopened = initDbAtPath(':memory:')
      expect(reopened).not.toBe(db)
      upsert(identity())
      expect(readRows()).toHaveLength(1)
      expect(events).toEqual([CHANGE, CHANGE])
      expect(
        reopened
          .prepare("SELECT name FROM sqlite_schema WHERE name = '__drizzle_migrations'")
          .get(),
      ).toBeUndefined()
    })
  })
})
