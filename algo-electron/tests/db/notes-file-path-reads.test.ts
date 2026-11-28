import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as connection from '../../electron/db/connection'
import { closeDb, getDb, getKnownMigrations, initDbAtPath } from '../../electron/db/connection'
import { findNoteFilePath } from '../../electron/db/repositories/notes/file-path'
import * as service from '../../electron/notes/NoteService'
import * as storage from '../../electron/notes/noteStorage'
import * as text from '../../electron/notes/noteText'
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
  createNotesFilePathOracle,
  oldFindNoteFilePath,
  originalCountWords,
} from './notes-file-path-oracle'

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
const CONTENT = 'hello \u4e2d\u6587 42'
const nativeGetDb = getDb
const nativeCountWords = text.countWords
const directories: string[] = []
const actions = ['content', 'image', 'resolve', 'delete'] as const
type Action = (typeof actions)[number]
type Methods = Pick<
  typeof service,
  | 'updateNoteContent'
  | 'saveNoteImage'
  | 'resolveNoteAssetPath'
  | 'deleteNote'
  | 'deleteNotesByProblem'
  | 'getNotesByProblem'
>
type Scenario = {
  db: Database.Database
  methods: Methods
  lookup: typeof findNoteFilePath
  original: boolean
  trace: string[]
  files: Map<string, string>
  events: DataChangedPayload[]
}

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => {
  closeDb()
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const directory of directories.splice(0)) {
    assert.ok(
      path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-notes-read-`),
    )
    fs.rmSync(directory, { recursive: true, force: true })
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
    VALUES (?,'parent','Original title',?,'unknown-type','old body',19,0,?,?)`,
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
    changes: db.prepare('SELECT total_changes() AS count').get(),
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
    const files = new Map<string, string>()
    const events: DataChangedPayload[] = []
    vi.mocked(storage.writeNoteContent)
      .mockReset()
      .mockImplementation((file, content) => {
        trace.push(`write:${JSON.stringify([file, content])}`)
        files.set(file, content)
      })
    vi.mocked(storage.deleteNoteFiles)
      .mockReset()
      .mockImplementation((file, id) => {
        trace.push(`remove:${JSON.stringify([file, id])}`)
        files.delete(file)
      })
    vi.mocked(storage.saveNoteImageAsset)
      .mockReset()
      .mockImplementation((file, id, fileName, mime, data) => {
        trace.push(`image:${JSON.stringify([file, id, fileName, mime, [...new Uint8Array(data)]])}`)
        return { markdownUrl: `assets/${id}/image.png` }
      })
    vi.mocked(storage.resolveNoteAssetPathFromFile)
      .mockReset()
      .mockImplementation((file, id, url) => {
        trace.push(`resolve:${JSON.stringify([file, id, url])}`)
        return `synthetic/resolved/${url}`
      })
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      trace.push('clock')
      return NOW
    })
    const getter = vi.spyOn(connection, 'getDb').mockImplementation(() => {
      trace.push('db')
      return nativeGetDb()
    })
    const count = vi.spyOn(text, 'countWords').mockImplementation((value) => {
      trace.push('count')
      return nativeCountWords(value)
    })
    const off = subscribeDataChanges((payload) => {
      events.push(payload)
      trace.push(`event:${nativeGetDb().inTransaction}`)
    })
    const methods: Methods = original
      ? createNotesFilePathOracle({
          getDb: connection.getDb,
          nowMillis,
          emitDataChanged,
          writeNoteContent: storage.writeNoteContent,
          deleteNoteFiles: storage.deleteNoteFiles,
          saveNoteImageAsset: storage.saveNoteImageAsset,
          resolveNoteAssetPathFromFile: storage.resolveNoteAssetPathFromFile,
          countWords: (value) => {
            trace.push('count')
            return originalCountWords(value)
          },
        })
      : service
    try {
      const result = run({
        db,
        methods,
        lookup: original ? oldFindNoteFilePath : findNoteFilePath,
        original,
        trace,
        files,
        events,
      })
      results.push({ result, trace, files: [...files], events, state: snapshot(nativeGetDb()) })
    } finally {
      off()
      count.mockRestore()
      getter.mockRestore()
      clock.mockRestore()
      closeDb()
    }
  }
  expect(results[1]).toEqual(results[0])
}

type StatementKind = 'lookup' | 'list' | 'update' | 'delete'
function statementKind(query: string): StatementKind | undefined {
  const normalized = query.replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (normalized.startsWith('select file_path from notes')) return 'lookup'
  if (normalized.startsWith('select * from notes where problem_id')) return 'list'
  if (normalized.startsWith('update notes set content')) return 'update'
  if (normalized.startsWith('delete from notes where id')) return 'delete'
  return undefined
}

function track(
  db: Database.Database,
  trace: string[],
  fail?: { kind: StatementKind; stage: 'prepare' | 'step'; error: unknown },
  afterList?: () => void,
) {
  const prepare = db.prepare.bind(db)
  const statements: { query: string; method: string; bindings: unknown[] }[] = []
  const restores: (() => void)[] = []
  let thrown: unknown
  const spy = vi.spyOn(db, 'prepare').mockImplementation((query) => {
    const kind = statementKind(query)
    if (!kind) return prepare(query)
    trace.push(`prepare:${kind}`)
    if (fail?.kind === kind && fail.stage === 'prepare') {
      thrown = fail.error
      throw thrown
    }
    let statement
    try {
      statement = prepare(query)
    } catch (error) {
      thrown = error
      throw error
    }
    for (const method of ['get', 'all', 'run'] as const) {
      const execute = statement[method].bind(statement)
      const step = vi.spyOn(statement, method).mockImplementation((...bindings: unknown[]) => {
        statements.push({ query, method, bindings })
        trace.push(`${method}:${kind}:${JSON.stringify(bindings)}`)
        if (fail?.kind === kind && fail.stage === 'step') {
          thrown = fail.error
          throw thrown
        }
        try {
          const result = execute(...bindings)
          if (kind === 'list') afterList?.()
          return result
        } catch (error) {
          thrown = error
          throw error
        }
      })
      restores.push(() => step.mockRestore())
    }
    return statement
  })
  return {
    statements,
    error: () => thrown,
    restore: () => {
      spy.mockRestore()
      for (const restore of restores) restore()
    },
  }
}

function invoke(methods: Methods, action: Action, id = 'note'): unknown {
  switch (action) {
    case 'content':
      return methods.updateNoteContent(id, CONTENT)
    case 'image':
      return methods.saveNoteImage(id, 'upload.png', 'image/png', new Uint8Array([0, 128, 255]))
    case 'resolve':
      return methods.resolveNoteAssetPath(id, `assets/${id}/image.png`)
    case 'delete':
      return methods.deleteNote(id)
  }
}

describe('notes file-path query parity', () => {
  it.each([
    '',
    'Case',
    'case',
    ' spaced ',
    "O'Reilly",
    '%_\\',
    "' OR 1=1 --",
    '\u4e2d\u6587',
    'emoji-\ud83d\ude00',
    'with\0nul',
    '\ud800',
    'x'.repeat(201),
  ])('should bind exact ID %j and return only the raw file path without writes', (id) => {
    compare(({ db, lookup, trace, events }) => {
      seed(db, id, ' raw/path \u4e2d\u6587 ', 1.75, 0)
      seed(db, 'other', 'other/path')
      const before = snapshot(db)
      const tracking = track(db, trace)
      let result
      try {
        result = lookup(db, id)
        expect(result).toEqual({ file_path: ' raw/path \u4e2d\u6587 ' })
        expect(Object.keys(result ?? {})).toEqual(['file_path'])
        expect(tracking.statements).toHaveLength(1)
        expect(tracking.statements[0]?.method).toBe('get')
        expect(tracking.statements[0]?.bindings).toEqual([id])
        expect(tracking.statements[0]?.query.replaceAll('"', '').toLowerCase()).toMatch(
          /^select file_path from notes where (?:notes\.)?id = \?$/,
        )
      } finally {
        tracking.restore()
      }
      expect(trace).toEqual(['prepare:lookup', `get:lookup:${JSON.stringify([id])}`])
      expect(snapshot(db)).toEqual(before)
      expect(events).toEqual([])
      return result
    })
  })

  it('should distinguish an empty path from absent and bound-NULL rows including tombstones', () => {
    compare(({ db, lookup, trace }) => {
      seed(db, 'note', '', 0, 0)
      seed(db, null, 'anonymous1')
      seed(db, null, 'anonymous2')
      const before = snapshot(db)
      const tracking = track(db, trace)
      let result
      try {
        result = [
          lookup(db, 'note'),
          lookup(db, 'missing'),
          Reflect.apply(lookup, null, [db, null]),
        ]
      } finally {
        tracking.restore()
      }
      expect(result).toEqual([{ file_path: '' }, undefined, undefined])
      expect(trace).toEqual([
        'prepare:lookup',
        'get:lookup:["note"]',
        'prepare:lookup',
        'get:lookup:["missing"]',
        'prepare:lookup',
        'get:lookup:[null]',
      ])
      expect(snapshot(db)).toEqual(before)
      return result
    })
  })

  it('should use only the supplied handle across query-only, readonly, closed and independent databases', () => {
    compare(({ db, lookup, trace }) => {
      seed(db)
      db.pragma('query_only=ON')
      const before = snapshot(db)
      expect(lookup(db, 'note')).toEqual({ file_path: 'synthetic/note.md' })
      expect(snapshot(db)).toEqual(before)
      db.pragma('query_only=OFF')
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-notes-read-'))
      directories.push(directory)
      const target = path.join(directory, 'readonly.sqlite')
      db.prepare('VACUUM INTO ?').run(target)
      const readonly = new Database(target, { readonly: true })
      const other = new Database(':memory:')
      try {
        expect(readonly.readonly).toBe(true)
        expect(lookup(readonly, 'note')).toEqual({ file_path: 'synthetic/note.md' })
        const schema = db
          .prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE name='notes'")
          .get()
        assert.ok(schema)
        other.exec(schema.sql)
        seed(other, 'note', 'different/path')
        closeDb()
        expect(lookup(other, 'note')).toEqual({ file_path: 'different/path' })
        const closed = outcome(() => lookup(db, 'note'))
        expect(closed.error?.message).toContain('not open')
        expect(trace).toEqual([])
        const next = initDbAtPath(':memory:')
        seed(next, 'note', 'new/path')
        trace.length = 0
        expect(lookup(next, 'note')).toEqual({ file_path: 'new/path' })
        expect(lookup(other, 'note')).toEqual({ file_path: 'different/path' })
        expect(trace).toEqual([])
        return closed
      } finally {
        readonly.close()
        other.close()
      }
    })
  })

  it('should expose native uncommitted and savepoint values without retaining a stale read', () => {
    compare(({ db, lookup }) => {
      const seen = []
      expect(() =>
        db.transaction(() => {
          seed(db)
          seen.push(lookup(db, 'note'))
          expect(() =>
            db.transaction(() => {
              db.prepare('UPDATE notes SET file_path=? WHERE id=?').run('', 'note')
              seen.push(lookup(db, 'note'))
              throw new Error('inner rollback')
            })(),
          ).toThrow('inner rollback')
          seen.push(lookup(db, 'note'))
          throw new Error('outer rollback')
        })(),
      ).toThrow('outer rollback')
      seen.push(lookup(db, 'note'))
      expect(seen).toEqual([
        { file_path: 'synthetic/note.md' },
        { file_path: '' },
        { file_path: 'synthetic/note.md' },
        undefined,
      ])
      return seen
    })
  })
})

describe('notes orchestration preserves the original boundary', () => {
  it.each(actions)(
    'should preserve the %s missing-row outcome before any storage or clock',
    (action) => {
      compare(({ db, methods, trace, events }) => {
        const before = snapshot(db)
        const tracking = track(db, trace)
        let result
        try {
          result = outcome(() => invoke(methods, action))
        } finally {
          tracking.restore()
        }
        expect(result).toEqual(
          action === 'image'
            ? { error: { name: 'Error', message: '\u7b14\u8bb0\u4e0d\u5b58\u5728' } }
            : { value: action === 'resolve' ? null : false },
        )
        expect(trace).toEqual(['db', 'prepare:lookup', 'get:lookup:["note"]'])
        expect(snapshot(db)).toEqual(before)
        expect(events).toEqual([])
        return result
      })
    },
  )

  it.each(actions)(
    'should pass a found empty raw path through the unchanged %s storage branch',
    (action) => {
      compare(({ db, methods, trace }) => {
        seed(db, 'note', '', 0, 0)
        const tracking = track(db, trace)
        let result
        try {
          result = invoke(methods, action)
        } finally {
          tracking.restore()
        }
        expect(trace.slice(0, 3)).toEqual(['db', 'prepare:lookup', 'get:lookup:["note"]'])
        expect(trace[3]).toMatch(/^(write|image|resolve|remove):\[""/)
        if (action === 'content' || action === 'delete') expect(result).toBe(true)
        return result
      })
    },
  )

  it.each(actions)(
    'should preserve native %s lookup prepare/get failure identity outside storage catches',
    (action) => {
      for (const stage of ['prepare', 'step'] as const) {
        compare(({ db, methods, trace, files, events }) => {
          seed(db)
          const sentinel = { message: 'read sentinel', stage }
          const tracking = track(db, trace, { kind: 'lookup', stage, error: sentinel })
          let caught: unknown
          try {
            invoke(methods, action)
          } catch (error) {
            caught = error
          } finally {
            tracking.restore()
          }
          expect(caught).toBe(sentinel)
          expect(caught).toBe(tracking.error())
          expect(trace).toEqual([
            'db',
            'prepare:lookup',
            ...(stage === 'step' ? ['get:lookup:["note"]'] : []),
          ])
          expect(files.size).toBe(0)
          expect(events).toEqual([])
        })
      }
    },
  )

  it.each(actions)(
    'should fail %s before FS for missing tables and damaged columns with qualified native wording',
    (action) => {
      for (const damage of ['table', 'column']) {
        compare(({ db, methods, trace, original, events }) => {
          db.exec(
            damage === 'table'
              ? 'DROP TABLE notes'
              : 'ALTER TABLE notes RENAME COLUMN file_path TO old_path',
          )
          const tracking = track(db, trace)
          let caught: unknown
          try {
            invoke(methods, action)
          } catch (error) {
            caught = error
          } finally {
            tracking.restore()
          }
          expect(caught).toBe(tracking.error())
          assert.ok(caught instanceof Error && 'code' in caught)
          expect(caught.name).toBe('SqliteError')
          expect(caught.code).toBe('SQLITE_ERROR')
          if (damage === 'table') expect(caught.message).toBe('no such table: notes')
          else {
            expect(caught.message).toMatch(/^no such column:/)
            expect(caught.message).toContain('file_path')
            if (original) expect(caught.message).toBe('no such column: file_path')
          }
          expect(trace).toEqual(['db', 'prepare:lookup'])
          expect(events).toEqual([])
          return { name: caught.name, code: caught.code }
        })
      }
    },
  )

  it.each(actions)(
    'should retain %s database acquisition errors and the current connection after reinit',
    (action) => {
      compare(({ db, methods, trace }) => {
        seed(db)
        closeDb()
        const closed = outcome(() => invoke(methods, action))
        expect(closed.error?.message).toBe('Database not initialized. Call initDb() first.')
        expect(trace).toEqual(['db'])
        const next = initDbAtPath(':memory:')
        seed(next, 'note', 'next/path')
        trace.length = 0
        const tracking = track(next, trace)
        let result
        try {
          result = invoke(methods, action)
        } finally {
          tracking.restore()
        }
        expect(trace[3]).toContain('next/path')
        return { closed, result }
      })
    },
  )

  it('should preserve content file-clock-count-UPDATE-event order and only the three SET targets', () => {
    compare(({ db, methods, trace, events, files }) => {
      seed(db)
      db.exec(`CREATE TABLE note_audit (label TEXT);
        CREATE TRIGGER note_content AFTER UPDATE OF content,word_count,updated_at ON notes BEGIN INSERT INTO note_audit VALUES ('content'); END;
        CREATE TRIGGER note_other AFTER UPDATE OF title,note_type,file_path,created_at,deleted_at ON notes BEGIN INSERT INTO note_audit VALUES ('other'); END;`)
      const tracking = track(db, trace)
      try {
        expect(methods.updateNoteContent('note', CONTENT)).toBe(true)
      } finally {
        tracking.restore()
      }
      expect(trace).toEqual([
        'db',
        'prepare:lookup',
        'get:lookup:["note"]',
        `write:${JSON.stringify(['synthetic/note.md', CONTENT])}`,
        'clock',
        'count',
        'prepare:update',
        `run:update:${JSON.stringify([CONTENT, 4, NOW, 'note'])}`,
        'event:false',
      ])
      expect(files.get('synthetic/note.md')).toBe(CONTENT)
      expect(db.prepare('SELECT content,word_count,updated_at FROM notes').get()).toEqual({
        content: CONTENT,
        word_count: 4,
        updated_at: NOW,
      })
      expect(db.prepare('SELECT * FROM note_audit').all()).toEqual([{ label: 'content' }])
      expect(events).toEqual([{ tables: ['notes'] }])
    })
  })

  it.each(['file', 'clock', 'count', 'prepare', 'step'] as const)(
    'should catch content %s failure only after the original earlier effects',
    (stage) => {
      compare(({ db, methods, trace, files, events }) => {
        seed(db)
        const sentinel = new Error('content sentinel')
        if (stage === 'file')
          vi.mocked(storage.writeNoteContent).mockImplementationOnce(() => {
            trace.push('write:throw')
            throw sentinel
          })
        const clock =
          stage === 'clock'
            ? vi.spyOn(Date, 'now').mockImplementationOnce(() => {
                trace.push('clock:throw')
                throw sentinel
              })
            : undefined
        const content = stage === 'count' ? null : CONTENT
        const tracking = track(
          db,
          trace,
          stage === 'prepare' || stage === 'step'
            ? { kind: 'update', stage, error: sentinel }
            : undefined,
        )
        try {
          expect(Reflect.apply(methods.updateNoteContent, undefined, ['note', content])).toBe(false)
        } finally {
          tracking.restore()
          clock?.mockRestore()
        }
        expect(events).toEqual([])
        expect(db.prepare('SELECT content,word_count,updated_at FROM notes').get()).toEqual({
          content: 'old body',
          word_count: 19,
          updated_at: 2,
        })
        expect(files.has('synthetic/note.md')).toBe(stage !== 'file')
        expect(trace.some((entry) => entry.startsWith('prepare:update'))).toBe(
          stage === 'prepare' || stage === 'step',
        )
        expect(trace.some((entry) => entry.startsWith('count'))).toBe(
          stage !== 'file' && stage !== 'clock',
        )
      })
    },
  )

  it.each(['IGNORE', 'FAIL', 'ABORT'] as const)(
    'should retain content %s native effects and successful-run notification policy',
    (mode) => {
      compare(({ db, methods, files, events }) => {
        seed(db)
        db.exec(`CREATE TABLE note_audit (label TEXT);
        CREATE TRIGGER note_trigger BEFORE UPDATE ON notes BEGIN
          INSERT INTO note_audit VALUES ('attempt');
          SELECT RAISE(${mode}${mode === 'IGNORE' ? '' : ", 'write sentinel'"}); END;`)
        expect(methods.updateNoteContent('note', CONTENT)).toBe(mode === 'IGNORE')
        expect(files.get('synthetic/note.md')).toBe(CONTENT)
        expect(db.prepare('SELECT content FROM notes').get()).toEqual({ content: 'old body' })
        expect(db.prepare('SELECT * FROM note_audit').all()).toEqual(
          mode === 'ABORT' ? [] : [{ label: 'attempt' }],
        )
        expect(events).toEqual(mode === 'IGNORE' ? [{ tables: ['notes'] }] : [])
      })
    },
  )

  it.each(['image', 'resolve', 'delete'] as const)(
    'should preserve %s storage thrown-object identity without moving late SQL',
    (action) => {
      compare(({ db, methods, trace, events }) => {
        seed(db)
        const sentinel = { message: 'storage sentinel' }
        const storageMethod =
          action === 'image'
            ? storage.saveNoteImageAsset
            : action === 'resolve'
              ? storage.resolveNoteAssetPathFromFile
              : storage.deleteNoteFiles
        vi.mocked(storageMethod).mockImplementationOnce(() => {
          trace.push('storage:throw')
          throw sentinel
        })
        const tracking = track(db, trace)
        let caught: unknown
        try {
          invoke(methods, action)
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        expect(caught).toBe(sentinel)
        expect(trace).toEqual(['db', 'prepare:lookup', 'get:lookup:["note"]', 'storage:throw'])
        expect(events).toEqual([])
      })
    },
  )

  it.each(['prepare', 'step'] as const)(
    'should preserve delete %s failure after simulated file cleanup with no success event',
    (stage) => {
      compare(({ db, methods, trace, files, events }) => {
        seed(db)
        files.set('synthetic/note.md', 'old file')
        const sentinel = { message: 'delete sentinel' }
        const tracking = track(db, trace, { kind: 'delete', stage, error: sentinel })
        let caught: unknown
        try {
          methods.deleteNote('note')
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        expect(caught).toBe(sentinel)
        expect(files.has('synthetic/note.md')).toBe(false)
        expect(db.prepare('SELECT id FROM notes').all()).toEqual([{ id: 'note' }])
        expect(events).toEqual([])
        expect(trace.slice(0, 5)).toEqual([
          'db',
          'prepare:lookup',
          'get:lookup:["note"]',
          'remove:["synthetic/note.md","note"]',
          'prepare:delete',
        ])
      })
    },
  )

  it.each(['IGNORE', 'FAIL', 'ABORT'] as const)(
    'should retain deletion %s effects after cleanup without invented rollback',
    (mode) => {
      compare(({ db, methods, events, files }) => {
        seed(db)
        files.set('synthetic/note.md', 'old')
        db.exec(`CREATE TABLE note_audit (label TEXT);
        CREATE TRIGGER note_trigger BEFORE DELETE ON notes BEGIN
          INSERT INTO note_audit VALUES ('attempt');
          SELECT RAISE(${mode}${mode === 'IGNORE' ? '' : ", 'delete sentinel'"}); END;`)
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

  it.each(actions)(
    'should retain %s query-only read success and unchanged later write failure',
    (action) => {
      compare(({ db, methods, events, trace }) => {
        seed(db)
        db.pragma('query_only=ON')
        const before = snapshot(db)
        const tracking = track(db, trace)
        let result
        try {
          result = outcome(() => invoke(methods, action))
        } finally {
          tracking.restore()
        }
        expect(trace.slice(0, 3)).toEqual(['db', 'prepare:lookup', 'get:lookup:["note"]'])
        if (action === 'content') expect(result.value).toBe(false)
        if (action === 'delete') expect(result.error?.code).toBe('SQLITE_READONLY')
        expect(events).toEqual([])
        expect(snapshot(db)).toEqual(before)
        return result
      })
    },
  )

  it('should bind actual NULL list IDs in batch order without touching their files or counting them', () => {
    compare(({ db, methods, trace, files, events }) => {
      seed(db, 'first', 'first.md', 5)
      seed(db, null, 'anonymous1.md', 4)
      seed(db, '', 'empty.md', 3, 0)
      seed(db, null, 'anonymous2.md', 2)
      for (const file of ['first.md', 'anonymous1.md', 'empty.md', 'anonymous2.md'])
        files.set(file, file)
      const tracking = track(db, trace)
      try {
        expect(methods.deleteNotesByProblem('parent')).toBe(2)
        expect(
          tracking.statements
            .filter(({ query }) => statementKind(query) === 'lookup')
            .map(({ bindings }) => bindings),
        ).toEqual([['first'], [null], [''], [null]])
      } finally {
        tracking.restore()
      }
      expect([...files.keys()]).toEqual(['anonymous1.md', 'anonymous2.md'])
      expect(events).toEqual([{ tables: ['notes'] }, { tables: ['notes'] }])
      expect(db.prepare('SELECT id,file_path FROM notes ORDER BY updated_at DESC').all()).toEqual([
        { id: null, file_path: 'anonymous1.md' },
        { id: null, file_path: 'anonymous2.md' },
      ])
    })
  })

  it('should still prepare and throw for a NULL batch ID after its list read and table loss', () => {
    compare(({ db, methods, trace, events }) => {
      seed(db, null)
      const tracking = track(db, trace, undefined, () => db.exec('DROP TABLE notes'))
      let result
      try {
        result = outcome(() => methods.deleteNotesByProblem('parent'))
      } finally {
        tracking.restore()
      }
      expect(result.error?.message).toBe('no such table: notes')
      expect(trace).toEqual(['db', 'prepare:list', 'all:list:["parent"]', 'db', 'prepare:lookup'])
      expect(events).toEqual([])
      return result
    })
  })

  it('should retain earlier batch autocommits and events before a later delete fails', () => {
    compare(({ db, methods, files, events }) => {
      seed(db, 'first', 'first.md', 5)
      seed(db, null, 'anonymous.md', 4)
      seed(db, 'fail', 'fail.md', 3)
      seed(db, 'last', 'last.md', 2)
      for (const file of ['first.md', 'anonymous.md', 'fail.md', 'last.md']) files.set(file, file)
      db.exec(
        "CREATE TRIGGER fail_delete BEFORE DELETE ON notes WHEN OLD.id='fail' BEGIN SELECT RAISE(ABORT, 'batch sentinel'); END",
      )
      const result = outcome(() => methods.deleteNotesByProblem('parent'))
      expect(result.error?.message).toBe('batch sentinel')
      expect(events).toEqual([{ tables: ['notes'] }])
      expect([...files.keys()]).toEqual(['anonymous.md', 'last.md'])
      expect(db.prepare('SELECT id FROM notes ORDER BY updated_at DESC').all()).toEqual([
        { id: null },
        { id: 'fail' },
        { id: 'last' },
      ])
      return result
    })
  })

  it.each(['commit', 'rollback', 'inner-rollback', 'commit-failure'] as const)(
    'should preserve %s database/event scope without rolling back simulated files',
    (mode) => {
      compare(({ db, methods, files, events }) => {
        seed(db, 'note', 'note.md')
        seed(db, 'delete', 'delete.md')
        files.set('note.md', 'old')
        files.set('delete.md', 'old')
        if (mode === 'commit-failure')
          db.exec(`CREATE TRIGGER notes_fk AFTER UPDATE ON notes BEGIN
        INSERT INTO submissions(id,problem_id,platform,platform_submission_id,verdict,submitted_at,created_at,updated_at)
        VALUES ('fk','missing','test','fk','WA',0,0,0); END`)
        let callbackFinished = false
        const result = outcome(() =>
          withDataChangeTransaction(() =>
            db.transaction(() => {
              if (mode === 'commit-failure') db.pragma('defer_foreign_keys=ON')
              expect(methods.updateNoteContent('note', CONTENT)).toBe(true)
              const inner = () =>
                withDataChangeTransaction(() =>
                  db.transaction(() => {
                    expect(methods.deleteNote('delete')).toBe(true)
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
        expect(events).toEqual(committed ? [{ tables: ['notes'] }] : [])
        expect(db.prepare('SELECT content FROM notes WHERE id=?').get('note')).toEqual({
          content: committed ? CONTENT : 'old body',
        })
        expect(db.prepare('SELECT id FROM notes WHERE id=?').get('delete')).toEqual(
          mode === 'commit' ? undefined : { id: 'delete' },
        )
        expect(files.get('note.md')).toBe(CONTENT)
        expect(files.has('delete.md')).toBe(false)
        if (mode === 'commit-failure') {
          expect(callbackFinished).toBe(true)
          expect(result.error?.code).toBe('SQLITE_CONSTRAINT_FOREIGNKEY')
        }
        expect(db.inTransaction).toBe(false)
        return { result, callbackFinished }
      })
    },
  )
})
