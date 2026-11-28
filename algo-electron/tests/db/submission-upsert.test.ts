import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import { upsertSubmission } from '../../electron/db/repositories/submissionRepository'
import { subscribeDataChanges, withDataChangeTransaction } from '../../electron/shared/dataEvents'
import type { SubmissionData } from '../../electron/shared/types'
import type { DataChangedPayload } from '../../src/shared/types/data'
import { assertPost030Schema } from '../../src/main/db/schema-validation'
import { runOriginalSubmissionUpsert } from './submission-upsert-oracle'

const NOW = 1768443630123
const CHANGE = { tables: ['submissions', 'problems', 'stats'] }
const FIRST_ID = '00000000-0000-4000-8000-000000000001'

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => {
  closeDb()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function input(overrides: Partial<SubmissionData> = {}): SubmissionData {
  return {
    platform: 'codeforces',
    platformSubmissionId: 'remote',
    verdict: 'AC',
    submittedAt: 0,
    ...overrides,
  }
}

function seedSubmission(
  db: Database.Database,
  id: string | null,
  key = 'remote',
  deletedAt: number | null = null,
) {
  db.prepare(
    `INSERT INTO submissions
    (id, platform, platform_submission_id, verdict, submitted_at, created_at, updated_at, deleted_at)
    VALUES (?, 'codeforces', ?, 'WA', 10, 11, 12, ?)`,
  ).run(id, key, deletedAt)
}

function rows(db: Database.Database) {
  return db.prepare('SELECT * FROM submissions ORDER BY rowid').all()
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

type Scenario = {
  db: Database.Database
  upsert: (data: SubmissionData) => boolean
  events: DataChangedPayload[]
  uuidCalls: () => number
  trace: string[]
}

function compare(run: (scenario: Scenario) => unknown) {
  const results = []
  for (const original of [true, false]) {
    closeDb()
    const db = initDbAtPath(':memory:')
    vi.setSystemTime(NOW)
    let sequence = 0
    const trace: string[] = []
    const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      trace.push('uuid')
      return `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`
    })
    const events: DataChangedPayload[] = []
    const transactions: boolean[] = []
    const unsubscribe = subscribeDataChanges((event) => {
      events.push(event)
      transactions.push(getDb().inTransaction)
    })
    try {
      const result = run({
        db,
        upsert: original ? (data) => runOriginalSubmissionUpsert(getDb(), data) : upsertSubmission,
        events,
        uuidCalls: () => uuid.mock.calls.length,
        trace,
      })
      results.push({
        result,
        rows: rows(getDb()),
        events,
        transactions,
        trace,
        uuidCalls: uuid.mock.calls.length,
        inTransaction: getDb().inTransaction,
      })
    } finally {
      unsubscribe()
      uuid.mockRestore()
      closeDb()
    }
  }
  expect(results[1]).toEqual(results[0])
}

function trackedInput(
  trace: string[],
  prepared: () => number,
  secondKey = 'remote',
): SubmissionData {
  let keyReads = 0
  const read = <T>(name: string, value: T): T => {
    trace.push(`${name}:${prepared()}`)
    return value
  }
  return {
    get platform() {
      return read('platform', 'codeforces')
    },
    get platformSubmissionId() {
      return read('key', ++keyReads === 1 ? 'remote' : secondKey)
    },
    get problemId() {
      return read('problemId', undefined)
    },
    get verdict() {
      return read('verdict', 'AC' as const)
    },
    get rawVerdict() {
      return read('rawVerdict', undefined)
    },
    get language() {
      return read('language', undefined)
    },
    get submittedAt() {
      return read('submittedAt', 1.75)
    },
    get runtimeMs() {
      return read('runtimeMs', 0)
    },
    get memoryKb() {
      return read('memoryKb', 0)
    },
    get sourceUrl() {
      return read('sourceUrl', '')
    },
    get rawJson() {
      return read('rawJson', '')
    },
  }
}

describe('submission upsert frozen030 compatibility', () => {
  it.each([0, NOW, -1, 1.75, 8640000000000001])(
    'preserves raw submittedAt/now/defaults at %s',
    (instant) => {
      compare(({ db, upsert, events, uuidCalls }) => {
        const clock = vi.spyOn(Date, 'now').mockReturnValue(instant)
        try {
          expect(upsert(input({ submittedAt: instant }))).toBe(true)
          expect(clock).toHaveBeenCalledTimes(1)
        } finally {
          clock.mockRestore()
        }
        expect(rows(db)).toEqual([
          {
            id: FIRST_ID,
            problem_id: null,
            platform: 'codeforces',
            platform_submission_id: 'remote',
            verdict: 'AC',
            raw_verdict: null,
            language: null,
            submitted_at: instant,
            is_first_ac: 0,
            runtime_ms: null,
            memory_kb: null,
            source_url: null,
            raw_json: null,
            created_at: instant,
            updated_at: instant,
            deleted_at: null,
          },
        ])
        expect(uuidCalls()).toBe(1)
        expect(events).toEqual([CHANGE])
      })
    },
  )

  it('preserves present zero/empty optional values and exact parent linkage', () => {
    compare(({ db, upsert }) => {
      db.exec(`INSERT INTO problems (id, platform, platform_problem_id, canonical_url, first_seen_at, created_at, updated_at)
        VALUES ('', 'codeforces', 'empty', 'https://example.test', 0, 0, 0)`)
      expect(
        upsert(
          input({
            problemId: '',
            rawVerdict: '',
            language: '',
            runtimeMs: 0,
            memoryKb: 0,
            sourceUrl: '',
            rawJson: '',
          }),
        ),
      ).toBe(true)
      expect(rows(db)[0]).toMatchObject({
        problem_id: '',
        raw_verdict: '',
        language: '',
        runtime_ms: 0,
        memory_kb: 0,
        source_url: '',
        raw_json: '',
      })
    })
  })

  it.each([null, '', 'existing'])(
    'retains duplicate row presence for ID %j, including tombstones/read-only',
    (id) => {
      compare(({ db, upsert, uuidCalls, events, trace }) => {
        seedSubmission(db, id, 'remote', 0)
        db.exec('ALTER TABLE submissions RENAME COLUMN source_url TO unused_source_url')
        db.pragma('query_only = ON')
        const prepare = vi.spyOn(db, 'prepare')
        try {
          expect(upsert(trackedInput(trace, () => prepare.mock.calls.length))).toBe(false)
          expect(prepare).toHaveBeenCalledTimes(1)
          expect(trace).toEqual(['platform:1', 'key:1'])
        } finally {
          prepare.mockRestore()
        }
        expect(uuidCalls()).toBe(0)
        expect(events).toEqual([])
        expect(rows(db)).toHaveLength(1)
      })
    },
  )

  it.each(['', "quoted'%_\\", 'UPPER', '\u4e2d\u6587', 'contains space'])(
    'uses bound literal platform/key %j without normalization',
    (value) => {
      compare(({ upsert, uuidCalls, events }) => {
        expect(upsert(input({ platform: value, platformSubmissionId: value }))).toBe(true)
        expect(upsert(input({ platform: value, platformSubmissionId: value }))).toBe(false)
        expect(upsert(input({ platform: `${value}x`, platformSubmissionId: value }))).toBe(true)
        expect(uuidCalls()).toBe(2)
        expect(events).toEqual([CHANGE, CHANGE])
      })
    },
  )

  it('preserves prepare/getter/UUID order and repeats platform/key reads for INSERT', () => {
    compare(({ db, upsert, trace }) => {
      const prepare = vi.spyOn(db, 'prepare')
      try {
        expect(upsert(trackedInput(trace, () => prepare.mock.calls.length, 'second-key'))).toBe(
          true,
        )
      } finally {
        prepare.mockRestore()
      }
      expect(trace).toEqual([
        'platform:1',
        'key:1',
        'uuid',
        'problemId:2',
        'platform:2',
        'key:2',
        'verdict:2',
        'rawVerdict:2',
        'language:2',
        'submittedAt:2',
        'runtimeMs:2',
        'memoryKb:2',
        'sourceUrl:2',
        'rawJson:2',
      ])
      expect(rows(db)[0]).toMatchObject({
        platform_submission_id: 'second-key',
        submitted_at: 1.75,
      })
    })
  })

  it('does not evaluate getters or UUID when duplicate lookup preparation fails', () => {
    compare(({ db, upsert, trace, uuidCalls, events }) => {
      const failure = new Error('prepare sentinel')
      const prepare = vi.spyOn(db, 'prepare').mockImplementationOnce(() => {
        throw failure
      })
      try {
        expect(() => upsert(trackedInput(trace, () => prepare.mock.calls.length))).toThrow(failure)
      } finally {
        prepare.mockRestore()
      }
      expect(trace).toEqual([])
      expect(uuidCalls()).toBe(0)
      expect(events).toEqual([])
    })
  })

  it('prepares INSERT before UUID/insertion getters and preserves its native target error', () => {
    compare(({ db, upsert, trace, uuidCalls, events }) => {
      db.exec('ALTER TABLE submissions RENAME COLUMN source_url TO absent_source_url')
      const prepare = vi.spyOn(db, 'prepare')
      let result
      try {
        result = outcome(() => upsert(trackedInput(trace, () => prepare.mock.calls.length)))
      } finally {
        prepare.mockRestore()
      }
      expect(result).toHaveProperty(
        'error.message',
        'table submissions has no column named source_url',
      )
      expect(trace).toEqual(['platform:1', 'key:1'])
      expect(uuidCalls()).toBe(0)
      expect(events).toEqual([])
      return result
    })
  })

  it('propagates the same input getter exception after the same completed stages', () => {
    compare(({ db, upsert, trace, events, uuidCalls }) => {
      const data = trackedInput(trace, () => 0)
      const failure = new Error('input sentinel')
      Object.defineProperty(data, 'language', {
        get() {
          trace.push('language:throw')
          throw failure
        },
      })
      expect(() => upsert(data)).toThrow(failure)
      expect(rows(db)).toEqual([])
      expect(uuidCalls()).toBe(1)
      expect(events).toEqual([])
    })
  })

  it.each(['primary-key', 'platform-key', 'foreign-key', 'readonly', 'NaN'])(
    'retains native %s failure without events',
    (kind) => {
      compare(({ db, upsert, events, uuidCalls, trace }) => {
        if (kind === 'primary-key') seedSubmission(db, FIRST_ID, 'other')
        if (kind === 'platform-key') seedSubmission(db, 'other', 'collision')
        if (kind === 'readonly') db.pragma('query_only = ON')
        const result = outcome(() =>
          upsert(
            kind === 'platform-key'
              ? trackedInput(trace, () => 0, 'collision')
              : input({
                  ...(kind === 'foreign-key' ? { problemId: 'missing' } : {}),
                  ...(kind === 'NaN' ? { submittedAt: NaN } : {}),
                }),
          ),
        )
        expect(result).toHaveProperty('error')
        expect(uuidCalls()).toBe(1)
        expect(events).toEqual([])
        return result
      })
    },
  )

  it.each(['IGNORE', 'FAIL', 'ABORT', 'audit'])(
    'preserves %s trigger rows, defaults and success/error notifications',
    (mode) => {
      compare(({ db, upsert, events }) => {
        db.exec(`CREATE TABLE insert_audit (id TEXT, first_ac INTEGER, deleted_at INTEGER, submitted_at INTEGER);
        CREATE TRIGGER observe_insert BEFORE INSERT ON submissions BEGIN
        INSERT INTO insert_audit VALUES (NEW.id, NEW.is_first_ac, NEW.deleted_at, NEW.submitted_at);
        ${mode === 'audit' ? '' : mode === 'IGNORE' ? 'SELECT RAISE(IGNORE);' : `SELECT RAISE(${mode}, 'insert rejected');`} END`)
        const result = outcome(() => upsert(input({ submittedAt: 1.75 })))
        const audit = db.prepare('SELECT * FROM insert_audit').all()
        expect(audit).toEqual(
          mode === 'ABORT'
            ? []
            : [{ id: FIRST_ID, first_ac: 0, deleted_at: null, submitted_at: 1.75 }],
        )
        expect(rows(db)).toHaveLength(mode === 'audit' ? 1 : 0)
        expect(events).toEqual(mode === 'audit' || mode === 'IGNORE' ? [CHANGE] : [])
        if (mode === 'audit' || mode === 'IGNORE') expect(result).toEqual({ value: true })
        else expect(result).toHaveProperty('error.message', 'insert rejected')
        return { result, audit }
      })
    },
  )

  it('retains a prior autocommit and notification when the next INSERT aborts', () => {
    compare(({ db, upsert, events }) => {
      expect(upsert(input())).toBe(true)
      db.exec(
        "CREATE TRIGGER reject_second BEFORE INSERT ON submissions WHEN NEW.platform_submission_id='second' BEGIN SELECT RAISE(ABORT, 'second rejected'); END",
      )
      expect(() => upsert(input({ platformSubmissionId: 'second' }))).toThrow('second rejected')
      expect(rows(db)).toHaveLength(1)
      expect(events).toEqual([CHANGE])
    })
  })

  it.each(['commit', 'callback-rollback', 'commit-failure', 'inner-rollback'])(
    'retains caller-owned transaction behavior: %s',
    (mode) => {
      compare(({ db, upsert, events }) => {
        const run = () =>
          withDataChangeTransaction(() =>
            db.transaction(() => {
              expect(upsert(input())).toBe(true)
              expect(events).toEqual([])
              const nested = () =>
                withDataChangeTransaction(() =>
                  db.transaction(() => {
                    expect(upsert(input({ platformSubmissionId: 'nested' }))).toBe(true)
                    if (mode === 'inner-rollback') throw new Error('inner rollback')
                  })(),
                )
              if (mode === 'inner-rollback') expect(nested).toThrow('inner rollback')
              else nested()
              expect(events).toEqual([])
              if (mode === 'callback-rollback') throw new Error('outer rollback')
              if (mode === 'commit-failure') {
                db.pragma('defer_foreign_keys = ON')
                upsert(input({ platformSubmissionId: 'deferred', problemId: 'missing' }))
              }
            })(),
          )
        if (mode === 'callback-rollback') expect(run).toThrow('outer rollback')
        else if (mode === 'commit-failure') expect(run).toThrow('FOREIGN KEY constraint failed')
        else expect(run).not.toThrow()
        expect(db.inTransaction).toBe(false)
        const succeeds = mode === 'commit' || mode === 'inner-rollback'
        expect(rows(db)).toHaveLength(mode === 'commit' ? 2 : mode === 'inner-rollback' ? 1 : 0)
        expect(events).toEqual(succeeds ? [CHANGE] : [])
      })
    },
  )

  it('preserves synchronous subscriber reentrancy after the row is committed', () => {
    compare(({ db, upsert, events, uuidCalls }) => {
      let observedRow = false
      const unsubscribe = subscribeDataChanges(() => {
        observedRow = rows(db).length === 1
        expect(upsert(input())).toBe(false)
      })
      try {
        expect(upsert(input())).toBe(true)
        expect(observedRow).toBe(true)
        expect(uuidCalls()).toBe(1)
        expect(events).toEqual([CHANGE])
      } finally {
        unsubscribe()
      }
    })
  })

  it('propagates the exact UUID exception before insertion getters or notifications', () => {
    compare(({ db, upsert, events, trace }) => {
      const failure = new Error('uuid sentinel')
      const originalUuid = crypto.randomUUID
      crypto.randomUUID = () => {
        trace.push('uuid:throw')
        throw failure
      }
      try {
        const prepare = vi.spyOn(db, 'prepare')
        try {
          let caught: unknown
          try {
            upsert(trackedInput(trace, () => prepare.mock.calls.length))
          } catch (error) {
            caught = error
          }
          expect(caught).toBe(failure)
          expect(prepare).toHaveBeenCalledTimes(2)
        } finally {
          prepare.mockRestore()
        }
        expect(trace).toEqual(['platform:1', 'key:1', 'uuid:throw'])
        expect(rows(db)).toEqual([])
        expect(events).toEqual([])
      } finally {
        crypto.randomUUID = originalUuid
      }
    })
  })

  it('does not defer unwrapped transaction notifications or turn subscriber failure into mutation failure', () => {
    compare(({ db, upsert, events }) => {
      const unsubscribe = subscribeDataChanges(() => {
        throw new Error('listener failure')
      })
      try {
        expect(() =>
          db.transaction(() => {
            expect(upsert(input())).toBe(true)
            expect(events).toEqual([CHANGE])
            throw new Error('rollback')
          })(),
        ).toThrow('rollback')
        expect(rows(db)).toEqual([])
        expect(events).toEqual([CHANGE])
      } finally {
        unsubscribe()
      }
    })
  })

  it('uses the lifecycle-owned new connection and throws before clock/input after close', () => {
    compare(({ db, upsert, uuidCalls }) => {
      expect(upsert(input())).toBe(true)
      closeDb()
      expect(db.open).toBe(false)
      const clock = vi.spyOn(Date, 'now')
      try {
        expect(() => upsertSubmission(input())).toThrow('Database not initialized')
        expect(clock).not.toHaveBeenCalled()
      } finally {
        clock.mockRestore()
      }
      initDbAtPath(':memory:')
      expect(upsert(input())).toBe(true)
      expect(uuidCalls()).toBe(2)
      expect(rows(getDb())).toHaveLength(1)
    })
  })
})

describe('explicit unsupported schema boundary', () => {
  const baselineSql = fs.readFileSync(path.resolve('drizzle/0000_baseline.sql'), 'utf8')
  it.each(['default', 'omitted-column', 'view'])(
    'existing schema validator rejects %s drift; INSERT equivalence is not claimed',
    (kind) => {
      const db = new Database(':memory:')
      try {
        db.exec(
          kind === 'default'
            ? baselineSql.replace(
                '`is_first_ac` integer DEFAULT 0 NOT NULL',
                '`is_first_ac` integer DEFAULT 7 NOT NULL',
              )
            : baselineSql,
        )
        if (kind === 'omitted-column')
          db.exec('ALTER TABLE submissions RENAME COLUMN deleted_at TO other_deleted_at')
        if (kind === 'view')
          db.exec(
            'ALTER TABLE submissions RENAME TO original_submissions; CREATE VIEW submissions AS SELECT * FROM original_submissions',
          )
        expect(() => assertPost030Schema(db, baselineSql)).toThrow(/Post-030/)
      } finally {
        db.close()
      }
    },
  )

  it('keeps native damaged-lookup diagnostics and prepare-first ordering without claiming identical wording', () => {
    const diagnostics = []
    for (const original of [true, false]) {
      closeDb()
      const db = initDbAtPath(':memory:')
      db.exec('ALTER TABLE submissions RENAME COLUMN platform TO altered_platform')
      const trace: string[] = []
      const uuid = vi.spyOn(crypto, 'randomUUID')
      try {
        const data = trackedInput(trace, () => 0)
        const result = outcome(() =>
          original ? runOriginalSubmissionUpsert(db, data) : upsertSubmission(data),
        )
        assert.ok(result.error)
        expect(result.error.name).toBe('SqliteError')
        expect(result.error.message).toMatch(/no such column: (submissions\.)?platform/)
        expect(trace).toEqual([])
        expect(uuid).not.toHaveBeenCalled()
        diagnostics.push(result.error.message)
      } finally {
        uuid.mockRestore()
        closeDb()
      }
    }
    expect(diagnostics).toEqual([
      'no such column: platform',
      'no such column: submissions.platform',
    ])
  })
})
