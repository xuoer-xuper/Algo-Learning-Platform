import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as connection from '../../electron/db/connection'
import { closeDb, getDb, getKnownMigrations, initDbAtPath } from '../../electron/db/connection'
import {
  updateNoteTitleRow,
  updateNoteTypeRow,
} from '../../electron/db/repositories/notes/title-type'
import * as service from '../../electron/notes/NoteService'
import * as storage from '../../electron/notes/noteStorage'
import { nowMillis } from '../../electron/shared/time'
import {
  emitDataChanged,
  subscribeDataChanges,
  withDataChangeTransaction,
} from '../../electron/shared/dataEvents'
import { applyDrizzleMigrations } from '../../src/main/db/migrate'
import { loadMigrationResources } from '../../src/main/db/migration-resources'
import type { DataChangedPayload } from '../../src/shared/types/data'
import {
  createNotesTitleTypeOracle,
  oldUpdateNoteTitleRow,
  oldUpdateNoteTypeRow,
} from './notes-title-type-oracle'

vi.mock('../../electron/notes/noteStorage', () => ({
  createNoteFile: vi.fn(),
  deleteNoteFiles: vi.fn(),
  ensureNotesRoot: vi.fn(),
  readNoteFile: vi.fn(),
  resolveNoteAssetPathFromFile: vi.fn(),
  saveNoteImageAsset: vi.fn(),
  writeNoteContent: vi.fn(),
}))

const NOW = 1768443630123
const CHANGE = { tables: ['notes'] }
const nativeGetDb = getDb
const directories: string[] = []
const actions = ['title', 'type'] as const
type Action = (typeof actions)[number]
type Methods = Pick<typeof service, 'updateNoteTitle' | 'updateNoteType'>
type Scenario = {
  db: Database.Database
  methods: Methods
  rows: Record<Action, typeof updateNoteTitleRow>
  trace: string[]
  events: DataChangedPayload[]
  original: boolean
}

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => {
  closeDb()
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const directory of directories.splice(0)) {
    const target = path.resolve(directory)
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()))
    assert.ok(path.basename(target).startsWith('algo-notes-meta-'))
    assert.equal(fs.lstatSync(target).isSymbolicLink(), false)
    fs.rmSync(target, { recursive: true, force: true })
  }
})

function seed(db: Database.Database, id: string | null = 'note', deletedAt: number | null = null) {
  db.prepare(
    `INSERT INTO notes
    (id,problem_id,title,file_path,note_type,content,word_count,created_at,updated_at,deleted_at)
    VALUES (?,NULL,'Original title','synthetic/note.md','solution','original body',19,0,2,?)`,
  ).run(id, deletedAt)
}

function snapshot(db: Database.Database) {
  const tables = db
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name",
    )
    .all()
  return {
    schema: db.prepare('SELECT * FROM sqlite_schema ORDER BY type,name').all(),
    tables: tables.map(({ name }) => ({
      name,
      rows: db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all(),
    })),
    total: db.prepare('SELECT total_changes() AS count').get(),
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
    applyDrizzleMigrations(
      db,
      loadMigrationResources(path.resolve('drizzle')),
      getKnownMigrations(),
    )
    const trace: string[] = []
    const events: DataChangedPayload[] = []
    for (const fn of Object.values(storage)) vi.mocked(fn).mockClear()
    const uuid = vi.spyOn(crypto, 'randomUUID')
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      trace.push('clock')
      return NOW
    })
    const getter = vi.spyOn(connection, 'getDb').mockImplementation(() => {
      trace.push('db')
      return nativeGetDb()
    })
    const off = subscribeDataChanges((payload) => {
      events.push(payload)
      trace.push(`event:${nativeGetDb().inTransaction}`)
    })
    const methods = original
      ? createNotesTitleTypeOracle({ getDb: connection.getDb, nowMillis, emitDataChanged })
      : service
    try {
      const result = run({
        db,
        methods,
        rows: original
          ? { title: oldUpdateNoteTitleRow, type: oldUpdateNoteTypeRow }
          : { title: updateNoteTitleRow, type: updateNoteTypeRow },
        trace,
        events,
        original,
      })
      for (const fn of Object.values(storage)) expect(fn).not.toHaveBeenCalled()
      expect(uuid).not.toHaveBeenCalled()
      results.push({ result, trace, events, state: snapshot(nativeGetDb()) })
    } finally {
      off()
      getter.mockRestore()
      clock.mockRestore()
      uuid.mockRestore()
      closeDb()
    }
  }
  expect(results[1]).toEqual(results[0])
}

function invoke(methods: Methods, action: Action, id = 'note', value?: string): boolean {
  return action === 'title'
    ? methods.updateNoteTitle(id, value ?? 'Changed title')
    : methods.updateNoteType(id, 'review')
}

function track(
  db: Database.Database,
  trace: string[],
  options: {
    fail?: { stage: 'prepare' | 'run'; error: unknown }
    result?: (result: Database.RunResult) => Database.RunResult
  } = {},
) {
  const nativePrepare = db.prepare.bind(db)
  const queries: string[] = []
  const bindings: unknown[][] = []
  const restores: (() => void)[] = []
  let returned: Database.RunResult | undefined
  let thrown: unknown
  const prepare = vi.spyOn(db, 'prepare').mockImplementation((query) => {
    queries.push(query)
    trace.push('prepare')
    try {
      if (options.fail?.stage === 'prepare') throw options.fail.error
      const statement = nativePrepare(query)
      const nativeRun = statement.run.bind(statement)
      const run = vi.spyOn(statement, 'run').mockImplementation((...args: unknown[]) => {
        bindings.push(args)
        trace.push('run')
        try {
          if (options.fail?.stage === 'run') throw options.fail.error
          const result = nativeRun(...args)
          returned = options.result ? options.result(result) : result
          return returned
        } catch (error) {
          thrown = error
          throw error
        }
      })
      restores.push(() => run.mockRestore())
      return statement
    } catch (error) {
      thrown = error
      throw error
    }
  })
  return {
    queries,
    bindings,
    returned: () => returned,
    thrown: () => thrown,
    restore() {
      prepare.mockRestore()
      for (const restore of restores) restore()
    },
  }
}

function assertStatement(tracking: ReturnType<typeof track>, action: Action, args: unknown[]) {
  expect(tracking.queries).toHaveLength(1)
  const column = action === 'title' ? 'title' : 'note_type'
  expect(
    tracking.queries[0]?.replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase(),
  ).toMatch(
    new RegExp(`^update notes set ${column} = \\?, updated_at = \\? where (?:notes\\.)?id = \\?$`),
  )
  expect(tracking.bindings).toEqual([args])
}

describe.each(actions)('notes %s metadata update parity', (action) => {
  it.each([
    'note',
    '',
    'Case',
    ' spaced ',
    "O'Reilly",
    '%_\\',
    "' OR 1=1 --",
    '\u4e2d\u6587',
    'emoji-\ud83d\ude00',
    'with\0nul',
    '\ud800',
  ])('binds the exact literal ID %j, touches only two targets and emits after run', (id) => {
    compare(({ db, methods, trace, events }) => {
      seed(db, id, 0)
      seed(db, 'untouched')
      const before = db.prepare('SELECT * FROM notes ORDER BY rowid').all()
      const tracking = track(db, trace)
      try {
        expect(invoke(methods, action, id)).toBe(true)
        assertStatement(tracking, action, [
          action === 'title' ? 'Changed title' : 'review',
          NOW,
          id,
        ])
      } finally {
        tracking.restore()
      }
      expect(trace).toEqual(['db', 'clock', 'prepare', 'run', 'event:false'])
      expect(events).toEqual([CHANGE])
      expect(db.prepare('SELECT * FROM notes ORDER BY rowid').all()).toEqual([
        {
          ...Object(before[0]),
          [action === 'title' ? 'title' : 'note_type']:
            action === 'title' ? 'Changed title' : 'review',
          updated_at: NOW,
        },
        before[1],
      ])
    })
  })

  it('executes same-value and missing-row writes with original boolean and event predicates', () => {
    compare(({ db, methods, trace, events }) => {
      seed(db)
      const tracking = track(db, trace)
      try {
        const same =
          action === 'title'
            ? methods.updateNoteTitle('note', 'Original title')
            : methods.updateNoteType('note', 'solution')
        expect(same).toBe(true)
        expect(tracking.returned()?.changes).toBe(1)
        expect(invoke(methods, action, 'missing')).toBe(false)
        expect(tracking.queries).toHaveLength(2)
        expect(tracking.returned()?.changes).toBe(0)
      } finally {
        tracking.restore()
      }
      expect(events).toEqual([CHANGE])
    })
  })

  it.each([null, undefined])(
    'keeps diagnostic %j IDs as bound equality, not IS NULL or early return',
    (id) => {
      compare(({ db, methods, trace, events }) => {
        seed(db)
        seed(db, null)
        const tracking = track(db, trace)
        try {
          const method = action === 'title' ? methods.updateNoteTitle : methods.updateNoteType
          expect(Reflect.apply(method, undefined, [id, 'review'])).toBe(false)
          assertStatement(tracking, action, ['review', NOW, id])
        } finally {
          tracking.restore()
        }
        expect(trace).toEqual(['db', 'clock', 'prepare', 'run'])
        expect(events).toEqual([])
      })
    },
  )

  it.each([null, undefined])(
    'binds %j SET values natively for matched and missing rows',
    (value) => {
      for (const id of ['note', 'missing']) {
        compare(({ db, methods, trace, events }) => {
          seed(db)
          const method = action === 'title' ? methods.updateNoteTitle : methods.updateNoteType
          const tracking = track(db, trace)
          let result
          try {
            result = outcome(() => Reflect.apply(method, undefined, [id, value]))
            assertStatement(tracking, action, [value, NOW, id])
          } finally {
            tracking.restore()
          }
          if (id === 'note') expect(result.error?.code).toBe('SQLITE_CONSTRAINT_NOTNULL')
          else expect(result.value).toBe(false)
          expect(events).toEqual([])
          return result
        })
      }
    },
  )

  it.each([
    0,
    1.75,
    -3,
    Number.MAX_SAFE_INTEGER,
    8.64e15 + 1,
    'raw-time',
    null,
    undefined,
    NaN,
    Infinity,
  ])('passes raw instant %j directly without Date encoding', (now) => {
    compare(({ db, rows, trace, events }) => {
      seed(db)
      const tracking = track(db, trace)
      let result
      try {
        result = outcome(() => Reflect.apply(rows[action], undefined, [db, 'note', 'review', now]))
        assertStatement(tracking, action, ['review', now, 'note'])
        if (!result.error) expect(result.value).toBe(tracking.returned())
      } finally {
        tracking.restore()
      }
      expect(trace).toEqual(['prepare', 'run'])
      expect(events).toEqual([])
      return {
        result,
        stored: db.prepare('SELECT *,typeof(updated_at) AS stored_time_type FROM notes').all(),
      }
    })
  })

  it('derives diagnostic array/object/buffer/boolean/Symbol binding outcomes from original SQL', () => {
    const values: unknown[] = [
      [],
      ['summary'],
      ['a', 'b'],
      {},
      { title: 'review' },
      Buffer.from([0, 255]),
      true,
      Symbol('bad'),
      new Date(0),
      () => 'bad',
    ]
    for (const value of values) {
      compare(({ db, rows, trace, events }) => {
        seed(db)
        const tracking = track(db, trace)
        let result
        try {
          result = outcome(() => Reflect.apply(rows[action], undefined, [db, 'note', value, NOW]))
          assertStatement(tracking, action, [value, NOW, 'note'])
          if (!result.error) expect(result.value).toBe(tracking.returned())
        } finally {
          tracking.restore()
        }
        expect(trace).toEqual(['prepare', 'run'])
        expect(events).toEqual([])
        return {
          result,
          stored: db
            .prepare(
              'SELECT *,typeof(title) AS title_type,typeof(note_type) AS type_type FROM notes',
            )
            .all(),
        }
      })
    }
  })

  it('fires only original UPDATE OF targets, even for unchanged values', () => {
    compare(({ db, methods, events }) => {
      seed(db)
      db.exec('CREATE TABLE note_audit (target TEXT)')
      for (const column of [
        'id',
        'problem_id',
        'title',
        'file_path',
        'note_type',
        'content',
        'word_count',
        'created_at',
        'updated_at',
        'deleted_at',
      ]) {
        db.exec(
          `CREATE TRIGGER watch_${column} AFTER UPDATE OF ${column} ON notes BEGIN INSERT INTO note_audit VALUES ('${column}'); END`,
        )
      }
      expect(
        action === 'title'
          ? methods.updateNoteTitle('note', 'Original title')
          : methods.updateNoteType('note', 'solution'),
      ).toBe(true)
      expect(db.prepare('SELECT * FROM note_audit ORDER BY target').all()).toEqual([
        { target: action === 'title' ? 'title' : 'note_type' },
        { target: 'updated_at' },
      ])
      expect(events).toEqual([CHANGE])
    })
  })

  it.each(['IGNORE', 'FAIL', 'ABORT'] as const)(
    'preserves %s trigger effects and no-success events',
    (mode) => {
      compare(({ db, methods, events }) => {
        seed(db)
        db.exec(`CREATE TABLE note_audit (label TEXT);
        CREATE TRIGGER reject_metadata BEFORE UPDATE ON notes BEGIN
          INSERT INTO note_audit VALUES ('attempt');
          SELECT RAISE(${mode}${mode === 'IGNORE' ? '' : ", 'metadata sentinel'"}); END`)
        const before = db.prepare('SELECT * FROM notes').all()
        const result = outcome(() => invoke(methods, action))
        if (mode === 'IGNORE') expect(result.value).toBe(false)
        else expect(result.error?.code).toBe('SQLITE_CONSTRAINT_TRIGGER')
        expect(db.prepare('SELECT * FROM notes').all()).toEqual(before)
        expect(db.prepare('SELECT * FROM note_audit').all()).toEqual(
          mode === 'ABORT' ? [] : [{ label: 'attempt' }],
        )
        expect(events).toEqual([])
        return result
      })
    },
  )

  it.each(['db', 'clock', 'prepare', 'run'] as const)(
    'preserves %s failure identity and ordering without events',
    (stage) => {
      compare(({ db, methods, trace, events }) => {
        seed(db)
        const sentinel = { stage }
        const tracking = track(
          db,
          trace,
          stage === 'prepare' || stage === 'run' ? { fail: { stage, error: sentinel } } : {},
        )
        if (stage === 'db')
          vi.mocked(connection.getDb).mockImplementation(() => {
            trace.push('db')
            throw sentinel
          })
        if (stage === 'clock')
          vi.mocked(Date.now).mockImplementation(() => {
            trace.push('clock')
            throw sentinel
          })
        let caught: unknown
        try {
          invoke(methods, action)
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        expect(caught).toBe(sentinel)
        const expected = ['db', 'clock', 'prepare', 'run']
        expect(trace).toEqual(expected.slice(0, expected.indexOf(stage) + 1))
        expect(events).toEqual([])
      })
    },
  )

  it.each([
    [1, 0],
    [0, 1],
  ])('retains two changes reads %j around the conditional event', (first, second) => {
    compare(({ db, methods, trace, events }) => {
      seed(db)
      const tracking = track(db, trace, {
        result(native) {
          let reads = 0
          return {
            lastInsertRowid: native.lastInsertRowid,
            get changes() {
              trace.push(`changes:${++reads}`)
              return reads === 1 ? first : second
            },
          }
        },
      })
      try {
        expect(invoke(methods, action)).toBe(second > 0)
      } finally {
        tracking.restore()
      }
      expect(trace).toEqual([
        'db',
        'clock',
        'prepare',
        'run',
        'changes:1',
        ...(first > 0 ? ['event:false'] : []),
        'changes:2',
      ])
      expect(events).toEqual(first > 0 ? [CHANGE] : [])
    })
  })

  it('returns the original native result without reading changes in the helper', () => {
    compare(({ db, rows, trace }) => {
      seed(db)
      const tracking = track(db, trace, {
        result(native) {
          return {
            lastInsertRowid: native.lastInsertRowid,
            get changes(): number {
              throw new Error('must not read changes')
            },
          }
        },
      })
      try {
        expect(rows[action](db, 'note', 'review', NOW)).toBe(tracking.returned())
      } finally {
        tracking.restore()
      }
      expect(trace).toEqual(['prepare', 'run'])
    })
  })

  it.each(['note', 'missing'])(
    'still attempts %s writes on query_only and actual readonly connections',
    (id) => {
      compare(({ db, methods, rows, trace, events }) => {
        seed(db)
        db.pragma('query_only=ON')
        const before = snapshot(db)
        const tracking = track(db, trace)
        let result
        try {
          result = outcome(() => invoke(methods, action, id))
          expect(result.error?.code).toBe('SQLITE_READONLY')
          assertStatement(tracking, action, [
            action === 'title' ? 'Changed title' : 'review',
            NOW,
            id,
          ])
        } finally {
          tracking.restore()
        }
        expect(snapshot(db)).toEqual(before)
        db.pragma('query_only=OFF')
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-notes-meta-'))
        directories.push(directory)
        const file = path.join(directory, 'readonly.sqlite')
        db.prepare('VACUUM INTO ?').run(file)
        const readonly = new Database(file, { readonly: true })
        try {
          expect(readonly.readonly).toBe(true)
          expect(outcome(() => rows[action](readonly, id, 'review', NOW)).error?.code).toBe(
            'SQLITE_READONLY',
          )
        } finally {
          readonly.close()
        }
        expect(events).toEqual([])
        return result
      })
    },
  )

  it.each(['table', 'target', 'updated_at', 'id'] as const)(
    'keeps native preparation errors for damaged %s',
    (damage) => {
      compare(({ db, methods, trace, events }) => {
        seed(db)
        const column = damage === 'target' ? (action === 'title' ? 'title' : 'note_type') : damage
        if (damage === 'table') db.exec('DROP TABLE notes')
        else db.exec(`ALTER TABLE notes RENAME COLUMN ${column} TO damaged_column`)
        const tracking = track(db, trace)
        let caught: unknown
        try {
          invoke(methods, action, 'missing')
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        assert.ok(caught instanceof Error && 'code' in caught)
        expect(caught).toBe(tracking.thrown())
        expect(caught.name).toBe('SqliteError')
        expect(caught.code).toBe('SQLITE_ERROR')
        expect(caught.message).toMatch(/^no such (?:table|column):/)
        expect(caught.message).toContain(damage === 'table' ? 'notes' : column)
        expect(trace).toEqual(['db', 'clock', 'prepare'])
        expect(events).toEqual([])
        return { name: caught.name, code: caught.code }
      })
    },
  )

  it('uses explicit independent, closed and reinitialized handles without caching', () => {
    compare(({ db, methods, rows, trace, events }) => {
      seed(db)
      const other = new Database(':memory:')
      const schema = db
        .prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE name='notes'")
        .get()
      assert.ok(schema)
      other.exec(schema.sql)
      seed(other)
      try {
        expect(rows[action](other, 'note', 'independent', 0).changes).toBe(1)
        expect(trace).toEqual([])
        expect(events).toEqual([])
        expect(db.prepare('SELECT title,note_type,updated_at FROM notes').get()).toEqual({
          title: 'Original title',
          note_type: 'solution',
          updated_at: 2,
        })
        closeDb()
        expect(outcome(() => rows[action](db, 'note', 'review', NOW)).error?.message).toContain(
          'not open',
        )
        const closed = outcome(() => invoke(methods, action))
        expect(closed.error).toBeDefined()
        const next = initDbAtPath(':memory:')
        seed(next, 'new')
        trace.length = 0
        expect(invoke(methods, action)).toBe(false)
        expect(invoke(methods, action, 'new')).toBe(true)
        expect(rows[action](other, 'note', 'still-independent', 1).changes).toBe(1)
        expect(events).toEqual([CHANGE])
        return closed
      } finally {
        other.close()
      }
    })
  })
})

describe('notes metadata caller transactions and listeners', () => {
  it('preserves all three service types and empty title without inventing new validation', () => {
    compare(({ db, methods, events }) => {
      seed(db)
      for (const type of ['solution', 'review', 'summary'] as const) {
        expect(methods.updateNoteType('note', type)).toBe(true)
        expect(db.prepare('SELECT note_type FROM notes').get()).toEqual({ note_type: type })
      }
      expect(methods.updateNoteTitle('note', '')).toBe(true)
      expect(db.prepare('SELECT title FROM notes').get()).toEqual({ title: '' })
      expect(events).toEqual([CHANGE, CHANGE, CHANGE, CHANGE])
    })
  })

  it.each(['commit', 'rollback', 'inner-rollback', 'commit-failure'] as const)(
    'preserves %s including actual native COMMIT and topic scope',
    (mode) => {
      compare(({ db, methods, events }) => {
        seed(db)
        if (mode === 'commit-failure')
          db.exec(`CREATE TRIGGER metadata_fk AFTER UPDATE OF title ON notes BEGIN
        INSERT INTO submissions(id,problem_id,platform,platform_submission_id,verdict,submitted_at,created_at,updated_at)
        VALUES ('fk','missing','test','fk','WA',0,0,0); END`)
        let callbackFinished = false
        const result = outcome(() =>
          withDataChangeTransaction(() =>
            db.transaction(() => {
              if (mode === 'commit-failure') db.pragma('defer_foreign_keys=ON')
              expect(methods.updateNoteTitle('note', 'outer title')).toBe(true)
              const inner = () =>
                withDataChangeTransaction(() =>
                  db.transaction(() => {
                    expect(methods.updateNoteType('note', 'summary')).toBe(true)
                    if (mode === 'inner-rollback') throw new Error('inner rollback')
                  })(),
                )
              if (mode === 'inner-rollback') expect(inner).toThrow('inner rollback')
              else inner()
              expect(events).toEqual([])
              if (mode === 'rollback') throw new Error('outer rollback')
              callbackFinished = true
            })(),
          ),
        )
        const committed = mode === 'commit' || mode === 'inner-rollback'
        expect(events).toEqual(committed ? [CHANGE] : [])
        expect(db.prepare('SELECT title,note_type,updated_at FROM notes').get()).toEqual({
          title: committed ? 'outer title' : 'Original title',
          note_type: mode === 'commit' ? 'summary' : 'solution',
          updated_at: committed ? NOW : 2,
        })
        if (mode === 'commit-failure') {
          expect(callbackFinished).toBe(true)
          expect(result.error?.code).toBe('SQLITE_CONSTRAINT_FOREIGNKEY')
        }
        expect(db.inTransaction).toBe(false)
        return { result, callbackFinished }
      })
    },
  )

  it('retains an earlier autocommit and event when a later metadata write fails', () => {
    compare(({ db, methods, events }) => {
      seed(db)
      db.exec(
        "CREATE TRIGGER reject_type BEFORE UPDATE OF note_type ON notes BEGIN SELECT RAISE(ABORT,'later write'); END",
      )
      expect(methods.updateNoteTitle('note', 'committed')).toBe(true)
      const result = outcome(() => methods.updateNoteType('note', 'summary'))
      expect(result.error?.message).toBe('later write')
      expect(db.prepare('SELECT title,note_type FROM notes').get()).toEqual({
        title: 'committed',
        note_type: 'solution',
      })
      expect(events).toEqual([CHANGE])
      return result
    })
  })

  it('keeps synchronous reentrant visibility and isolates failed listeners from results', () => {
    compare(({ db, methods, events }) => {
      seed(db)
      const observed: unknown[] = []
      const offFail = subscribeDataChanges(() => {
        throw new Error('listener sentinel')
      })
      let entered = false
      const offReentrant = subscribeDataChanges((payload) => {
        expect(payload).toEqual(CHANGE)
        observed.push(db.prepare('SELECT title,note_type FROM notes').get())
        if (!entered) {
          entered = true
          expect(methods.updateNoteType('note', 'summary')).toBe(true)
        }
      })
      try {
        expect(methods.updateNoteTitle('note', 'visible')).toBe(true)
        expect(events).toEqual([CHANGE, CHANGE])
        expect(observed).toEqual([
          { title: 'visible', note_type: 'solution' },
          { title: 'visible', note_type: 'summary' },
        ])
      } finally {
        offReentrant()
        offFail()
      }
      return observed
    })
  })
})
