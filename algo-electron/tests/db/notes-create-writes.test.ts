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
  prepareCreateNoteInsert,
  type CreateNoteValues,
} from '../../electron/db/repositories/notes/create'
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
import { originalCountWords } from './notes-file-path-oracle'
import { createNotesCreateOracle, oldPrepareCreateNoteInsert } from './notes-create-oracle'

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
const ID = '00000000-0000-4000-8000-000000000001'
const SECOND_ID = '00000000-0000-4000-8000-000000000002'
const CHANGE = { tables: ['notes'] }
const nativeGetDb = getDb
const nativeCountWords = text.countWords
const directories: string[] = []
const ORIGINAL_SQL =
  'insert into notes (id, problem_id, title, file_path, note_type, content, word_count, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)'
const SEQUENCE = [
  'db',
  'clock',
  'uuid',
  'parent:1',
  'type',
  'content',
  'title:1',
  'file',
  'count',
  'prepare',
  'parent:2',
  'title:2',
  'run',
  'event:false',
  'parent:3',
  'title:3',
]
type Scenario = {
  db: Database.Database
  prepare: typeof prepareCreateNoteInsert
  create: typeof service.createNote
  files: Map<string, string>
  trace: string[]
  events: DataChangedPayload[]
  original: boolean
  hit: (stage: string) => void
  failAt: (stage: string, error: unknown) => void
}

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => {
  closeDb()
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const directory of directories.splice(0)) {
    const target = path.resolve(directory)
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()))
    assert.ok(path.basename(target).startsWith('algo-notes-create-'))
    assert.equal(fs.lstatSync(target).isSymbolicLink(), false)
    assert.equal(path.dirname(fs.realpathSync(target)), fs.realpathSync(os.tmpdir()))
    fs.rmSync(target, { recursive: true, force: true })
  }
})

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
    let failure: { stage: string; error: unknown } | undefined
    const hit = (stage: string) => {
      trace.push(stage)
      if (failure?.stage === stage) throw failure.error
    }
    for (const fn of Object.values(storage)) vi.mocked(fn).mockReset()
    vi.mocked(storage.createNoteFile).mockImplementation((parent, id, title, content) => {
      hit('file')
      const file = `synthetic/${parent}/${id}.md`
      files.set(file, `# ${title}\n\n${content}`)
      return file
    })
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      hit('clock')
      return NOW
    })
    const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      hit('uuid')
      return ID
    })
    const getter = vi.spyOn(connection, 'getDb').mockImplementation(() => {
      hit('db')
      return nativeGetDb()
    })
    const count = vi.spyOn(text, 'countWords').mockImplementation((value) => {
      hit('count')
      return nativeCountWords(value)
    })
    const off = subscribeDataChanges((payload) => {
      events.push(payload)
      trace.push(`event:${nativeGetDb().inTransaction}`)
    })
    const old = createNotesCreateOracle({
      getDb: connection.getDb,
      nowMillis,
      randomUUID: crypto.randomUUID,
      createNoteFile: storage.createNoteFile,
      emitDataChanged,
      countWords(value) {
        hit('count')
        return originalCountWords(value)
      },
    })
    try {
      const result = run({
        db,
        prepare: original ? oldPrepareCreateNoteInsert : prepareCreateNoteInsert,
        create: original ? old.createNote : service.createNote,
        files,
        trace,
        events,
        original,
        hit,
        failAt: (stage, error) => {
          failure = { stage, error }
        },
      })
      for (const [name, fn] of Object.entries(storage)) {
        if (name !== 'createNoteFile') expect(fn).not.toHaveBeenCalled()
      }
      results.push({ result, trace, files: [...files], events, state: snapshot(nativeGetDb()) })
    } finally {
      off()
      count.mockRestore()
      getter.mockRestore()
      uuid.mockRestore()
      clock.mockRestore()
      closeDb()
    }
  }
  expect(results[1]).toEqual(results[0])
}

function track(
  db: Database.Database,
  hit: (stage: string) => void,
  options: {
    result?: (native: Database.RunResult) => unknown
    afterPrepare?: () => void
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
    if (normalized !== ORIGINAL_SQL && !normalized.startsWith('with note_create_values as '))
      return nativePrepare(query)
    queries.push(normalized)
    try {
      hit('prepare')
      const statement = nativePrepare(query)
      options.afterPrepare?.()
      const nativeRun = statement.run.bind(statement)
      const run = vi.spyOn(statement, 'run').mockImplementation((...args: unknown[]) => {
        bindings.push(args)
        try {
          hit('run')
          const native = nativeRun(...args)
          returned = options.result ? options.result(native) : native
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

function assertInsert(tracking: ReturnType<typeof track>, original: boolean, args: unknown[]) {
  expect(tracking.queries).toHaveLength(1)
  const query = tracking.queries[0]
  expect(query?.match(/\?/g)).toHaveLength(9)
  if (original) expect(query).toBe(ORIGINAL_SQL)
  else {
    expect(query).toContain('with note_create_values as (select ? as id, ? as problem_id')
    expect(query).toContain(
      'insert into notes (id, problem_id, title, file_path, note_type, created_at, updated_at, content, word_count, deleted_at) select',
    )
    expect(query).toContain('null as deleted_at')
    expect(query).not.toMatch(/returning|on conflict/)
  }
  expect(tracking.bindings).toEqual([args])
  for (const [index, value] of args.entries()) expect(tracking.bindings[0]?.[index]).toBe(value)
}

function payload(overrides: Partial<CreateNoteValues> = {}): CreateNoteValues {
  return {
    id: 'helper',
    problemId: null,
    title: 'Title',
    filePath: 'synthetic/helper.md',
    noteType: 'solution',
    content: 'body',
    wordCount: 1,
    now: NOW,
    ...overrides,
  }
}

function argumentsOf(values: CreateNoteValues): unknown[] {
  return [
    values.id,
    values.problemId,
    values.title,
    values.filePath,
    values.noteType,
    values.content,
    values.wordCount,
    values.now,
    values.now,
  ]
}

function trackedInput(hit: Scenario['hit']): service.CreateNoteInput {
  let parents = 0
  let titles = 0
  return {
    get problem_id() {
      hit(`parent:${++parents}`)
      return `parent-${parents}`
    },
    get title() {
      hit(`title:${++titles}`)
      return `Title ${titles}`
    },
    get note_type(): service.NoteType {
      hit('type')
      return 'review'
    },
    get content() {
      hit('content')
      return 'hello \u4e2d\u6587 42'
    },
  }
}

function stored(db: Database.Database) {
  return db
    .prepare(
      `SELECT *,typeof(content) AS content_type,typeof(word_count) AS count_type,
    typeof(created_at) AS created_type,typeof(updated_at) AS updated_type
    FROM notes ORDER BY rowid`,
    )
    .all()
}

// This differential suite uses the Node compatibility driver; actual native acceptance is separate.
describe('notes create service ordering and independent original parity', () => {
  it.each([
    { title: 'Defaults' },
    { title: 'Standalone', problem_id: null },
    { title: 'Orphan', problem_id: 'missing-parent', note_type: 'review' as const },
    { title: 'Summary', note_type: 'summary' as const, content: 'hello \u4e2d\u6587 42' },
    { title: '', problem_id: '', content: '' },
    { title: 'Whitespace', content: ' \n\t ' },
    { title: 'Line\n# Two', content: '# actual body\n\nnext' },
    { title: "O'Reilly %_\\", content: '\ud83d\ude00\u4e2d\u6587\0nul' },
  ])('preserves defaults/header/exact returned fields for $title', (input) => {
    compare(({ db, create, hit, trace, files, events, original }) => {
      const tracking = track(db, hit)
      let result
      try {
        result = create(input)
        assertInsert(tracking, original, [
          ID,
          input.problem_id ?? null,
          input.title,
          `synthetic/${input.problem_id ?? '_standalone'}/${ID}.md`,
          input.note_type ?? 'solution',
          input.content ?? '',
          originalCountWords(input.content ?? ''),
          NOW,
          NOW,
        ])
      } finally {
        tracking.restore()
      }
      expect(Object.keys(result)).toEqual([
        'id',
        'problem_id',
        'title',
        'file_path',
        'note_type',
        'content',
        'word_count',
        'created_at',
        'updated_at',
      ])
      expect(result.created_at).toBe(NOW)
      expect(result.updated_at).toBe(NOW)
      expect(files.get(result.file_path)).toBe(`# ${input.title}\n\n${input.content ?? ''}`)
      expect(db.prepare('SELECT * FROM notes').get()).toEqual({ ...result, deleted_at: null })
      expect(trace).toEqual([
        'db',
        'clock',
        'uuid',
        'file',
        'count',
        'prepare',
        'run',
        'event:false',
      ])
      expect(events).toEqual([CHANGE])
      return result
    })
  })

  it('keeps all three stateful getters at their original file/prepare/event stages', () => {
    compare(({ db, create, hit, trace, files, events, original }) => {
      const tracking = track(db, hit)
      let result
      try {
        result = create(trackedInput(hit))
        assertInsert(tracking, original, [
          ID,
          'parent-2',
          'Title 2',
          `synthetic/parent-1/${ID}.md`,
          'review',
          'hello \u4e2d\u6587 42',
          4,
          NOW,
          NOW,
        ])
      } finally {
        tracking.restore()
      }
      expect(trace).toEqual(SEQUENCE)
      expect(result.problem_id).toBe('parent-3')
      expect(result.title).toBe('Title 3')
      expect(files.get(result.file_path)).toBe('# Title 1\n\nhello \u4e2d\u6587 42')
      expect(db.prepare('SELECT problem_id,title FROM notes').get()).toEqual({
        problem_id: 'parent-2',
        title: 'Title 2',
      })
      expect(events).toEqual([CHANGE])
      return result
    })
  })

  it.each(SEQUENCE.filter((stage) => !stage.startsWith('event:')))(
    'propagates exact thrown object at %s without moving later effects',
    (stage) => {
      compare(({ db, create, hit, failAt, trace, files, events }) => {
        const sentinel = { stage }
        failAt(stage, sentinel)
        const tracking = track(db, hit)
        let caught: unknown
        try {
          create(trackedInput(hit))
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        expect(caught).toBe(sentinel)
        const index = SEQUENCE.indexOf(stage)
        expect(trace).toEqual(SEQUENCE.slice(0, index + 1))
        expect(files.size).toBe(index > SEQUENCE.indexOf('file') ? 1 : 0)
        const committed = index > SEQUENCE.indexOf('run')
        expect(db.prepare('SELECT id FROM notes').all()).toEqual(committed ? [{ id: ID }] : [])
        expect(events).toEqual(committed ? [CHANGE] : [])
        if (stage === 'prepare' || stage === 'run') expect(caught).toBe(tracking.thrown())
      })
    },
  )

  it('retains clock/UUID work before a malformed input fails', () => {
    compare(({ create, trace }) => {
      const result = outcome(() => Reflect.apply(create, undefined, [null]))
      expect(result.error?.name).toBe('TypeError')
      expect(trace).toEqual(['db', 'clock', 'uuid'])
      return result
    })
  })

  it.each(['undefined', 'throwing-getters'] as const)(
    'ignores native result %s entirely',
    (mode) => {
      compare(({ db, create, prepare, hit, events }) => {
        const tracking = track(db, hit, {
          result() {
            if (mode === 'undefined') return undefined
            return {
              get changes(): number {
                throw new Error('changes must not be read')
              },
              get lastInsertRowid(): number {
                throw new Error('rowid must not be read')
              },
            }
          },
        })
        try {
          expect(prepare(db).run(payload())).toBe(tracking.returned())
          expect(create({ title: 'Service' }).title).toBe('Service')
        } finally {
          tracking.restore()
        }
        expect(events).toEqual([CHANGE])
        expect(db.prepare('SELECT count(*) AS n FROM notes').get()).toEqual({ n: 2 })
      })
    },
  )

  it('retains independent nullable fallback on each parent read', () => {
    compare(({ db, create, files }) => {
      let reads = 0
      const result = create({
        title: 'Fallbacks',
        get problem_id() {
          reads++
          return reads === 1 ? null : reads === 2 ? 'db-only' : undefined
        },
      })
      expect(reads).toBe(3)
      expect(result.problem_id).toBeNull()
      expect(files.has(`synthetic/_standalone/${ID}.md`)).toBe(true)
      expect(db.prepare('SELECT problem_id FROM notes').get()).toEqual({ problem_id: 'db-only' })
      return result
    })
  })

  it('does not read second input fields before native preparation completes', () => {
    compare(({ db, create, hit }) => {
      const input = { title: 'Before prepare', problem_id: 'file-parent' }
      const tracking = track(db, hit, {
        afterPrepare() {
          input.title = 'After prepare'
          input.problem_id = 'db-parent'
        },
      })
      let result
      try {
        result = create(input)
      } finally {
        tracking.restore()
      }
      expect(result.title).toBe('After prepare')
      expect(result.file_path).toBe(`synthetic/file-parent/${ID}.md`)
      expect(db.prepare('SELECT title,problem_id FROM notes').get()).toEqual({
        title: 'After prepare',
        problem_id: 'db-parent',
      })
      return result
    })
  })

  it('keeps committed visibility, reentrancy and listener mutation before return getters', () => {
    compare(({ db, create, events }) => {
      const input = { title: 'Outer', problem_id: 'before-event' }
      const seen: unknown[] = []
      let entered = false
      const offFailure = subscribeDataChanges(() => {
        throw new Error('listener sentinel')
      })
      const off = subscribeDataChanges(() => {
        seen.push(db.prepare('SELECT title FROM notes ORDER BY rowid').all())
        if (!entered) {
          entered = true
          input.title = 'Returned title'
          input.problem_id = 'after-event'
          vi.mocked(crypto.randomUUID).mockReturnValue(SECOND_ID)
          expect(create({ title: 'Reentrant' }).title).toBe('Reentrant')
        }
      })
      let result
      try {
        result = create(input)
      } finally {
        off()
        offFailure()
      }
      expect(result.title).toBe('Returned title')
      expect(result.problem_id).toBe('after-event')
      expect(seen).toEqual([[{ title: 'Outer' }], [{ title: 'Outer' }, { title: 'Reentrant' }]])
      expect(events).toEqual([CHANGE, CHANGE])
      return { result, seen }
    })
  })

  it.each(['IGNORE', 'FAIL', 'ABORT'] as const)(
    'preserves %s trigger/audit and files-first behavior',
    (mode) => {
      compare(({ db, create, events, files }) => {
        db.exec(`CREATE TABLE note_audit (label TEXT);
        CREATE TRIGGER reject_create BEFORE INSERT ON notes BEGIN
          INSERT INTO note_audit VALUES ('attempt');
          SELECT RAISE(${mode}${mode === 'IGNORE' ? '' : ", 'create sentinel'"}); END`)
        const result = outcome(() => create({ title: 'Attempt', content: 'body' }))
        if (mode === 'IGNORE') expect(result.value).toMatchObject({ id: ID, title: 'Attempt' })
        else expect(result.error?.code).toBe('SQLITE_CONSTRAINT_TRIGGER')
        expect(db.prepare('SELECT * FROM notes').all()).toEqual([])
        expect(db.prepare('SELECT * FROM note_audit').all()).toEqual(
          mode === 'ABORT' ? [] : [{ label: 'attempt' }],
        )
        expect(files.get(`synthetic/_standalone/${ID}.md`)).toBe('# Attempt\n\nbody')
        expect(events).toEqual(mode === 'IGNORE' ? [CHANGE] : [])
        return result
      })
    },
  )

  it('leaves overwritten collision bytes and the earlier autocommit event/row intact', () => {
    compare(({ db, create, events, files }) => {
      const first = create({ title: 'First', content: 'original' })
      const result = outcome(() => create({ title: 'Collision', content: 'new file only' }))
      expect(result.error?.code).toBe('SQLITE_CONSTRAINT_PRIMARYKEY')
      expect(db.prepare('SELECT * FROM notes').get()).toEqual({ ...first, deleted_at: null })
      expect(files.get(first.file_path)).toBe('# Collision\n\nnew file only')
      expect(events).toEqual([CHANGE])
      return result
    })
  })

  it('does not compensate for a storage failure after bytes were written', () => {
    compare(({ create, files, events }) => {
      const sentinel = new Error('late storage failure')
      vi.mocked(storage.createNoteFile).mockImplementation((parent, id, title, content) => {
        files.set(`synthetic/${parent}/${id}.md`, `# ${title}\n\n${content}`)
        throw sentinel
      })
      expect(() => create({ title: 'Late file' })).toThrow(sentinel)
      expect(files.size).toBe(1)
      expect(events).toEqual([])
    })
  })

  it('writes the file before a query_only INSERT fails', () => {
    compare(({ db, create, files, events }) => {
      db.pragma('query_only=ON')
      const before = snapshot(db)
      const result = outcome(() => create({ title: 'Readonly' }))
      expect(result.error?.code).toBe('SQLITE_READONLY')
      expect(snapshot(db)).toEqual(before)
      expect(files.size).toBe(1)
      expect(events).toEqual([])
      return result
    })
  })
})

function diagnosticValues(overrides: Partial<Record<keyof CreateNoteValues, unknown>>) {
  return { ...payload(), ...overrides } as CreateNoteValues
}

describe('notes create eager helper raw-argument parity', () => {
  it('prepares once eagerly, retains explicit handle and reuses only its native statement', () => {
    compare(({ db, prepare, hit, trace, files, events }) => {
      const tracking = track(db, hit)
      try {
        const prepared = prepare(db)
        expect(trace).toEqual(['prepare'])
        expect(tracking.bindings).toEqual([])
        expect(prepared.run(payload())).toBe(tracking.returned())
        expect(prepared.run(payload({ id: 'second' }))).toBe(tracking.returned())
        expect(trace).toEqual(['prepare', 'run', 'run'])
        expect(tracking.queries).toHaveLength(1)
        expect(tracking.bindings).toEqual([
          argumentsOf(payload()),
          argumentsOf(payload({ id: 'second' })),
        ])
      } finally {
        tracking.restore()
      }
      expect(files.size).toBe(0)
      expect(events).toEqual([])
      return stored(db)
    })
  })

  it.each(['prepare', 'run'] as const)('retains helper %s thrown-object identity', (stage) => {
    compare(({ db, prepare, hit, failAt, trace }) => {
      const sentinel = { stage }
      failAt(stage, sentinel)
      const tracking = track(db, hit)
      let caught: unknown
      try {
        prepare(db).run(payload())
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      expect(caught).toBe(sentinel)
      expect(caught).toBe(tracking.thrown())
      expect(trace).toEqual(stage === 'prepare' ? ['prepare'] : ['prepare', 'run'])
    })
  })

  it.each([
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
  ])('binds exact literal ID %j with all nine arguments', (id) => {
    compare(({ db, prepare, hit, original, events }) => {
      const values = payload({
        id,
        problemId: 'orphan',
        noteType: 'not-enum',
        content: 'body\0\u4e2d',
        now: 0,
      })
      const tracking = track(db, hit)
      let result
      try {
        result = prepare(db).run(values)
        expect(result).toBe(tracking.returned())
        expect(result.changes).toBe(1)
        assertInsert(tracking, original, argumentsOf(values))
      } finally {
        tracking.restore()
      }
      expect(events).toEqual([])
      return { result, rows: stored(db) }
    })
  })

  it.each(['title', 'filePath', 'noteType', 'content', 'wordCount', 'now'] as const)(
    'preserves explicit NULL/undefined assignment to %s rather than supplying a default',
    (field) => {
      for (const value of [null, undefined])
        compare(({ db, prepare, hit, original }) => {
          const values = diagnosticValues({ [field]: value })
          const tracking = track(db, hit)
          let result
          try {
            result = outcome(() => prepare(db).run(values))
            assertInsert(tracking, original, argumentsOf(values))
          } finally {
            tracking.restore()
          }
          expect(result.error?.code).toBe('SQLITE_CONSTRAINT_NOTNULL')
          expect(db.prepare('SELECT * FROM notes').all()).toEqual([])
          return result
        })
    },
  )

  it.each([null, undefined])('retains nullable ID/parent bindings %j', (value) => {
    compare(({ db, prepare, hit, original }) => {
      const values = diagnosticValues({ id: value, problemId: value })
      const tracking = track(db, hit)
      let result
      try {
        result = outcome(() => prepare(db).run(values))
        assertInsert(tracking, original, argumentsOf(values))
      } finally {
        tracking.restore()
      }
      return { result, rows: stored(db) }
    })
  })

  it.each([
    ['fraction', { wordCount: 1.25, now: 2.75 }],
    ['negative', { wordCount: -1, now: -3 }],
    ['safe-edge', { now: Number.MAX_SAFE_INTEGER }],
    ['out-of-Date', { now: 8.64e15 + 1 }],
    ['numeric-text', { content: 42, wordCount: '17.5', now: '18.25' }],
    ['raw-text', { wordCount: 'not-count', now: 'not-time' }],
    [
      'buffers',
      { content: Buffer.from([0, 255]), wordCount: Buffer.from([1]), now: Buffer.from([2]) },
    ],
    ['bigint', { content: 9n, wordCount: 12n, now: 9007199254740993n }],
    ['infinity', { wordCount: Infinity, now: -Infinity }],
    ['nan-count', { wordCount: NaN }],
    ['nan-time', { now: NaN }],
  ] as const)('retains raw scalar/storage outcome %s', (_label, overrides) => {
    compare(({ db, prepare, hit, original }) => {
      const values = diagnosticValues(overrides)
      const tracking = track(db, hit)
      let result
      try {
        result = outcome(() => prepare(db).run(values))
        assertInsert(tracking, original, argumentsOf(values))
        if (!result.error) expect(result.value).toBe(tracking.returned())
      } finally {
        tracking.restore()
      }
      return { result, rows: stored(db) }
    })
  })

  it('derives container/first-invalid outcomes from old SQL without alternate-driver assumptions', () => {
    const cases: Partial<Record<keyof CreateNoteValues, unknown>>[] = [
      { content: ['body', 'count-injected', 41], wordCount: 7, now: [] },
      { content: ['body'] },
      { id: ['id'], content: ['body'], wordCount: [2], now: [3] },
      { content: 'body', wordCount: [1, 2] },
      { id: {}, content: 'body' },
      { title: {}, content: {}, now: {} },
      { content: Symbol('content') },
      { content: 'body', now: true },
      { content: 'body', now: new Date(0) },
      { content: () => 'body' },
      { content: Symbol('content'), now: 2n ** 63n },
      { content: 2n ** 63n, now: Symbol('time') },
    ]
    for (const overrides of cases)
      compare(({ db, prepare, hit, original }) => {
        const values = diagnosticValues(overrides)
        const tracking = track(db, hit)
        let result
        try {
          result = outcome(() => prepare(db).run(values))
          assertInsert(tracking, original, argumentsOf(values))
        } finally {
          tracking.restore()
        }
        return { result, rows: stored(db) }
      })
  })

  it('retains frozen030 NULL deleted_at and before/after NEW values without reselecting', () => {
    compare(({ db, prepare, hit, original }) => {
      db.exec(`CREATE TABLE create_audit(phase TEXT, id TEXT, parent TEXT, title TEXT, file TEXT,
        kind TEXT, body TEXT, words, created, updated, deleted, note_rowid);
        CREATE TRIGGER create_before BEFORE INSERT ON notes BEGIN
          INSERT INTO create_audit VALUES ('before',NEW.id,NEW.problem_id,NEW.title,NEW.file_path,
          NEW.note_type,NEW.content,NEW.word_count,NEW.created_at,NEW.updated_at,NEW.deleted_at,NEW.rowid); END;
        CREATE TRIGGER create_after AFTER INSERT ON notes BEGIN
          INSERT INTO create_audit VALUES ('after',NEW.id,NEW.problem_id,NEW.title,NEW.file_path,
          NEW.note_type,NEW.content,NEW.word_count,NEW.created_at,NEW.updated_at,NEW.deleted_at,NEW.rowid); END`)
      const values = payload({ now: 0, problemId: 'orphan' })
      const tracking = track(db, hit)
      try {
        expect(prepare(db).run(values).changes).toBe(1)
        assertInsert(tracking, original, argumentsOf(values))
      } finally {
        tracking.restore()
      }
      expect(db.prepare('SELECT deleted_at FROM notes').get()).toEqual({ deleted_at: null })
      expect(db.prepare('SELECT phase,deleted FROM create_audit').all()).toEqual([
        { phase: 'before', deleted: null },
        { phase: 'after', deleted: null },
      ])
      return {
        rows: stored(db),
        audit: db.prepare('SELECT * FROM create_audit ORDER BY rowid').all(),
      }
    })
  })

  it('uses alternate/read-only handles, propagates closed errors, and does not cache across reinit', () => {
    compare(({ db, prepare, events, trace }) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-notes-create-'))
      directories.push(directory)
      const file = path.join(directory, 'alternate.sqlite')
      db.prepare('VACUUM INTO ?').run(file)
      const alternate = new Database(file)
      const local = prepare(alternate)
      expect(local.run(payload()).changes).toBe(1)
      const alternateRows = stored(alternate)
      alternate.close()
      const closedPrepare = outcome(() => prepare(alternate))
      const closedRun = outcome(() => local.run(payload({ id: 'closed' })))
      expect(closedPrepare.error).toBeDefined()
      expect(closedRun.error).toBeDefined()
      const readonly = new Database(file, { readonly: true })
      let denied
      try {
        denied = outcome(() => prepare(readonly).run(payload({ id: 'denied' })))
      } finally {
        readonly.close()
      }
      expect(denied.error?.code).toBe('SQLITE_READONLY')
      expect(db.prepare('SELECT * FROM notes').all()).toEqual([])
      const first = prepare(db)
      closeDb()
      const fresh = initDbAtPath(':memory:')
      applyDrizzleMigrations(
        fresh,
        loadMigrationResources(path.resolve('drizzle')),
        getKnownMigrations(),
      )
      expect(outcome(() => first.run(payload({ id: 'stale' }))).error).toBeDefined()
      expect(prepare(fresh).run(payload({ id: 'fresh' })).changes).toBe(1)
      expect(events).toEqual([])
      // Connection initialization has its own clock usage, equally observed on both branches.
      expect(trace.every((item) => item === 'clock')).toBe(true)
      return { alternateRows, closedPrepare, closedRun, denied, freshRows: stored(fresh) }
    })
  })
})

describe('notes create caller-owned transaction boundaries', () => {
  it.each(['commit', 'rollback', 'inner-rollback', 'commit-failure'] as const)(
    'preserves %s database/topics but never rolls back files',
    (mode) => {
      compare(({ db, create, files, events, trace }) => {
        if (mode === 'commit-failure')
          db.exec(`CREATE TRIGGER creation_fk AFTER INSERT ON notes
          WHEN NEW.id='${ID}' BEGIN
          INSERT INTO submissions(id,problem_id,platform,platform_submission_id,verdict,submitted_at,created_at,updated_at)
          VALUES ('fk','missing','test','fk','WA',0,0,0); END`)
        let callbackFinished = false
        const result = outcome(() =>
          withDataChangeTransaction(() =>
            db.transaction(() => {
              if (mode === 'commit-failure') db.pragma('defer_foreign_keys=ON')
              expect(create({ title: 'Outer' }).id).toBe(ID)
              vi.mocked(crypto.randomUUID).mockReturnValue(SECOND_ID)
              const inner = () =>
                withDataChangeTransaction(() =>
                  db.transaction(() => {
                    expect(create({ title: 'Inner' }).id).toBe(SECOND_ID)
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
        expect(callbackFinished).toBe(mode !== 'rollback')
        if (mode === 'commit-failure')
          expect(result.error?.code).toBe('SQLITE_CONSTRAINT_FOREIGNKEY')
        expect(db.inTransaction).toBe(false)
        expect(events).toEqual(committed ? [CHANGE] : [])
        expect(trace.filter((item) => item.startsWith('event:'))).toEqual(
          committed ? ['event:false'] : [],
        )
        expect(db.prepare('SELECT id FROM notes ORDER BY rowid').all()).toEqual(
          mode === 'commit'
            ? [{ id: ID }, { id: SECOND_ID }]
            : mode === 'inner-rollback'
              ? [{ id: ID }]
              : [],
        )
        expect(files.size).toBe(2)
        expect(files.get(`synthetic/_standalone/${ID}.md`)).toBe('# Outer\n\n')
        expect(files.get(`synthetic/_standalone/${SECOND_ID}.md`)).toBe('# Inner\n\n')
        return result
      })
    },
  )
})
