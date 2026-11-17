import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { z } from 'zod'
import {
  closeDb,
  getDb,
  initDbAtPath,
  initDbAtPathWithMigrationSafety,
} from '../../electron/db/connection'
import {
  getMigrationFailureMarkerPath,
  MigrationRetryBlockedError,
  verifyMigrationBackup,
} from '../../electron/backup/sqliteMigrationBackup'
import {
  assertDatabaseIntegrity,
  compositeDatabaseStateSchema,
  readCompositeDatabaseState,
} from '../../src/main/db/legacy-ledger-validation'
import { KNOWN_DRIZZLE_MIGRATIONS } from '../../src/main/db/migration-resources'
import { resolveUpgrade } from '../../src/main/db/resolve-upgrade'
import {
  assertNoPathLinks,
  readMigrationCheckpoint,
  sha256File,
  writeDurableJson,
} from '../../src/main/services/backup/lib/migration-checkpoint'
import { readVerifiedResolutionAudit } from '../../src/main/services/backup/lib/upgrade-resolution-audit'
import { baselineFolder, quietLogger, resourceFixture } from './drizzle-migration-test-helpers'

const MODES = ['baseline', 'drizzle-only'] as const
const POINTS = ['prepared', 'committed'] as const
type UpgradeMode = (typeof MODES)[number]
type CrashPoint = (typeof POINTS)[number]
const ROOT = path.resolve('tmp', 'drizzle-interruption-tests')
const CHILD = fileURLToPath(import.meta.url)
const LATER = Date.parse('2026-11-17T00:00:00.123Z')
// Data-only work deliberately keeps the same physical schema and legacy ledger.
const FUTURE_SQL = "UPDATE notes SET title = title || ' / migrated' WHERE id = 'source';"
const rendezvousSchema = z
  .object({
    mode: z.enum(MODES),
    point: z.enum(POINTS),
    pid: z.number().int().positive(),
    attemptId: z.uuid(),
    inTransaction: z.literal(false),
    state: compositeDatabaseStateSchema,
  })
  .strict()

function paths(profile: string) {
  return {
    database: path.join(profile, 'data', 'algo-learning.sqlite'),
    backups: path.join(profile, 'backups'),
    rendezvous: path.join(profile, 'rendezvous.json'),
  }
}

function assertProfile(profile: string): void {
  assertNoPathLinks(profile)
  const resolved = fs.realpathSync.native(profile)
  assert.equal(path.dirname(resolved), fs.realpathSync.native(ROOT))
  assert.match(path.basename(resolved), /^case-[A-Za-z0-9]+$/)
}

function resources(profile: string, mode: UpgradeMode) {
  return mode === 'baseline'
    ? { folder: baselineFolder, expected: KNOWN_DRIZZLE_MIGRATIONS }
    : resourceFixture(profile, FUTURE_SQL)
}

type TestResources = ReturnType<typeof resources>

function checkpoint(profile: string) {
  const { database, backups } = paths(profile)
  const record = readMigrationCheckpoint(database, backups)
  assert.ok(record, 'A real forced exit must leave the durable attempt')
  assert.equal(record.formatVersion, 2)
  if (record.formatVersion !== 2) throw new Error('Expected composite migration checkpoint')
  return record
}

function withDatabase<T>(profile: string, readonly: boolean, run: (db: Database.Database) => T): T {
  const database = new Database(paths(profile).database, { readonly, fileMustExist: true })
  try {
    return run(database)
  } finally {
    database.close()
  }
}

function insertNote(database: Database.Database, id: string, time: number): void {
  database
    .prepare('INSERT INTO notes(id,title,file_path,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run(id, id, `${id}.md`, time, time)
}

async function seed(profile: string, mode: UpgradeMode, drizzle: TestResources) {
  const { database, backups } = paths(profile)
  insertNote(initDbAtPath(database), 'source', 0)
  closeDb()
  if (mode === 'drizzle-only') {
    await initDbAtPathWithMigrationSafety(database, {
      backupDir: backups,
      drizzle: { folder: baselineFolder },
      logger: quietLogger,
    })
    closeDb()
  }
  return withDatabase(profile, true, (db) => readCompositeDatabaseState(db, drizzle.expected))
}

async function forceKill(profile: string, mode: UpgradeMode, point: CrashPoint) {
  const child = spawn(process.execPath, [CHILD, '--child', mode, point, profile], {
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.resume()
  let diagnostics = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-8000)
  })
  let exited = false
  let spawnError: Error | undefined
  child.on('error', (error) => {
    spawnError = error
  })
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('close', (code, signal) => {
      exited = true
      resolve({ code, signal })
    })
  })
  try {
    const deadline = Date.now() + 30_000
    while (!fs.existsSync(paths(profile).rendezvous)) {
      if (spawnError) throw spawnError
      assert.equal(exited, false, `Child exited before ${mode}/${point}: ${diagnostics}`)
      assert.ok(Date.now() < deadline, `Timed out at ${mode}/${point}: ${diagnostics}`)
      await delay(20)
    }
    const rendezvous = rendezvousSchema.parse(
      JSON.parse(fs.readFileSync(paths(profile).rendezvous, 'utf8')),
    )
    const prepared = checkpoint(profile)
    assert.equal(rendezvous.pid, child.pid)
    assert.equal(rendezvous.mode, mode)
    assert.equal(rendezvous.point, point)
    assert.equal(rendezvous.attemptId, prepared.attemptId)
    assert.equal(prepared.state, 'prepared')
    assert.equal(
      exited,
      false,
      'Parent must kill the live paused child, not observe a voluntary exit',
    )
    assert.equal(child.kill('SIGKILL'), true)
    const result = await closed
    assert.ok(result.signal === 'SIGKILL' || (process.platform === 'win32' && result.code !== 0))
    assert.deepEqual(checkpoint(profile), prepared)
    return rendezvous
  } finally {
    if (!exited) child.kill('SIGKILL')
    await closed
  }
}

async function childMain(profile: string, mode: UpgradeMode, point: CrashPoint): Promise<void> {
  assertProfile(profile)
  const drizzle = resources(profile, mode)
  const { database, backups, rendezvous } = paths(profile)
  let active: Database.Database | undefined
  const pause = (db: Database.Database): never => {
    const record = checkpoint(profile)
    assert.equal(record.state, 'prepared')
    assert.equal(db.inTransaction, false)
    writeDurableJson(rendezvous, {
      mode,
      point,
      pid: process.pid,
      attemptId: record.attemptId,
      inTransaction: db.inTransaction,
      state: readCompositeDatabaseState(db, drizzle.expected),
    })
    const wait = new Int32Array(new SharedArrayBuffer(4))
    while (true) Atomics.wait(wait, 0, 0)
  }
  const originalPragma = Database.prototype.pragma
  Object.defineProperty(Database.prototype, 'pragma', {
    configurable: true,
    writable: true,
    value: function (this: Database.Database, ...args: unknown[]): unknown {
      const result = Reflect.apply(originalPragma, this, args)
      if (path.resolve(this.name) !== database) return result
      active = this
      // Both baseline adoption and the official migrator have committed before this final integrity check.
      if (point === 'committed' && args[0] === 'integrity_check' && !this.inTransaction) {
        const record = readMigrationCheckpoint(database, backups)
        if (record?.formatVersion === 2 && record.state === 'prepared') {
          const state = readCompositeDatabaseState(this, drizzle.expected)
          if (JSON.stringify(state.drizzleLedger) === JSON.stringify(record.targetDrizzle))
            pause(this)
        }
      }
      return result
    },
  })
  await initDbAtPathWithMigrationSafety(database, {
    backupDir: backups,
    drizzle,
    logger: {
      ...quietLogger,
      info(message: string): void {
        if (point === 'prepared' && message === 'db.pre-migration-backup-completed') {
          assert.ok(active, 'Prepared logger rendezvous requires the owned native connection')
          pause(active)
        }
      },
    },
  })
  throw new Error('Forced-termination child unexpectedly completed startup')
}

async function assertBlocked(profile: string, drizzle: TestResources): Promise<void> {
  const { database, backups } = paths(profile)
  const original = checkpoint(profile)
  for (const override of [{}, { migrations: [] }, { drizzle }]) {
    await assert.rejects(
      initDbAtPathWithMigrationSafety(database, {
        backupDir: backups,
        logger: quietLogger,
        ...override,
      }),
      MigrationRetryBlockedError,
    )
    assert.throws(() => getDb(), /not initialized/)
    assert.deepEqual(checkpoint(profile), original)
  }
}

function assertNotes(database: Database.Database, mode: UpgradeMode, later: boolean): void {
  assert.deepEqual(
    database.prepare('SELECT id,title,created_at,updated_at FROM notes ORDER BY id').all(),
    [
      ...(later
        ? [{ id: 'after-kill', title: 'after-kill', created_at: LATER, updated_at: LATER }]
        : []),
      {
        id: 'source',
        title: mode === 'baseline' ? 'source' : 'source / migrated',
        created_at: 0,
        updated_at: 0,
      },
    ],
  )
}

async function runCase(profile: string, mode: UpgradeMode, point: CrashPoint): Promise<void> {
  const drizzle = resources(profile, mode)
  const source = await seed(profile, mode, drizzle)
  const rendezvous = await forceKill(profile, mode, point)
  const record = checkpoint(profile)
  const { database, backups } = paths(profile)
  assert.deepEqual(record.source, source)
  assert.deepEqual(record.targetLedger, source.ledger, 'Both cases advance only Drizzle')
  assert.deepEqual(record.targetDrizzle, drizzle.expected)
  assert.equal(record.targetDrizzle.length, mode === 'baseline' ? 1 : 2)
  assert.deepEqual(source.drizzleLedger, mode === 'baseline' ? null : [...KNOWN_DRIZZLE_MIGRATIONS])
  const backup = path.join(backups, record.backupBasename)
  assert.equal(sha256File(backup), record.backupSha256)
  assert.deepEqual(verifyMigrationBackup(backup, source, record.backupSha256), source)
  assert.equal(
    fs.existsSync(getMigrationFailureMarkerPath(backups, database)),
    false,
    'Forced death cannot rely on catch-block failure markers',
  )
  const actual = withDatabase(profile, true, (db) => {
    assertDatabaseIntegrity(db)
    return readCompositeDatabaseState(db, drizzle.expected)
  })
  assert.deepEqual(actual, rendezvous.state, 'Committed state must survive child termination')
  if (point === 'prepared')
    assert.deepEqual(actual, source, 'No migration write may precede the prepared rendezvous')
  else {
    assert.deepEqual(actual.ledger, record.targetLedger)
    assert.deepEqual(actual.drizzleLedger, record.targetDrizzle)
    if (mode === 'drizzle-only') assert.equal(actual.schemaHash, source.schemaHash)
  }
  await assertBlocked(profile, drizzle)

  const resolution = point === 'prepared' ? 'retry-source' : 'keep-current'
  await assert.rejects(
    resolveUpgrade(
      profile,
      {
        attemptId: record.attemptId,
        resolution: point === 'prepared' ? 'keep-current' : 'retry-source',
      },
      { drizzle },
    ),
    /history|schema/i,
  )
  assert.deepEqual(checkpoint(profile), record)
  await assertBlocked(profile, drizzle)
  if (point === 'committed')
    withDatabase(profile, false, (db) => insertNote(db, 'after-kill', LATER))
  await resolveUpgrade(profile, { attemptId: record.attemptId, resolution }, { drizzle })
  const resolved = checkpoint(profile)
  assert.equal(resolved.state, `resolved-${resolution}`)
  const audit = readVerifiedResolutionAudit(resolved)
  assert.equal(audit.formatVersion, 2)
  assert.deepEqual(audit.source, point === 'prepared' ? source : actual)
  const protectedCurrent = path.join(backups, 'resolutions', audit.backupBasename)
  assert.deepEqual(
    verifyMigrationBackup(protectedCurrent, audit.source, audit.backupSha256),
    audit.source,
  )
  if (point === 'committed') {
    const protectedDatabase = new Database(protectedCurrent, {
      readonly: true,
      fileMustExist: true,
    })
    try {
      assertNotes(protectedDatabase, mode, true)
    } finally {
      protectedDatabase.close()
    }
  }
  await resolveUpgrade(profile, { attemptId: record.attemptId, resolution }, { drizzle })
  assert.deepEqual(checkpoint(profile), resolved)
  assert.equal(sha256File(backup), record.backupSha256)

  for (let restart = 0; restart < 2; restart += 1) {
    const current = await initDbAtPathWithMigrationSafety(database, {
      backupDir: backups,
      drizzle,
      logger: quietLogger,
    })
    assertNotes(current, mode, point === 'committed')
    const state = readCompositeDatabaseState(current, drizzle.expected)
    assert.deepEqual(state.ledger, record.targetLedger)
    assert.deepEqual(state.drizzleLedger, record.targetDrizzle)
    assertDatabaseIntegrity(current)
    closeDb()
  }
  const final = checkpoint(profile)
  if (point === 'prepared') {
    assert.equal(final.state, 'completed')
    assert.notEqual(
      final.attemptId,
      record.attemptId,
      'Retry must create a fresh protected attempt',
    )
  } else
    assert.deepEqual(
      final,
      resolved,
      'Successful no-op restarts must not rewrite the resolved attempt',
    )
}

async function main(): Promise<void> {
  assert.ok(process.versions.electron, 'Run this native suite under Electron RUN_AS_NODE')
  if (process.argv[2] === '--child') {
    await childMain(
      process.argv[5] ?? '',
      z.enum(MODES).parse(process.argv[3]),
      z.enum(POINTS).parse(process.argv[4]),
    )
    return
  }
  fs.mkdirSync(ROOT, { recursive: true })
  for (const mode of MODES)
    for (const point of POINTS) {
      const profile = fs.mkdtempSync(path.join(ROOT, 'case-'))
      let succeeded = false
      try {
        await runCase(profile, mode, point)
        console.log(
          `[PASS] Drizzle ${mode}/${point}: real forced exit, durable block, explicit recovery`,
        )
        succeeded = true
      } catch (error) {
        console.error(`[FAIL] Drizzle ${mode}/${point}; synthetic evidence preserved: ${profile}`)
        console.error(error instanceof Error ? error.stack : error)
        process.exitCode = 1
      } finally {
        closeDb()
        if (succeeded) {
          assertProfile(profile)
          fs.rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
        }
      }
    }
}
await main()
