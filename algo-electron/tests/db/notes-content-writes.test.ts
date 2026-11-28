import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as connection from '../../electron/db/connection'
import { closeDb, getDb, getKnownMigrations, initDbAtPath } from '../../electron/db/connection'
import { updateNoteContentRow } from '../../electron/db/repositories/notes/content'
import * as service from '../../electron/notes/NoteService'
import * as storage from '../../electron/notes/noteStorage'
import * as text from '../../electron/notes/noteText'
import { nowMillis } from '../../electron/shared/time'
import { emitDataChanged, subscribeDataChanges } from '../../electron/shared/dataEvents'
import { applyDrizzleMigrations } from '../../src/main/db/migrate'
import { loadMigrationResources } from '../../src/main/db/migration-resources'
import type { DataChangedPayload } from '../../src/shared/types/data'
import { createNotesFilePathOracle, originalCountWords } from './notes-file-path-oracle'
import { oldUpdateNoteContentRow } from './notes-content-oracle'

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
const nativeCountWords = text.countWords
const directories: string[] = []
const ORIGINAL_SQL = 'update notes set content = ?, word_count = ?, updated_at = ? where id = ?'
const CTE_SQL =
  'with note_write_values as (select ? as content, ? as word_count, ? as updated_at, ? as note_id from (select 1)) update notes set updated_at = (select updated_at from note_write_values), content = (select content from note_write_values), word_count = (select word_count from note_write_values) where notes.id = (select note_id from note_write_values)'
type Scenario = {
  db: Database.Database
  update: typeof updateNoteContentRow
  save: typeof service.updateNoteContent
  files: Map<string, string>
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
    assert.ok(path.basename(target).startsWith('algo-notes-content-'))
    assert.equal(fs.lstatSync(target).isSymbolicLink(), false)
    assert.equal(path.dirname(fs.realpathSync(target)), fs.realpathSync(os.tmpdir()))
    fs.rmSync(target, { recursive: true, force: true })
  }
})

function seed(db: Database.Database, id: unknown = 'note', deletedAt: number | null = null) {
  db.prepare(
    `INSERT INTO notes
    (id,problem_id,title,file_path,note_type,content,word_count,created_at,updated_at,deleted_at)
    VALUES (?,NULL,'Original title','synthetic/note.md','unknown-type','original body',19,0,2,?)`,
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
    const files = new Map<string, string>()
    for (const fn of Object.values(storage)) vi.mocked(fn).mockReset()
    vi.mocked(storage.writeNoteContent).mockImplementation((file, content) => {
      trace.push('write')
      files.set(file, content)
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
    const old = createNotesFilePathOracle({
      getDb: connection.getDb,
      nowMillis,
      emitDataChanged,
      writeNoteContent: storage.writeNoteContent,
      deleteNoteFiles: storage.deleteNoteFiles,
      saveNoteImageAsset: storage.saveNoteImageAsset,
      resolveNoteAssetPathFromFile: storage.resolveNoteAssetPathFromFile,
      countWords(value) {
        trace.push('count')
        return originalCountWords(value)
      },
    })
    try {
      const result = run({
        db,
        update: original ? oldUpdateNoteContentRow : updateNoteContentRow,
        save: original ? old.updateNoteContent : service.updateNoteContent,
        files,
        trace,
        events,
        original,
      })
      for (const [name, fn] of Object.entries(storage)) {
        if (name !== 'writeNoteContent') expect(fn).not.toHaveBeenCalled()
      }
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

function track(
  db: Database.Database,
  trace: string[],
  options: {
    fail?: { stage: 'prepare' | 'run'; error: unknown }
    result?: (native: Database.RunResult) => unknown
  } = {},
) {
  const nativePrepare = db.prepare.bind(db)
  const queries: string[] = []
  const bindings: unknown[][] = []
  const restores: (() => void)[] = []
  let returned: unknown
  let thrown: unknown
  const prepare = vi.spyOn(db, 'prepare').mockImplementation((query) => {
    const normalized = query.replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase()
    if (normalized !== ORIGINAL_SQL && normalized !== CTE_SQL) return nativePrepare(query)
    queries.push(normalized)
    trace.push('prepare:update')
    try {
      if (options.fail?.stage === 'prepare') throw options.fail.error
      const statement = nativePrepare(query)
      const nativeRun = statement.run.bind(statement)
      const run = vi.spyOn(statement, 'run').mockImplementation((...args: unknown[]) => {
        bindings.push(args)
        trace.push('run:update')
        try {
          if (options.fail?.stage === 'run') throw options.fail.error
          const native = nativeRun(...args)
          returned = options.result ? options.result(native) : native
          // The service deliberately ignores even malformed native diagnostic results.
          return returned as Database.RunResult
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

function assertUpdate(tracking: ReturnType<typeof track>, original: boolean, args: unknown[]) {
  expect(tracking.queries).toEqual([original ? ORIGINAL_SQL : CTE_SQL])
  expect(tracking.bindings).toEqual([args])
  for (const [index, value] of args.entries()) expect(tracking.bindings[0]?.[index]).toBe(value)
}

function stored(db: Database.Database) {
  return db
    .prepare(
      `SELECT *,typeof(content) AS content_type,
    typeof(word_count) AS count_type,typeof(updated_at) AS time_type FROM notes ORDER BY rowid`,
    )
    .all()
}

describe('notes content ignored-result service boundary', () => {
  it.each(['throwing-getters', 'undefined'] as const)(
    'ignores native result %s in helper and service',
    (mode) => {
      compare(({ db, update, save, trace, files, events, original }) => {
        seed(db)
        const tracking = track(db, trace, {
          result() {
            if (mode === 'undefined') return undefined
            return {
              get changes(): number {
                throw new Error('changes must remain unread')
              },
              get lastInsertRowid(): number {
                throw new Error('rowid must remain unread')
              },
            }
          },
        })
        try {
          expect(update(db, 'note', 'helper body', 2, 0)).toBe(tracking.returned())
          assertUpdate(tracking, original, ['helper body', 2, 0, 'note'])
          tracking.queries.length = 0
          tracking.bindings.length = 0
          trace.length = 0
          expect(save('note', 'service body')).toBe(true)
          assertUpdate(tracking, original, ['service body', 2, NOW, 'note'])
        } finally {
          tracking.restore()
        }
        expect(trace).toEqual([
          'db',
          'write',
          'clock',
          'count',
          'prepare:update',
          'run:update',
          'event:false',
        ])
        expect(files.get('synthetic/note.md')).toBe('service body')
        expect(events).toEqual([CHANGE])
        expect(db.prepare('SELECT content,word_count,updated_at FROM notes').get()).toEqual({
          content: 'service body',
          word_count: 2,
          updated_at: NOW,
        })
      })
    },
  )

  it('still emits and succeeds when the row disappears after lookup and file writing', () => {
    compare(({ db, save, trace, files, events, original }) => {
      seed(db)
      vi.mocked(storage.writeNoteContent).mockImplementation((file, content) => {
        trace.push('write')
        files.set(file, content)
        db.prepare('DELETE FROM notes WHERE id=?').run('note')
      })
      const tracking = track(db, trace)
      try {
        expect(save('note', 'new body')).toBe(true)
        assertUpdate(tracking, original, ['new body', 2, NOW, 'note'])
        expect(tracking.returned()).toMatchObject({ changes: 0 })
      } finally {
        tracking.restore()
      }
      expect(trace).toEqual([
        'db',
        'write',
        'clock',
        'count',
        'prepare:update',
        'run:update',
        'event:false',
      ])
      expect(db.prepare('SELECT * FROM notes').all()).toEqual([])
      expect(files.get('synthetic/note.md')).toBe('new body')
      expect(events).toEqual([CHANGE])
    })
  })

  it('preserves reentrant committed visibility and guards throwing listeners', () => {
    compare(({ db, save, files, events }) => {
      seed(db)
      const seen: unknown[] = []
      let entered = false
      const offFailure = subscribeDataChanges(() => {
        throw new Error('listener sentinel')
      })
      const offReentrant = subscribeDataChanges(() => {
        seen.push(db.prepare('SELECT content FROM notes').get())
        if (!entered) {
          entered = true
          expect(save('note', 'reentrant body')).toBe(true)
        }
      })
      try {
        expect(save('note', 'first body')).toBe(true)
        expect(seen).toEqual([{ content: 'first body' }, { content: 'reentrant body' }])
        expect(files.get('synthetic/note.md')).toBe('reentrant body')
        expect(events).toEqual([CHANGE, CHANGE])
      } finally {
        offReentrant()
        offFailure()
      }
      return seen
    })
  })
})

describe('notes content helper parity', () => {
  it.each(['prepare', 'run'] as const)('preserves injected %s thrown-object identity', (stage) => {
    compare(({ db, update, trace }) => {
      seed(db)
      const sentinel = { stage }
      const tracking = track(db, trace, { fail: { stage, error: sentinel } })
      let caught: unknown
      try {
        update(db, 'note', 'body', 4, NOW)
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      expect(caught).toBe(sentinel)
      expect(caught).toBe(tracking.thrown())
      expect(trace).toEqual(
        stage === 'prepare' ? ['prepare:update'] : ['prepare:update', 'run:update'],
      )
    })
  })

  it.each(['note', 'missing', null])('attempts query_only and readonly writes for %j', (id) => {
    compare(({ db, update, trace, original }) => {
      seed(db)
      db.pragma('query_only=ON')
      const before = snapshot(db)
      const tracking = track(db, trace)
      let result
      try {
        result = outcome(() => Reflect.apply(update, undefined, [db, id, 'body', 4, NOW]))
        expect(result.error?.code).toBe('SQLITE_READONLY')
        assertUpdate(tracking, original, ['body', 4, NOW, id])
      } finally {
        tracking.restore()
      }
      expect(snapshot(db)).toEqual(before)
      db.pragma('query_only=OFF')
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-notes-content-'))
      directories.push(directory)
      const file = path.join(directory, 'readonly.sqlite')
      db.prepare('VACUUM INTO ?').run(file)
      const readonly = new Database(file, { readonly: true })
      try {
        expect(
          outcome(() => Reflect.apply(update, undefined, [readonly, id, 'body', 4, NOW])).error
            ?.code,
        ).toBe('SQLITE_READONLY')
      } finally {
        readonly.close()
      }
      return result
    })
  })
  it.each([1, 2, 3, 4, 5, 6, 7])('retains assignments for NULL/undefined mask %s', (mask) => {
    for (const value of [null, undefined])
      for (const id of ['note', 'missing']) {
        const content = mask & 1 ? value : 'body'
        const count = mask & 2 ? value : 4
        const now = mask & 4 ? value : 17
        compare(({ db, update, trace, original }) => {
          seed(db)
          const tracking = track(db, trace)
          let result
          try {
            result = outcome(() => Reflect.apply(update, undefined, [db, id, content, count, now]))
            assertUpdate(tracking, original, [content, count, now, id])
          } finally {
            tracking.restore()
          }
          if (id === 'missing') expect(result.value).toMatchObject({ changes: 0 })
          else expect(result.error?.code).toBe('SQLITE_CONSTRAINT_NOTNULL')
          return { result, rows: stored(db) }
        })
      }
  })

  it('derives malformed binding outcomes from old SQL without driver assumptions', () => {
    const cases: unknown[][] = [
      [['body', 'injected'], 2, [], 'note'],
      [['body'], 2, 3, 'note'],
      [['body'], [2], [3], ['note']],
      ['body', [1, 2], 3, 'note'],
      [{ content: 'body' }, 2, 3, 'note'],
      [{}, 2, {}, 'note'],
      ['body', 2, 3, {}],
      [Symbol('content'), 2, 3, 'note'],
      ['body', 2, true, 'note'],
      ['body', 2, new Date(0), 'note'],
      [() => 'body', 2, 3, 'note'],
      [Symbol('content'), 2, 2n ** 63n, 'note'],
      [2n ** 63n, 2, Symbol('time'), 'note'],
    ]
    for (const [content, count, now, id] of cases) {
      compare(({ db, update, trace, original }) => {
        seed(db)
        const tracking = track(db, trace)
        let result
        try {
          result = outcome(() => Reflect.apply(update, undefined, [db, id, content, count, now]))
          assertUpdate(tracking, original, [content, count, now, id])
        } finally {
          tracking.restore()
        }
        return { result, rows: stored(db) }
      })
    }
  })
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
  ])('binds exact ID %j with four arguments and untouched result identity', (id) => {
    compare(({ db, update, trace, events, original }) => {
      seed(db, id, 0)
      seed(db, 'untouched')
      const tracking = track(db, trace)
      let result
      try {
        result = update(db, id, 'changed\0\u4e2d\ud83d\ude00', 1.25, 0)
        expect(result).toBe(tracking.returned())
        expect(result.changes).toBe(1)
        assertUpdate(tracking, original, ['changed\0\u4e2d\ud83d\ude00', 1.25, 0, id])
      } finally {
        tracking.restore()
      }
      expect(db.prepare('SELECT content FROM notes WHERE id=?').get('untouched')).toEqual({
        content: 'original body',
      })
      expect(trace).toEqual(['prepare:update', 'run:update'])
      expect(events).toEqual([])
      return { result, rows: stored(db) }
    })
  })

  it.each(['missing', null, undefined])('runs UPDATE for unmatched ID %j', (id) => {
    compare(({ db, update, trace, original }) => {
      seed(db)
      seed(db, null)
      const before = snapshot(db)
      const tracking = track(db, trace)
      try {
        const result = Reflect.apply(update, undefined, [db, id, 'body', 2, NOW])
        expect(result).toBe(tracking.returned())
        expect(result.changes).toBe(0)
        assertUpdate(tracking, original, ['body', 2, NOW, id])
      } finally {
        tracking.restore()
      }
      expect(snapshot(db)).toEqual(before)
    })
  })

  it.each([
    ['zero', '', 0, 0],
    ['fraction', 'body', 1.25, 2.75],
    ['negative', 'body', -1, -3],
    ['safe-edge', 'body', 2, Number.MAX_SAFE_INTEGER],
    ['out-of-Date', 'body', 2, 8.64e15 + 1],
    ['numeric-text', 42, '17.5', '18.25'],
    ['raw-text', 'body', 'not-count', 'not-time'],
    ['buffers', Buffer.from([0, 255]), Buffer.from([1]), Buffer.from([2])],
    ['bigint', 9n, 12n, 9007199254740993n],
    ['infinity', 'body', Infinity, -Infinity],
    ['nan-count', 'body', NaN, 0],
    ['nan-time', 'body', 0, NaN],
  ])('preserves raw scalar/storage outcome %s', (_label, content, count, now) => {
    compare(({ db, update, trace, original }) => {
      seed(db)
      const tracking = track(db, trace)
      let result
      try {
        result = outcome(() => Reflect.apply(update, undefined, [db, 'note', content, count, now]))
        assertUpdate(tracking, original, [content, count, now, 'note'])
        if (!result.error) expect(result.value).toBe(tracking.returned())
      } finally {
        tracking.restore()
      }
      return { result, rows: stored(db) }
    })
  })
})
