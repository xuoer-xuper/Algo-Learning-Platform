import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { app, net, protocol, session } from 'electron'
import type Database from 'better-sqlite3'
import type { DataChangedPayload } from '../../src/shared/types/data'

type Connection = typeof import('../../electron/db/connection')
type Service = typeof import('../../electron/notes/NoteService')
type Storage = typeof import('../../electron/notes/noteStorage')
type Events = typeof import('../../electron/shared/dataEvents')
type Oracle = typeof import('../db/notes-file-path-oracle')
type NoteProtocol = typeof import('../../electron/notes/noteAssetProtocol')
type Fixture = { id: string; filePath: string; assetsDir: string }
type Harness = {
  directory: string
  db: Database.Database
  events: DataChangedPayload[]
  trace: string[]
}

const NOW = 1_768_443_630_123
const UUID = '00000000-0000-4000-8000-000000000001'
const CONTENT = 'hello \u4e2d\u6587 42'
const initialBody = 'old body'
let ownedRoot: string | undefined
let connection: Connection | undefined
let service: Service
let storage: Storage
let dataEvents: Events
let oracleModule: Oracle
let caseNumber = 0
let passed = 0
let protocolRegistered = false

function contained(parent: string, target: string): string {
  const absolute = path.resolve(target)
  const relative = path.relative(path.resolve(parent), absolute)
  assert.ok(
    relative.length > 0 &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative),
    `Expected a strict child of the owned test directory: ${absolute}`,
  )
  return absolute
}

function root(): string {
  assert.ok(ownedRoot, 'Test root must be initialized before application imports')
  return ownedRoot
}

function currentConnection(): Connection {
  assert.ok(connection, 'Database module must be loaded after path isolation')
  return connection
}

function sqliteError(action: () => unknown, code = 'SQLITE_ERROR'): Error {
  try {
    action()
  } catch (error) {
    assert.ok(error instanceof Error)
    assert.equal(error.name, 'SqliteError')
    assert.equal(Reflect.get(error, 'code'), code)
    return error
  }
  assert.fail('Expected a native SQLite exception')
}

async function test(name: string, run: (harness: Harness) => void | Promise<void>): Promise<void> {
  const directory = contained(root(), path.join(root(), `case-${++caseNumber}`))
  fs.mkdirSync(directory)
  app.setPath('userData', directory)
  const db = currentConnection().initDbAtPath(
    contained(directory, path.join(directory, 'notes.sqlite')),
  )
  const events: DataChangedPayload[] = []
  const trace: string[] = []
  const unsubscribe = dataEvents.subscribeDataChanges((payload) => {
    events.push(payload)
    trace.push(`event:${JSON.stringify(payload)}`)
  })
  let primary: unknown
  let failed = false
  try {
    await run({ directory, db, events, trace })
    passed++
    console.log(`[PASS] notes storage: ${name}`)
  } catch (error) {
    primary = error
    failed = true
  } finally {
    for (const cleanup of [
      unsubscribe,
      () => currentConnection().closeDb(),
      () => app.setPath('userData', root()),
    ]) {
      try {
        cleanup()
      } catch (error) {
        if (failed) console.error('[FAIL] notes case cleanup (primary preserved)', error)
        else {
          primary = error
          failed = true
        }
      }
    }
  }
  if (failed) throw primary
}

function seed(
  h: Harness,
  id: string,
  options: { nullable?: boolean; updatedAt?: number; deleted?: boolean } = {},
): Fixture {
  assert.match(id, /^[a-z][a-z0-9-]*$/)
  const filePath = contained(h.directory, path.join(h.directory, 'notes', 'problem', `${id}.md`))
  assert.equal(storage.createNoteFile('problem', id, 'Title', initialBody), filePath)
  const assetsDir = contained(h.directory, path.join(path.dirname(filePath), 'assets', id))
  h.db
    .prepare(
      `INSERT INTO notes
    (id, problem_id, title, file_path, note_type, content, word_count, created_at, updated_at, deleted_at)
    VALUES (?, 'problem', 'Title', ?, 'solution', ?, 2, 0, ?, ?)`,
    )
    .run(
      options.nullable ? null : id,
      filePath,
      initialBody,
      options.updatedAt ?? 1,
      options.deleted ? 0 : null,
    )
  return { id, filePath, assetsDir }
}

function assertFixture(h: Harness, fixture: Fixture): void {
  contained(h.directory, fixture.filePath)
  contained(h.directory, fixture.assetsDir)
}

function addAsset(h: Harness, fixture: Fixture): string {
  assertFixture(h, fixture)
  fs.mkdirSync(fixture.assetsDir, { recursive: true })
  const asset = contained(fixture.assetsDir, path.join(fixture.assetsDir, 'existing.png'))
  fs.writeFileSync(asset, Buffer.from([1, 2, 3]))
  return asset
}

function noteState(h: Harness, id: string): unknown {
  return h.db
    .prepare('SELECT content, word_count, updated_at, deleted_at FROM notes WHERE id = ?')
    .get(id)
}

function statementKind(source: string): string {
  const normalized = source.replace(/"/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (/^select file_path from notes /.test(normalized)) return 'lookup'
  if (/^select \* from notes /.test(normalized)) return 'list'
  if (/^update notes /.test(normalized)) return 'update'
  if (/^delete from notes /.test(normalized)) return 'delete'
  return normalized.split(' ')[0]
}

function observeDatabase(
  h: Harness,
  options: { prepareError?: unknown; getError?: unknown } = {},
): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(h.db, 'prepare')
  const original = h.db.prepare
  Object.defineProperty(h.db, 'prepare', {
    configurable: true,
    value: (source: string) => {
      const kind = statementKind(source)
      h.trace.push(`prepare:${kind}`)
      if (kind === 'lookup' && options.prepareError !== undefined) throw options.prepareError
      const statement: Database.Statement = Reflect.apply(original, h.db, [source])
      for (const method of ['get', 'run', 'all'] as const) {
        const execute = statement[method]
        Object.defineProperty(statement, method, {
          configurable: true,
          value: (...parameters: unknown[]) => {
            h.trace.push(`${method}:${kind}:${JSON.stringify(parameters)}`)
            if (kind === 'lookup' && method === 'get' && options.getError !== undefined)
              throw options.getError
            return Reflect.apply(execute, statement, parameters)
          },
        })
      }
      return statement
    },
  })
  return () => {
    if (descriptor) Object.defineProperty(h.db, 'prepare', descriptor)
    else Reflect.deleteProperty(h.db, 'prepare')
  }
}

function observeFiles(h: Harness): () => void {
  const restore: Array<() => void> = []
  for (const method of [
    'writeFileSync',
    'mkdirSync',
    'unlinkSync',
    'rmSync',
    'existsSync',
  ] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(fs, method)
    assert.ok(descriptor)
    const original = fs[method]
    Object.defineProperty(fs, method, {
      ...descriptor,
      value: (...args: unknown[]) => {
        const target = args[0]
        assert.equal(typeof target, 'string', 'Storage test paths must be explicit owned strings')
        if (typeof target !== 'string') assert.fail('Expected a path')
        const absolute = contained(h.directory, target)
        h.trace.push(`fs:${method}:${path.relative(h.directory, absolute).replace(/\\/g, '/')}`)
        return Reflect.apply(original, fs, args)
      },
    })
    restore.push(() => Object.defineProperty(fs, method, descriptor))
  }
  return () => restore.reverse().forEach((undo) => undo())
}

function observeClock(h: Harness): () => void {
  const now = Date.now
  const uuid = crypto.randomUUID
  Date.now = () => {
    h.trace.push('clock')
    return NOW
  }
  crypto.randomUUID = () => {
    h.trace.push('uuid')
    return UUID
  }
  return () => {
    Date.now = now
    crypto.randomUUID = uuid
  }
}

function observed<T>(
  h: Harness,
  action: () => T,
  options: { prepareError?: unknown; getError?: unknown } = {},
): T {
  const restoreDb = observeDatabase(h, options)
  const restoreFiles = observeFiles(h)
  const restoreClock = observeClock(h)
  try {
    return action()
  } finally {
    restoreClock()
    restoreFiles()
    restoreDb()
  }
}

function ordered(trace: string[], prefixes: string[]): void {
  let index = -1
  for (const prefix of prefixes) {
    const next = trace.findIndex(
      (entry, candidate) => candidate > index && entry.startsWith(prefix),
    )
    assert.ok(next > index, `Missing ordered ${prefix} in ${JSON.stringify(trace)}`)
    index = next
  }
}

function actionSet(id: string): Array<() => unknown> {
  return [
    () => service.updateNoteContent(id, CONTENT),
    () => service.saveNoteImage(id, 'image.png', 'image/png', new Uint8Array([1])),
    () => service.resolveNoteAssetPath(id, `assets/${id}/image.png`),
    () => service.deleteNote(id),
  ]
}

async function runTests(noteProtocol: NoteProtocol): Promise<void> {
  await app.whenReady()
  connection = await import('../../electron/db/connection')
  service = await import('../../electron/notes/NoteService')
  storage = await import('../../electron/notes/noteStorage')
  dataEvents = await import('../../electron/shared/dataEvents')
  oracleModule = await import('../db/notes-file-path-oracle')
  assert.equal(app.getPath('userData'), root())
  assert.equal(storage.getNotesRoot(), path.join(root(), 'notes'))
  assert.throws(() => currentConnection().getDb(), /Database not initialized/)
  noteProtocol.registerNoteAssetProtocol()
  protocolRegistered = true

  await test('missing rows return all four original outcomes without filesystem work', (h) => {
    observed(h, () => {
      assert.equal(service.updateNoteContent('missing', CONTENT), false)
      assert.throws(
        () => service.saveNoteImage('missing', 'bad.txt', 'text/plain', new Uint8Array()),
        { message: '\u7b14\u8bb0\u4e0d\u5b58\u5728' },
      )
      assert.equal(service.resolveNoteAssetPath('missing', 'assets/missing/x.png'), null)
      assert.equal(service.deleteNote('missing'), false)
    })
    assert.deepEqual(
      h.trace,
      Array.from({ length: 4 }, () => ['prepare:lookup', 'get:lookup:["missing"]']).flat(),
    )
    assert.deepEqual(h.events, [])
    assert.equal(fs.existsSync(path.join(h.directory, 'notes')), false)
  })

  await test('native missing-table and missing-column failures precede all storage', (h) => {
    const fixture = seed(h, 'note')
    h.db.exec('ALTER TABLE notes RENAME COLUMN file_path TO removed_path')
    const oldError = sqliteError(() => oracleModule.oldFindNoteFilePath(h.db, fixture.id))
    for (const action of actionSet(fixture.id)) {
      const error = observed(h, () => sqliteError(action))
      assert.equal(error.constructor, oldError.constructor)
      assert.match(error.message, /file_path/)
    }
    console.log(
      `[INFO] notes missing-column native diagnostics: old=${JSON.stringify(oldError.message)}; builder=${JSON.stringify(sqliteError(() => service.resolveNoteAssetPath(fixture.id, 'x.png')).message)}`,
    )
    h.db.exec('DROP TABLE notes')
    for (const action of actionSet(fixture.id)) observed(h, () => sqliteError(action))
    assert.deepEqual(h.trace, Array(8).fill('prepare:lookup'))
    assert.equal(fs.readFileSync(fixture.filePath, 'utf8'), '# Title\n\nold body')
    assert.deepEqual(h.events, [])
  })

  await test('prepare/get thrown-object identities remain outside the content catch', (h) => {
    const fixture = seed(h, 'note')
    for (const stage of ['prepareError', 'getError'] as const) {
      const error = new Error(`injected ${stage}`)
      for (const action of actionSet(fixture.id)) {
        assert.throws(
          () => observed(h, action, { [stage]: error }),
          (actual) => actual === error,
        )
      }
    }
    assert.ok(
      h.trace.every(
        (entry) => entry.startsWith('prepare:lookup') || entry.startsWith('get:lookup:'),
      ),
    )
    assert.deepEqual(h.events, [])
    assert.equal(fs.readFileSync(fixture.filePath, 'utf8'), '# Title\n\nold body')
  })

  const differential: unknown[] = []
  for (const old of [true, false]) {
    await test(`${old ? 'frozen original' : 'Drizzle'} four methods with real files and deterministic clocks`, (h) => {
      const fixture = seed(h, 'note', { deleted: true })
      assertFixture(h, fixture)
      const methods = old
        ? oracleModule.createNotesFilePathOracle({
            getDb: currentConnection().getDb,
            nowMillis: () => Date.now(),
            emitDataChanged: dataEvents.emitDataChanged,
            writeNoteContent: storage.writeNoteContent,
            deleteNoteFiles: storage.deleteNoteFiles,
            saveNoteImageAsset: storage.saveNoteImageAsset,
            resolveNoteAssetPathFromFile: storage.resolveNoteAssetPathFromFile,
          })
        : service
      observed(h, () => assert.equal(methods.updateNoteContent(fixture.id, CONTENT), true))
      assert.equal(fs.readFileSync(fixture.filePath, 'utf8'), CONTENT)
      assert.deepEqual(noteState(h, fixture.id), {
        content: CONTENT,
        word_count: 4,
        updated_at: NOW,
        deleted_at: 0,
      })
      ordered(h.trace, [
        'prepare:lookup',
        'get:lookup:',
        'fs:writeFileSync:',
        'clock',
        'prepare:update',
        'run:update:',
        'event:',
      ])
      const image = observed(h, () =>
        methods.saveNoteImage(
          fixture.id,
          'ignored.jpg',
          'IMAGE/PNG',
          Uint8Array.from([0, 255, 7]).buffer,
        ),
      )
      assert.equal(image.markdownUrl, `assets/note/${NOW}-${UUID}.png`)
      const resolved = observed(h, () =>
        methods.resolveNoteAssetPath(fixture.id, image.markdownUrl),
      )
      assert.equal(resolved, path.join(fixture.assetsDir, `${NOW}-${UUID}.png`))
      assert.ok(resolved)
      assert.deepEqual(fs.readFileSync(resolved), Buffer.from([0, 255, 7]))
      ordered(h.trace, ['fs:mkdirSync:', 'clock', 'uuid', 'fs:writeFileSync:'])
      assert.deepEqual(h.events, [{ tables: ['notes'] }])
      assertFixture(h, fixture)
      observed(h, () => assert.equal(methods.deleteNote(fixture.id), true))
      assert.equal(fs.existsSync(fixture.filePath), false)
      assert.equal(fs.existsSync(fixture.assetsDir), false)
      assert.equal(noteState(h, fixture.id), undefined)
      assert.deepEqual(h.events, [{ tables: ['notes'] }, { tables: ['notes'] }])
      differential.push({ image, trace: h.trace, events: h.events })
    })
  }
  assert.deepEqual(differential[1], differential[0])

  await test('content file failure returns false before clock/UPDATE and keeps the row', (h) => {
    const fixture = seed(h, 'note')
    const directory = contained(h.directory, path.join(h.directory, 'unwritable-file-directory'))
    fs.mkdirSync(directory)
    h.db.prepare('UPDATE notes SET file_path = ? WHERE id = ?').run(directory, fixture.id)
    observed(h, () => assert.equal(service.updateNoteContent(fixture.id, CONTENT), false))
    assert.deepEqual(h.trace, [
      'prepare:lookup',
      'get:lookup:["note"]',
      'fs:writeFileSync:unwritable-file-directory',
    ])
    assert.deepEqual(noteState(h, fixture.id), {
      content: initialBody,
      word_count: 2,
      updated_at: 1,
      deleted_at: null,
    })
    assert.deepEqual(h.events, [])
  })

  await test('content late UPDATE preparation failure retains the new file without an event', (h) => {
    const fixture = seed(h, 'note')
    assertFixture(h, fixture)
    h.db.exec('ALTER TABLE notes RENAME COLUMN content TO removed_content')
    observed(h, () => assert.equal(service.updateNoteContent(fixture.id, CONTENT), false))
    assert.equal(fs.readFileSync(fixture.filePath, 'utf8'), CONTENT)
    assert.deepEqual(
      h.db
        .prepare('SELECT removed_content, word_count, updated_at FROM notes WHERE id = ?')
        .get(fixture.id),
      { removed_content: initialBody, word_count: 2, updated_at: 1 },
    )
    ordered(h.trace, [
      'prepare:lookup',
      'get:lookup:',
      'fs:writeFileSync:',
      'clock',
      'prepare:update',
    ])
    assert.ok(!h.trace.some((entry) => entry.startsWith('run:update:')))
    assert.deepEqual(h.events, [])
  })

  for (const mode of ['abort', 'query-only', 'ignore'] as const) {
    await test(`content late ${mode} retains file-first effects and original notifications`, (h) => {
      const fixture = seed(h, 'note')
      assertFixture(h, fixture)
      if (mode === 'query-only') h.db.pragma('query_only = ON')
      else
        h.db.exec(
          `CREATE TRIGGER content_probe BEFORE UPDATE OF content ON notes BEGIN SELECT RAISE(${mode === 'abort' ? "ABORT, 'content rejected'" : 'IGNORE'}); END`,
        )
      observed(h, () =>
        assert.equal(service.updateNoteContent(fixture.id, CONTENT), mode === 'ignore'),
      )
      assert.equal(fs.readFileSync(fixture.filePath, 'utf8'), CONTENT)
      assert.deepEqual(noteState(h, fixture.id), {
        content: initialBody,
        word_count: 2,
        updated_at: 1,
        deleted_at: null,
      })
      ordered(h.trace, ['fs:writeFileSync:', 'clock', 'prepare:update', 'run:update:'])
      assert.deepEqual(h.events, mode === 'ignore' ? [{ tables: ['notes'] }] : [])
    })
  }

  await test('image binary views, MIME priority and fallback extensions preserve exact bytes', (h) => {
    const fixture = seed(h, 'note')
    assertFixture(h, fixture)
    const cases = [
      {
        name: 'fallback.JPEG',
        mime: 'unknown/type',
        data: new Uint8Array([9, 8, 7, 6]).subarray(1, 3),
        extension: '.jpeg',
        bytes: [8, 7],
      },
      {
        name: 'ignored.png',
        mime: 'image/avif',
        data: Uint8Array.from([11, 12]).buffer,
        extension: '.avif',
        bytes: [11, 12],
      },
    ]
    for (const entry of cases) {
      const image = observed(h, () =>
        service.saveNoteImage(fixture.id, entry.name, entry.mime, entry.data),
      )
      assert.equal(image.markdownUrl, `assets/note/${NOW}-${UUID}${entry.extension}`)
      const target = contained(
        fixture.assetsDir,
        path.join(fixture.assetsDir, `${NOW}-${UUID}${entry.extension}`),
      )
      assert.deepEqual(fs.readFileSync(target), Buffer.from(entry.bytes))
    }
    h.trace.length = 0
    observed(h, () =>
      assert.throws(
        () => service.saveNoteImage(fixture.id, 'bad.txt', 'text/plain', new Uint8Array([0])),
        /png/,
      ),
    )
    assert.deepEqual(h.trace, ['prepare:lookup', 'get:lookup:["note"]'])
    assert.deepEqual(h.events, [])
    assert.deepEqual(noteState(h, fixture.id), {
      content: initialBody,
      word_count: 2,
      updated_at: 1,
      deleted_at: null,
    })
  })

  await test('resolver is query-only and leaves existence checks to the real protocol', async (h) => {
    const fixture = seed(h, 'note')
    const existing = addAsset(h, fixture)
    const missing = contained(fixture.assetsDir, path.join(fixture.assetsDir, 'missing.png'))
    observed(h, () => {
      assert.equal(service.resolveNoteAssetPath(fixture.id, './assets\\note\\missing.png'), missing)
      for (const relative of [
        '../outside.png',
        '/outside.png',
        'file:///outside.png',
        'assets/other/x.png',
        'assets/note/x.txt',
      ]) {
        assert.equal(service.resolveNoteAssetPath(fixture.id, relative), null)
      }
    })
    assert.ok(
      h.trace.every(
        (entry) => entry.startsWith('prepare:lookup') || entry.startsWith('get:lookup:'),
      ),
    )
    h.trace.length = 0
    const restoreDb = observeDatabase(h)
    const restoreFiles = observeFiles(h)
    try {
      const valid = await net.fetch('note-asset://local/note/assets/note/existing.png')
      assert.equal(valid.status, 200)
      assert.deepEqual(Buffer.from(await valid.arrayBuffer()), fs.readFileSync(existing))
      ordered(h.trace, ['prepare:lookup', 'get:lookup:', 'fs:existsSync:'])
      for (const [url, status] of [
        ['note-asset://wrong/note/assets/note/existing.png', 400],
        ['note-asset://local/note', 400],
        ['note-asset://local/missing/assets/missing/x.png', 404],
        ['note-asset://local/note/assets/note/missing.png', 404],
        ['note-asset://local/note/assets/note/x.txt', 404],
      ] as const) {
        const response = await net.fetch(url)
        assert.equal(response.status, status, url)
        await response.arrayBuffer()
      }
    } finally {
      restoreFiles()
      restoreDb()
    }
    assert.equal(fs.existsSync(missing), false)
    assert.deepEqual(h.events, [])
  })

  await test('delete unlinks markdown and assets before native DELETE/event', (h) => {
    const fixture = seed(h, 'note')
    addAsset(h, fixture)
    assertFixture(h, fixture)
    observed(h, () => assert.equal(service.deleteNote(fixture.id), true))
    ordered(h.trace, [
      'prepare:lookup',
      'get:lookup:',
      'fs:existsSync:',
      'fs:unlinkSync:',
      'fs:existsSync:',
      'fs:rmSync:',
      'prepare:delete',
      'run:delete:',
      'event:',
    ])
    assert.equal(fs.existsSync(fixture.filePath), false)
    assert.equal(fs.existsSync(fixture.assetsDir), false)
    assert.equal(noteState(h, fixture.id), undefined)
    assert.deepEqual(h.events, [{ tables: ['notes'] }])
  })

  await test('swallowed unlink failure skips asset cleanup but still deletes the DB row', (h) => {
    const fixture = seed(h, 'note')
    addAsset(h, fixture)
    const directory = contained(
      h.directory,
      path.join(path.dirname(fixture.filePath), 'not-a-file'),
    )
    fs.mkdirSync(directory)
    h.db.prepare('UPDATE notes SET file_path = ? WHERE id = ?').run(directory, fixture.id)
    assertFixture(h, { ...fixture, filePath: directory })
    observed(h, () => assert.equal(service.deleteNote(fixture.id), true))
    assert.equal(fs.existsSync(directory), true)
    assert.equal(fs.existsSync(fixture.assetsDir), true)
    assert.ok(!h.trace.some((entry) => entry.startsWith('fs:rmSync:')))
    ordered(h.trace, ['fs:unlinkSync:', 'prepare:delete', 'run:delete:', 'event:'])
    assert.equal(noteState(h, fixture.id), undefined)
    assert.deepEqual(h.events, [{ tables: ['notes'] }])
  })

  for (const mode of ['abort', 'query-only', 'ignore'] as const) {
    await test(`delete late ${mode} does not restore removed files or publish success`, (h) => {
      const fixture = seed(h, 'note')
      addAsset(h, fixture)
      assertFixture(h, fixture)
      if (mode === 'query-only') h.db.pragma('query_only = ON')
      else
        h.db.exec(
          `CREATE TRIGGER delete_probe BEFORE DELETE ON notes BEGIN SELECT RAISE(${mode === 'abort' ? "ABORT, 'delete rejected'" : 'IGNORE'}); END`,
        )
      observed(h, () => {
        if (mode === 'ignore') assert.equal(service.deleteNote(fixture.id), false)
        else
          sqliteError(
            () => service.deleteNote(fixture.id),
            mode === 'abort' ? 'SQLITE_CONSTRAINT_TRIGGER' : 'SQLITE_READONLY',
          )
      })
      assert.equal(fs.existsSync(fixture.filePath), false)
      assert.equal(fs.existsSync(fixture.assetsDir), false)
      assert.deepEqual(noteState(h, fixture.id), {
        content: initialBody,
        word_count: 2,
        updated_at: 1,
        deleted_at: null,
      })
      ordered(h.trace, ['fs:rmSync:', 'prepare:delete', 'run:delete:'])
      assert.deepEqual(h.events, [])
    })
  }

  for (const failLast of [false, true]) {
    await test(`actual NULL-list batch ${failLast ? 'keeps earlier autocommit before failure' : 'counts only deleted rows'}`, (h) => {
      const first = seed(h, 'first', { updatedAt: 3 })
      const anonymous = seed(h, 'anonymous', { nullable: true, updatedAt: 2 })
      const last = seed(h, 'last', { updatedAt: 1 })
      for (const fixture of [first, anonymous, last]) {
        addAsset(h, fixture)
        assertFixture(h, fixture)
      }
      if (failLast)
        h.db.exec(
          "CREATE TRIGGER reject_last BEFORE DELETE ON notes WHEN OLD.id='last' BEGIN SELECT RAISE(ABORT, 'last rejected'); END",
        )
      observed(h, () => {
        if (failLast)
          sqliteError(() => service.deleteNotesByProblem('problem'), 'SQLITE_CONSTRAINT_TRIGGER')
        else assert.equal(service.deleteNotesByProblem('problem'), 2)
      })
      assert.deepEqual(
        h.trace.filter((entry) => entry.startsWith('get:lookup:')),
        ['get:lookup:["first"]', 'get:lookup:[null]', 'get:lookup:["last"]'],
      )
      assert.deepEqual(
        h.events,
        Array.from({ length: failLast ? 1 : 2 }, () => ({ tables: ['notes'] })),
      )
      for (const fixture of [first, last]) {
        assert.equal(fs.existsSync(fixture.filePath), false)
        assert.equal(fs.existsSync(fixture.assetsDir), false)
      }
      assert.equal(fs.existsSync(anonymous.filePath), true)
      assert.equal(fs.existsSync(anonymous.assetsDir), true)
      assert.deepEqual(
        h.db.prepare('SELECT id FROM notes ORDER BY updated_at DESC').all(),
        failLast ? [{ id: null }, { id: 'last' }] : [{ id: null }],
      )
    })
  }

  await test('caller rollback restores SQL and discards topics, not file contents', (h) => {
    const fixture = seed(h, 'note')
    assertFixture(h, fixture)
    const failure = new Error('caller rollback')
    assert.throws(
      () =>
        dataEvents.withDataChangeTransaction(() =>
          h.db.transaction(() => {
            assert.equal(service.updateNoteContent(fixture.id, CONTENT), true)
            assert.deepEqual(h.events, [])
            throw failure
          })(),
        ),
      (error) => error === failure,
    )
    assert.equal(h.db.inTransaction, false)
    assert.deepEqual(noteState(h, fixture.id), {
      content: initialBody,
      word_count: 2,
      updated_at: 1,
      deleted_at: null,
    })
    assert.equal(fs.readFileSync(fixture.filePath, 'utf8'), CONTENT)
    assert.deepEqual(h.events, [])
  })

  await test('actual deferred-FK COMMIT failure restores the row but cannot undo file deletion', (h) => {
    const fixture = seed(h, 'note')
    addAsset(h, fixture)
    assertFixture(h, fixture)
    h.db.exec(
      'CREATE TABLE commit_probe (note_id TEXT REFERENCES notes(id) DEFERRABLE INITIALLY DEFERRED)',
    )
    let callbackFinished = false
    sqliteError(
      () =>
        dataEvents.withDataChangeTransaction(() =>
          h.db.transaction(() => {
            assert.equal(service.deleteNote(fixture.id), true)
            h.db.prepare('INSERT INTO commit_probe VALUES (?)').run('absent')
            callbackFinished = true
            assert.deepEqual(h.events, [])
          })(),
        ),
      'SQLITE_CONSTRAINT_FOREIGNKEY',
    )
    assert.equal(callbackFinished, true)
    assert.equal(h.db.inTransaction, false)
    assert.ok(noteState(h, fixture.id))
    assert.equal(fs.existsSync(fixture.filePath), false)
    assert.equal(fs.existsSync(fixture.assetsDir), false)
    assert.deepEqual(h.events, [])
  })

  console.log(`[PASS] notes native Electron storage: ${passed}/${caseNumber} groups`)
}

async function finish(result: { ok: true } | { ok: false; error: unknown }): Promise<void> {
  let failed = !result.ok
  if (!result.ok) console.error('[FAIL] notes native Electron storage', result.error)
  const cleanup = [
    () => connection?.closeDb(),
    () => {
      if (protocolRegistered) protocol.unhandle('note-asset')
    },
    async () => {
      if (app.isReady()) await session.defaultSession.closeAllConnections()
    },
  ]
  for (const release of cleanup) {
    try {
      await release()
    } catch (error) {
      failed = true
      console.error('[FAIL] notes storage cleanup (primary preserved)', error)
    }
  }
  // Chromium owns session files until process exit; the spawning parent removes its fixture.
  app.exit(failed ? 1 : 0)
}

// Top-level await holds Electron ready only through isolated dynamic imports.
// runTests awaits ready after this entry finishes evaluating, avoiding a deadlock.
try {
  assert.ok(app && typeof app.setPath === 'function', 'Expected real Electron app, not RUN_AS_NODE')
  assert.equal(app.isReady(), false)
  assert.equal(process.env.ELECTRON_RUN_AS_NODE, undefined)
  const suppliedRoot = process.env.ALGO_NOTES_TEST_ROOT
  assert.ok(
    suppliedRoot && path.isAbsolute(suppliedRoot),
    'Parent must supply an owned absolute test root',
  )
  ownedRoot = contained(path.join(process.cwd(), 'tmp', 'electron-tests'), suppliedRoot)
  assert.ok(path.basename(ownedRoot).startsWith('notes-storage-'))
  const rootStat = fs.lstatSync(ownedRoot)
  assert.ok(rootStat.isDirectory() && !rootStat.isSymbolicLink())
  assert.equal(fs.realpathSync(ownedRoot), ownedRoot)
  const sessionData = contained(ownedRoot, path.join(ownedRoot, 'session'))
  const logs = contained(ownedRoot, path.join(ownedRoot, 'logs'))
  fs.mkdirSync(sessionData)
  fs.mkdirSync(logs)
  app.setPath('userData', ownedRoot)
  app.setPath('sessionData', sessionData)
  app.setAppLogsPath(logs)
  const noteProtocol = await import('../../electron/notes/noteAssetProtocol')
  assert.equal(app.isReady(), false, 'Privileged scheme must precede ready')
  noteProtocol.registerNoteAssetSchemeAsPrivileged()
  void runTests(noteProtocol).then(
    () => finish({ ok: true }),
    (error: unknown) => finish({ ok: false, error }),
  )
} catch (error) {
  await finish({ ok: false, error })
}
