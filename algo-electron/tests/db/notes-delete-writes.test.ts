import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as connection from '../../electron/db/connection'
import { closeDb, getDb, getKnownMigrations, initDbAtPath } from '../../electron/db/connection'
import { deleteNoteRow } from '../../electron/db/repositories/notes/delete'
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
import { createNotesFilePathOracle } from './notes-file-path-oracle'
import { oldDeleteNoteRow } from './notes-delete-oracle'

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
type Methods = Pick<typeof service, 'deleteNote' | 'deleteNotesByProblem'>
type Scenario = {
  db: Database.Database
  methods: Methods
  remove: typeof deleteNoteRow
  files: Map<string, string>
  trace: string[]
  events: DataChangedPayload[]
}

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => {
  closeDb()
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const directory of directories.splice(0)) {
    const target = path.resolve(directory)
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()))
    assert.ok(path.basename(target).startsWith('algo-notes-delete-'))
    assert.equal(fs.lstatSync(target).isSymbolicLink(), false)
    fs.rmSync(target, { recursive: true, force: true })
  }
})

function seed(
  db: Database.Database,
  id: string | null = 'note',
  filePath = 'synthetic/note.md',
  updatedAt = 2,
  deletedAt: number | null = null,
) {
  db.prepare(
    `INSERT INTO notes
    (id,problem_id,title,file_path,note_type,content,word_count,created_at,updated_at,deleted_at)
    VALUES (?,'parent','Original title',?,'unknown-type','original body',19,0,?,?)`,
  ).run(id, filePath, updatedAt, deletedAt)
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
    const files = new Map<string, string>()
    for (const fn of Object.values(storage)) vi.mocked(fn).mockReset()
    vi.mocked(storage.deleteNoteFiles).mockImplementation((file, id) => {
      trace.push(`files:${JSON.stringify([file, id])}`)
      files.delete(file)
    })
    const uuid = vi.spyOn(crypto, 'randomUUID')
    const clock = vi.spyOn(Date, 'now')
    const getter = vi.spyOn(connection, 'getDb').mockImplementation(() => {
      trace.push('db')
      return nativeGetDb()
    })
    const off = subscribeDataChanges((payload) => {
      events.push(payload)
      trace.push(`event:${nativeGetDb().inTransaction}`)
    })
    const methods = original
      ? createNotesFilePathOracle({
          getDb: connection.getDb,
          nowMillis,
          emitDataChanged,
          writeNoteContent: storage.writeNoteContent,
          deleteNoteFiles: storage.deleteNoteFiles,
          saveNoteImageAsset: storage.saveNoteImageAsset,
          resolveNoteAssetPathFromFile: storage.resolveNoteAssetPathFromFile,
        })
      : service
    try {
      const result = run({
        db,
        methods,
        remove: original ? oldDeleteNoteRow : deleteNoteRow,
        files,
        trace,
        events,
      })
      for (const [name, fn] of Object.entries(storage)) {
        if (name !== 'deleteNoteFiles') expect(fn).not.toHaveBeenCalled()
      }
      expect(uuid).not.toHaveBeenCalled()
      expect(clock).not.toHaveBeenCalled()
      results.push({ result, trace, files: [...files], events, state: snapshot(nativeGetDb()) })
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

type Kind = 'lookup' | 'list' | 'delete'
function kindOf(query: string): Kind {
  if (/^\s*delete/i.test(query)) return 'delete'
  if (/select\s+\*/i.test(query)) return 'list'
  return 'lookup'
}

function track(
  db: Database.Database,
  trace: string[],
  options: {
    fail?: { kind: Kind; stage: 'prepare' | 'step'; error: unknown }
    result?: (native: Database.RunResult) => Database.RunResult
    afterList?: () => void
  } = {},
) {
  const nativePrepare = db.prepare.bind(db)
  const queries: { query: string; kind: Kind }[] = []
  const calls: { kind: Kind; method: string; args: unknown[] }[] = []
  const restores: (() => void)[] = []
  let returned: Database.RunResult | undefined
  let thrown: unknown
  const prepare = vi.spyOn(db, 'prepare').mockImplementation((query) => {
    const kind = kindOf(query)
    queries.push({ query, kind })
    trace.push(`prepare:${kind}`)
    try {
      if (options.fail?.kind === kind && options.fail.stage === 'prepare') throw options.fail.error
      const statement = nativePrepare(query)
      for (const method of ['get', 'all', 'run'] as const) {
        const nativeStep = statement[method].bind(statement)
        const step = vi.spyOn(statement, method).mockImplementation((...args: unknown[]) => {
          calls.push({ kind, method, args })
          trace.push(`${method}:${kind}`)
          try {
            if (options.fail?.kind === kind && options.fail.stage === 'step')
              throw options.fail.error
            const value = nativeStep(...args)
            if (kind === 'list') options.afterList?.()
            if (kind === 'delete' && method === 'run') {
              assert.ok(
                typeof value === 'object' &&
                  value !== null &&
                  'changes' in value &&
                  'lastInsertRowid' in value,
              )
              const result = value as Database.RunResult
              returned = options.result ? options.result(result) : result
              return returned
            }
            return value
          } catch (error) {
            thrown = error
            throw error
          }
        })
        restores.push(() => step.mockRestore())
      }
      return statement
    } catch (error) {
      thrown = error
      throw error
    }
  })
  return {
    queries,
    calls,
    returned: () => returned,
    thrown: () => thrown,
    restore() {
      prepare.mockRestore()
      for (const restore of restores) restore()
    },
  }
}

function assertDelete(tracking: ReturnType<typeof track>, id: unknown) {
  const queries = tracking.queries.filter(({ kind }) => kind === 'delete')
  expect(queries).toHaveLength(1)
  expect(queries[0]?.query.replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase()).toMatch(
    /^delete from notes where (?:notes\.)?id = \?$/,
  )
  expect(tracking.calls.filter(({ kind }) => kind === 'delete')).toEqual([
    { kind: 'delete', method: 'run', args: [id] },
  ])
}

describe('notes DELETE helper parity', () => {
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
  ])('deletes only exact literal ID %j including tombstones with one raw binding', (id) =>
    compare(({ db, remove, trace, events }) => {
      seed(db, id, 'raw/path', 1.75, 0)
      seed(db, 'untouched')
      const tracking = track(db, trace)
      let result
      try {
        result = remove(db, id)
        expect(result).toBe(tracking.returned())
        expect(result.changes).toBe(1)
        assertDelete(tracking, id)
        expect(tracking.queries).toHaveLength(1)
      } finally {
        tracking.restore()
      }
      expect(db.prepare('SELECT id FROM notes').all()).toEqual([{ id: 'untouched' }])
      expect(trace).toEqual(['prepare:delete', 'run:delete'])
      expect(events).toEqual([])
      return result
    }),
  )

  it.each(['missing', null, undefined])(
    'executes missing/null/undefined %j rather than skipping DELETE',
    (id) => {
      compare(({ db, remove, trace }) => {
        seed(db)
        seed(db, null)
        const before = snapshot(db)
        const tracking = track(db, trace)
        try {
          const result = Reflect.apply(remove, undefined, [db, id])
          expect(result).toBe(tracking.returned())
          expect(result.changes).toBe(0)
          assertDelete(tracking, id)
        } finally {
          tracking.restore()
        }
        expect(snapshot(db)).toEqual(before)
        expect(trace).toEqual(['prepare:delete', 'run:delete'])
      })
    },
  )

  it('derives actual array/object/Buffer and malformed binding results from original SQL', () => {
    for (const id of [
      [],
      ['note'],
      ['note', 'other'],
      {},
      { noteId: 'note' },
      Buffer.from('note'),
      true,
      Symbol('bad'),
      new Date(0),
      () => 'note',
    ]) {
      compare(({ db, remove, trace }) => {
        seed(db)
        const tracking = track(db, trace)
        let result
        try {
          result = outcome(() => Reflect.apply(remove, undefined, [db, id]))
          if (!result.error) expect(result.value).toBe(tracking.returned())
          assertDelete(tracking, id)
        } finally {
          tracking.restore()
        }
        expect(trace).toEqual(['prepare:delete', 'run:delete'])
        return result
      })
    }
  })

  it('preserves native result identity and bigint rowid on a safe-integer handle', () => {
    compare(({ db, remove, trace }) => {
      seed(db)
      db.defaultSafeIntegers(true)
      db.exec('CREATE TABLE rowid_probe (value TEXT)')
      db.prepare('INSERT INTO rowid_probe(rowid,value) VALUES (?,?)').run(
        9007199254740993n,
        'last insert',
      )
      const tracking = track(db, trace)
      let result
      try {
        result = remove(db, 'note')
        expect(result).toBe(tracking.returned())
        expect(result.lastInsertRowid).toBe(9007199254740993n)
        expect(result.changes).toBe(1)
      } finally {
        tracking.restore()
        db.defaultSafeIntegers(false)
      }
      return result
    })
  })

  it('returns the native result without reading changes', () => {
    compare(({ db, remove, trace }) => {
      seed(db)
      const tracking = track(db, trace, {
        result(native) {
          return {
            lastInsertRowid: native.lastInsertRowid,
            get changes(): number {
              throw new Error('do not read')
            },
          }
        },
      })
      try {
        expect(remove(db, 'note')).toBe(tracking.returned())
      } finally {
        tracking.restore()
      }
      expect(trace).toEqual(['prepare:delete', 'run:delete'])
    })
  })

  it.each(['note', 'missing', null])(
    'attempts query_only and actual readonly DELETE for %j',
    (id) => {
      compare(({ db, remove, trace }) => {
        seed(db)
        db.pragma('query_only=ON')
        const before = snapshot(db)
        const tracking = track(db, trace)
        let result
        try {
          result = outcome(() => Reflect.apply(remove, undefined, [db, id]))
          expect(result.error?.code).toBe('SQLITE_READONLY')
          assertDelete(tracking, id)
        } finally {
          tracking.restore()
        }
        expect(snapshot(db)).toEqual(before)
        db.pragma('query_only=OFF')
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-notes-delete-'))
        directories.push(directory)
        const file = path.join(directory, 'readonly.sqlite')
        db.prepare('VACUUM INTO ?').run(file)
        const readonly = new Database(file, { readonly: true })
        try {
          expect(outcome(() => Reflect.apply(remove, undefined, [readonly, id])).error?.code).toBe(
            'SQLITE_READONLY',
          )
        } finally {
          readonly.close()
        }
        return result
      })
    },
  )

  it.each(['table', 'id'] as const)('keeps damaged %s native errors at preparation', (damage) => {
    compare(({ db, remove, trace }) => {
      if (damage === 'table') db.exec('DROP TABLE notes')
      else db.exec('ALTER TABLE notes RENAME COLUMN id TO old_id')
      const tracking = track(db, trace)
      let caught: unknown
      try {
        Reflect.apply(remove, undefined, [db, null])
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
      expect(trace).toEqual(['prepare:delete'])
      return { name: caught.name, code: caught.code }
    })
  })

  it('uses explicit independent, closed and reinitialized handles without lifecycle acquisition', () => {
    compare(({ db, remove, methods, files, trace, events }) => {
      seed(db)
      const schema = db
        .prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE name='notes'")
        .get()
      assert.ok(schema)
      const other = new Database(':memory:')
      other.exec(schema.sql)
      seed(other)
      try {
        expect(remove(other, 'note').changes).toBe(1)
        expect(db.prepare('SELECT id FROM notes').all()).toEqual([{ id: 'note' }])
        expect(trace).toEqual([])
        expect(events).toEqual([])
        closeDb()
        expect(outcome(() => remove(db, 'note')).error?.message).toContain('not open')
        const closed = outcome(() => methods.deleteNote('note'))
        expect(closed.error?.message).toBe('Database not initialized. Call initDb() first.')
        expect(Date.now).not.toHaveBeenCalled()
        const next = initDbAtPath(':memory:')
        vi.mocked(Date.now).mockClear()
        seed(next, 'note', 'new.md')
        files.set('new.md', 'new')
        expect(methods.deleteNote('note')).toBe(true)
        expect(remove(other, 'note').changes).toBe(0)
        expect(files.size).toBe(0)
        return closed
      } finally {
        other.close()
      }
    })
  })
})

describe('notes DELETE service and batch boundary', () => {
  it.each(['synthetic/note.md', ''])(
    'keeps the files-first sequence for found raw path %j',
    (filePath) => {
      compare(({ db, methods, files, trace, events }) => {
        seed(db, 'note', filePath, 0, 0)
        files.set(filePath, 'body')
        const tracking = track(db, trace)
        try {
          expect(methods.deleteNote('note')).toBe(true)
          assertDelete(tracking, 'note')
        } finally {
          tracking.restore()
        }
        expect(trace).toEqual([
          'db',
          'prepare:lookup',
          'get:lookup',
          `files:${JSON.stringify([filePath, 'note'])}`,
          'prepare:delete',
          'run:delete',
          'event:false',
        ])
        expect(files.size).toBe(0)
        expect(events).toEqual([CHANGE])
      })
    },
  )

  it.each(['missing', null, undefined])(
    'service stops after missing %j lookup even when DELETE would fail',
    (id) => {
      compare(({ db, methods, files, trace, events }) => {
        seed(db, null)
        db.pragma('query_only=ON')
        const before = snapshot(db)
        const tracking = track(db, trace)
        try {
          expect(Reflect.apply(methods.deleteNote, undefined, [id])).toBe(false)
          expect(tracking.calls).toEqual([{ kind: 'lookup', method: 'get', args: [id] }])
          expect(tracking.queries).toHaveLength(1)
        } finally {
          tracking.restore()
        }
        expect(trace).toEqual(['db', 'prepare:lookup', 'get:lookup'])
        expect(files.size).toBe(0)
        expect(events).toEqual([])
        expect(snapshot(db)).toEqual(before)
      })
    },
  )

  it.each([
    'db',
    'lookup-prepare',
    'lookup-step',
    'files',
    'delete-prepare',
    'delete-step',
  ] as const)('preserves %s failure identity and earlier effects', (stage) => {
    compare(({ db, methods, files, trace, events }) => {
      seed(db)
      files.set('synthetic/note.md', 'body')
      const sentinel = { stage }
      const fail =
        stage === 'lookup-prepare' || stage === 'lookup-step'
          ? {
              kind: 'lookup' as const,
              stage: stage === 'lookup-prepare' ? ('prepare' as const) : ('step' as const),
              error: sentinel,
            }
          : stage === 'delete-prepare' || stage === 'delete-step'
            ? {
                kind: 'delete' as const,
                stage: stage === 'delete-prepare' ? ('prepare' as const) : ('step' as const),
                error: sentinel,
              }
            : undefined
      const tracking = track(db, trace, { fail })
      if (stage === 'db')
        vi.mocked(connection.getDb).mockImplementation(() => {
          trace.push('db')
          throw sentinel
        })
      if (stage === 'files')
        vi.mocked(storage.deleteNoteFiles).mockImplementation(() => {
          trace.push('files:throw')
          throw sentinel
        })
      let caught: unknown
      try {
        methods.deleteNote('note')
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      expect(caught).toBe(sentinel)
      const sequence = [
        'db',
        'prepare:lookup',
        'get:lookup',
        stage === 'files' ? 'files:throw' : 'files:["synthetic/note.md","note"]',
        'prepare:delete',
        'run:delete',
      ]
      expect(trace).toEqual(
        sequence.slice(
          0,
          ['db', 'lookup-prepare', 'lookup-step', 'files', 'delete-prepare', 'delete-step'].indexOf(
            stage,
          ) + 1,
        ),
      )
      expect(files.size).toBe(stage.startsWith('delete') ? 0 : 1)
      expect(db.prepare('SELECT id FROM notes').all()).toEqual([{ id: 'note' }])
      expect(events).toEqual([])
    })
  })

  it.each([
    [1, 0],
    [0, 1],
  ])('retains changes/event/changes reads %j without caching', (first, second) => {
    compare(({ db, methods, trace, events }) => {
      seed(db)
      const tracking = track(db, trace, {
        result(native) {
          let reads = 0
          return {
            lastInsertRowid: native.lastInsertRowid,
            get changes(): number {
              trace.push(`changes:${++reads}`)
              return reads === 1 ? first : second
            },
          }
        },
      })
      try {
        expect(methods.deleteNote('note')).toBe(second > 0)
      } finally {
        tracking.restore()
      }
      expect(trace.slice(6)).toEqual([
        'changes:1',
        ...(first > 0 ? ['event:false'] : []),
        'changes:2',
      ])
      expect(events).toEqual(first > 0 ? [CHANGE] : [])
    })
  })

  it.each(['IGNORE', 'FAIL', 'ABORT'] as const)(
    'preserves %s trigger/audit outcomes after files disappear',
    (mode) => {
      compare(({ db, methods, files, events }) => {
        seed(db)
        files.set('synthetic/note.md', 'body')
        db.exec(`CREATE TABLE note_audit (label TEXT);
        CREATE TRIGGER reject_delete BEFORE DELETE ON notes BEGIN
          INSERT INTO note_audit VALUES ('attempt');
          SELECT RAISE(${mode}${mode === 'IGNORE' ? '' : ", 'delete sentinel'"}); END`)
        const result = outcome(() => methods.deleteNote('note'))
        if (mode === 'IGNORE') expect(result.value).toBe(false)
        else expect(result.error?.code).toBe('SQLITE_CONSTRAINT_TRIGGER')
        expect(files.size).toBe(0)
        expect(db.prepare('SELECT id FROM notes').all()).toEqual([{ id: 'note' }])
        expect(db.prepare('SELECT * FROM note_audit').all()).toEqual(
          mode === 'ABORT' ? [] : [{ label: 'attempt' }],
        )
        expect(events).toEqual([])
        return result
      })
    },
  )

  it('retains files-first query_only failure without restoring deleted files', () => {
    compare(({ db, methods, files, trace, events }) => {
      seed(db)
      files.set('synthetic/note.md', 'body')
      db.pragma('query_only=ON')
      const tracking = track(db, trace)
      let result
      try {
        result = outcome(() => methods.deleteNote('note'))
        assertDelete(tracking, 'note')
      } finally {
        tracking.restore()
      }
      expect(result.error?.code).toBe('SQLITE_READONLY')
      expect(files.size).toBe(0)
      expect(db.prepare('SELECT id FROM notes').all()).toEqual([{ id: 'note' }])
      expect(events).toEqual([])
      return result
    })
  })

  it.each([false, true])(
    'preserves actual NULL-list ordering, counts and partial batch failure=%s',
    (fail) => {
      compare(({ db, methods, files, trace, events }) => {
        seed(db, 'first', 'first.md', 5)
        seed(db, null, 'anonymous.md', 4)
        seed(db, '', 'empty.md', 3, 0)
        seed(db, 'last', 'last.md', 2)
        for (const file of ['first.md', 'anonymous.md', 'empty.md', 'last.md'])
          files.set(file, 'body')
        if (fail)
          db.exec(
            "CREATE TRIGGER fail_delete BEFORE DELETE ON notes WHEN OLD.id='' BEGIN SELECT RAISE(ABORT,'batch sentinel'); END",
          )
        const tracking = track(db, trace)
        let result
        try {
          result = outcome(() => methods.deleteNotesByProblem('parent'))
          expect(
            tracking.calls.filter(({ kind }) => kind === 'lookup').map(({ args }) => args),
          ).toEqual(fail ? [['first'], [null], ['']] : [['first'], [null], [''], ['last']])
          expect(
            tracking.calls.filter(({ kind }) => kind === 'delete').map(({ args }) => args),
          ).toEqual(fail ? [['first'], ['']] : [['first'], [''], ['last']])
        } finally {
          tracking.restore()
        }
        if (fail) expect(result.error?.message).toBe('batch sentinel')
        else expect(result.value).toBe(3)
        expect([...files.keys()]).toEqual(fail ? ['anonymous.md', 'last.md'] : ['anonymous.md'])
        expect(events).toEqual(fail ? [CHANGE] : [CHANGE, CHANGE, CHANGE])
        return result
      })
    },
  )

  it('does not skip NULL batch lookup after the list succeeds and the table disappears', () => {
    compare(({ db, methods, files, trace, events }) => {
      seed(db, null)
      const tracking = track(db, trace, { afterList: () => db.exec('DROP TABLE notes') })
      let result
      try {
        result = outcome(() => methods.deleteNotesByProblem('parent'))
      } finally {
        tracking.restore()
      }
      expect(result.error?.message).toBe('no such table: notes')
      expect(trace).toEqual(['db', 'prepare:list', 'all:list', 'db', 'prepare:lookup'])
      expect(files.size).toBe(0)
      expect(events).toEqual([])
      return result
    })
  })

  it.each(['commit', 'rollback', 'inner-rollback', 'commit-failure'] as const)(
    'preserves %s database/topics without filesystem rollback',
    (mode) => {
      compare(({ db, methods, files, events }) => {
        seed(db, 'outer', 'outer.md')
        seed(db, 'inner', 'inner.md')
        files.set('outer.md', 'outer')
        files.set('inner.md', 'inner')
        if (mode === 'commit-failure')
          db.exec(`CREATE TRIGGER deletion_fk AFTER DELETE ON notes WHEN OLD.id='outer' BEGIN
        INSERT INTO submissions(id,problem_id,platform,platform_submission_id,verdict,submitted_at,created_at,updated_at)
        VALUES ('fk','missing','test','fk','WA',0,0,0); END`)
        let callbackFinished = false
        const result = outcome(() =>
          withDataChangeTransaction(() =>
            db.transaction(() => {
              if (mode === 'commit-failure') db.pragma('defer_foreign_keys=ON')
              expect(methods.deleteNote('outer')).toBe(true)
              const inner = () =>
                withDataChangeTransaction(() =>
                  db.transaction(() => {
                    expect(methods.deleteNote('inner')).toBe(true)
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
        expect(db.prepare('SELECT id FROM notes ORDER BY id').all()).toEqual(
          mode === 'commit'
            ? []
            : mode === 'inner-rollback'
              ? [{ id: 'inner' }]
              : [{ id: 'inner' }, { id: 'outer' }],
        )
        expect(files.size).toBe(0)
        if (mode === 'commit-failure') {
          expect(callbackFinished).toBe(true)
          expect(result.error?.code).toBe('SQLITE_CONSTRAINT_FOREIGNKEY')
        }
        expect(db.inTransaction).toBe(false)
        return { result, callbackFinished }
      })
    },
  )

  it('preserves reentrant visibility and isolates failed listeners from the delete result', () => {
    compare(({ db, methods, files, events }) => {
      seed(db, 'first', 'first.md')
      seed(db, 'second', 'second.md')
      files.set('first.md', 'first')
      files.set('second.md', 'second')
      const seen: unknown[] = []
      let entered = false
      const offFailure = subscribeDataChanges(() => {
        throw new Error('listener sentinel')
      })
      const offReentrant = subscribeDataChanges((payload) => {
        expect(payload).toEqual(CHANGE)
        seen.push(db.prepare('SELECT id FROM notes ORDER BY id').all())
        if (!entered) {
          entered = true
          expect(methods.deleteNote('second')).toBe(true)
        }
      })
      try {
        expect(methods.deleteNote('first')).toBe(true)
        expect(seen).toEqual([[{ id: 'second' }], []])
        expect(events).toEqual([CHANGE, CHANGE])
        expect(files.size).toBe(0)
      } finally {
        offReentrant()
        offFailure()
      }
      return seen
    })
  })
})
