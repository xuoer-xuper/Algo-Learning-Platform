import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import Database from 'better-sqlite3'
import { z } from 'zod'
import {
  closeDb,
  getDb,
  getKnownMigrations,
  initDbAtPathWithMigrationSafety,
} from '../../electron/db/connection'
import { runMigrations } from '../../electron/db/migrate'
import {
  MigrationRetryBlockedError,
  restoreDatabaseFromBackup,
  verifyMigrationBackup,
} from '../../electron/backup/sqliteMigrationBackup'
import { resolveUpgrade } from '../../src/main/db/resolve-upgrade'
import {
  assertDatabaseIntegrity,
  readDatabaseState,
  validateLegacyLedger,
} from '../../src/main/db/legacy-ledger-validation'
import {
  assertNoPathLinks,
  readMigrationCheckpoint,
  sha256File,
  writeMigrationCheckpoint,
} from '../../src/main/services/backup/lib/migration-checkpoint'
import provenance from './fixtures/provenance.json'
import type { Logger } from '../../electron/shared/logger'

const POINTS = ['prepared', 'inside-030', 'between-029-030', 'committed-030'] as const
type CrashPoint = (typeof POINTS)[number]
const ROOT = path.resolve(process.cwd(), 'tmp', 'migration-interruption-tests')
const CHILD = fileURLToPath(import.meta.url)
const HISTORICAL_TIME = '2026-01-15T02:20:30.123Z'
const LATER = Date.parse('2026-11-09T00:00:00.000Z')
const profiles: string[] = []
const rendezvousSchema = z
  .object({
    point: z.enum(POINTS),
    attemptId: z.uuid(),
    pid: z.number().int().positive(),
    ledgerVersion: z.number().int(),
    inTransaction: z.boolean(),
    copiedProblem: z.boolean(),
    originalActivityTableDropped: z.boolean(),
  })
  .strict()

class MemoryLogger implements Logger {
  debug(): void {}
  info(_message: string, ..._data: unknown[]): void {}
  warn(): void {}
  error(): void {}
  fatal(): void {}
  getLogFilePath(): null {
    return null
  }
}

const logger = new MemoryLogger()
function paths(userData: string) {
  return {
    db: path.join(userData, 'data', 'algo-learning.sqlite'),
    backups: path.join(userData, 'backups'),
    rendezvous: path.join(userData, 'rendezvous.json'),
  }
}
function assertProfile(userData: string): void {
  assertNoPathLinks(userData)
  const resolvedRoot = fs.realpathSync.native(ROOT)
  const resolved = fs.realpathSync.native(userData)
  assert.equal(path.dirname(resolved), resolvedRoot)
  assert.match(path.basename(resolved), /^case-[A-Za-z0-9]+$/)
}
function makeProfile(): string {
  fs.mkdirSync(ROOT, { recursive: true })
  const directory = fs.mkdtempSync(path.join(ROOT, 'case-'))
  profiles.push(directory)
  fs.mkdirSync(path.dirname(paths(directory).db), { recursive: true })
  return directory
}
function loadHistoricalSchema(database: Database.Database, id: 'beta2' | 'rc1'): void {
  const release = provenance.releases.find((entry) => entry.id === id)
  assert.ok(release)
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'tests/db/fixtures', release.schemaFile),
    'utf8',
  )
  assert.equal(createHash('sha256').update(sql).digest('hex'), release.schemaSha256)
  database.exec(sql)
  assert.deepEqual(readDatabaseState(database).ledger, release.migrations)
}
function seed(userData: string, version: 28 | 29): void {
  const database = new Database(paths(userData).db)
  try {
    database.pragma('foreign_keys = ON')
    loadHistoricalSchema(database, version === 29 ? 'rc1' : 'beta2')
    if (version === 28)
      runMigrations(
        database,
        getKnownMigrations().filter(
          (migration) => migration.version >= 25 && migration.version <= 28,
        ),
        logger,
      )
    assert.equal(
      (
        database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {
          version: number
        }
      ).version,
      version,
    )
    validateLegacyLedger(database, getKnownMigrations())
    database
      .prepare(
        `INSERT INTO problems (id, platform, platform_problem_id, canonical_url, first_seen_at, created_at, updated_at) VALUES ('synthetic-problem', 'codeforces', '1000A', 'https://example.test/problem', ?, ?, ?)`,
      )
      .run(HISTORICAL_TIME, HISTORICAL_TIME, HISTORICAL_TIME)
    database
      .prepare(
        `INSERT INTO activity_events (id, event_type, occurred_at, local_day, problem_id, created_at, updated_at) VALUES ('synthetic-event', 'visit_start', ?, '2026-01-15', 'synthetic-problem', ?, ?)`,
      )
      .run(HISTORICAL_TIME, HISTORICAL_TIME, HISTORICAL_TIME)
    assertDatabaseIntegrity(database)
  } finally {
    database.close()
  }
}
function checkpoint(userData: string) {
  const state = readMigrationCheckpoint(paths(userData).db, paths(userData).backups)
  assert.ok(state, 'Durable prepared checkpoint must survive a forced child termination')
  return state
}
function writeRendezvous(
  userData: string,
  point: CrashPoint,
  attemptId: string,
  database: Database.Database,
  copiedProblem: boolean,
): void {
  const file = paths(userData).rendezvous
  const record = {
    point,
    pid: process.pid,
    attemptId,
    ledgerVersion: (
      database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {
        version: number
      }
    ).version,
    inTransaction: database.inTransaction,
    copiedProblem,
    originalActivityTableDropped: copiedProblem,
  }
  const descriptor = fs.openSync(`${file}.partial`, 'wx', 0o600)
  try {
    fs.writeFileSync(descriptor, JSON.stringify(record))
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
  fs.renameSync(`${file}.partial`, file)
}
function spawnChild(userData: string, point: CrashPoint): ReturnType<typeof spawn> {
  const child = spawn(process.execPath, [CHILD, '--child', point, userData], {
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout?.resume()
  child.stderr?.resume()
  return child
}
function databaseLedger(userData: string): number {
  const database = new Database(paths(userData).db, { readonly: true, fileMustExist: true })
  try {
    return (
      database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {
        version: number
      }
    ).version
  } finally {
    database.close()
  }
}
function backupPath(userData: string): string {
  const record = checkpoint(userData)
  const backup = path.join(paths(userData).backups, record.backupBasename)
  assert.equal(sha256File(backup), record.backupSha256)
  return backup
}
async function restartBlocked(userData: string): Promise<void> {
  const before = checkpoint(userData)
  for (const options of [
    { backupDir: paths(userData).backups, logger },
    { backupDir: paths(userData).backups, migrations: [], logger },
  ]) {
    await assert.rejects(
      initDbAtPathWithMigrationSafety(paths(userData).db, options),
      MigrationRetryBlockedError,
    )
    assert.throws(() => getDb(), /not initialized/)
    assert.deepEqual(checkpoint(userData), before)
  }
  closeDb()
}
async function resolveRetrySource(userData: string): Promise<void> {
  const record = checkpoint(userData)
  await resolveUpgrade(userData, { attemptId: record.attemptId, resolution: 'retry-source' })
  const resolved = checkpoint(userData)
  assert.equal(resolved.state, 'resolved-retry-source')
}
async function resolveKeepCurrent(userData: string): Promise<void> {
  const record = checkpoint(userData)
  await resolveUpgrade(userData, { attemptId: record.attemptId, resolution: 'keep-current' })
  const resolved = checkpoint(userData)
  assert.equal(resolved.state, 'resolved-keep-current')
}
async function runCrash(point: CrashPoint, sourceVersion: 28 | 29): Promise<string> {
  const userData = makeProfile()
  seed(userData, sourceVersion)
  const child = spawnChild(userData, point)
  let isClosed = false
  let spawnError: Error | undefined
  let diagnostics = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    diagnostics = `${diagnostics}${chunk.toString()}`.slice(-8000)
  })
  child.on('error', (error) => {
    spawnError = error
  })
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('close', (code, signal) => {
      isClosed = true
      resolve({ code, signal })
    })
  })
  try {
    const deadline = Date.now() + 30_000
    while (!fs.existsSync(paths(userData).rendezvous)) {
      if (spawnError) throw spawnError
      assert.equal(isClosed, false, `Child exited before rendezvous: ${diagnostics}`)
      assert.ok(Date.now() < deadline, `Timed out waiting for ${point}: ${diagnostics}`)
      await delay(20)
    }
    const rendezvous = rendezvousSchema.parse(
      JSON.parse(fs.readFileSync(paths(userData).rendezvous, 'utf8')),
    )
    assert.equal(rendezvous.point, point)
    assert.equal(rendezvous.pid, child.pid)
    assert.equal(rendezvous.inTransaction, point === 'inside-030')
    assert.equal(rendezvous.copiedProblem, point === 'inside-030')
    assert.equal(rendezvous.originalActivityTableDropped, point === 'inside-030')
    assert.equal(rendezvous.ledgerVersion, point === 'committed-030' ? 30 : 29)
    const record = checkpoint(userData)
    assert.equal(rendezvous.attemptId, record.attemptId)
    assert.equal(record.state, 'prepared')
    assert.equal(isClosed, false, 'Child must still be blocked in the live migration')
    assert.equal(child.kill('SIGKILL'), true)
    const result = await closed
    // Windows TerminateProcess may report exit1 rather than a Unix signal.
    assert.ok(result.signal === 'SIGKILL' || (process.platform === 'win32' && result.code !== 0))
    assert.deepEqual(checkpoint(userData), record)
  } finally {
    if (!isClosed) child.kill('SIGKILL')
    await closed
  }
  assert.ok(fs.existsSync(backupPath(userData)))
  return userData
}
async function childMain(point: CrashPoint, userData: string): Promise<void> {
  assert.ok(process.versions.electron, 'Crash child must use Electron RUN_AS_NODE')
  assertProfile(userData)
  const { db, backups } = paths(userData)
  let active: Database.Database | null = null
  const prototype = Database.prototype
  const originalExec = prototype.exec
  const originalPragma = prototype.pragma
  Object.defineProperty(prototype, 'pragma', {
    configurable: true,
    writable: true,
    value: function (this: Database.Database, ...args: unknown[]): unknown {
      if (path.resolve(this.name) === db) active = this
      return Reflect.apply(originalPragma, this, args)
    },
  })
  Object.defineProperty(prototype, 'exec', {
    configurable: true,
    writable: true,
    value: function (this: Database.Database, sql: string): Database.Database {
      if (path.resolve(this.name) === db) active = this
      const result = originalExec.call(this, sql)
      if (
        point === 'inside-030' &&
        path.resolve(this.name) === db &&
        sql === 'DROP TABLE "activity_events"'
      ) {
        const record = checkpoint(userData)
        assert.equal(this.inTransaction, true)
        assert.deepEqual(
          this.prepare('SELECT first_seen_at FROM __timestamps_030_problems WHERE id = ?').get(
            'synthetic-problem',
          ),
          { first_seen_at: Date.parse(HISTORICAL_TIME) },
        )
        assert.equal(
          this.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'activity_events'").get(),
          undefined,
        )
        writeRendezvous(userData, point, record.attemptId, this, true)
        const wait = new Int32Array(new SharedArrayBuffer(4))
        while (true) Atomics.wait(wait, 0, 0)
      }
      return result
    },
  })
  class CrashLogger extends MemoryLogger {
    override info(message: string, ...data: unknown[]): void {
      const value = data[0]
      const version =
        typeof value === 'object' && value !== null && 'version' in value
          ? value.version
          : undefined
      const stop =
        (point === 'prepared' && message === 'db.pre-migration-backup-completed') ||
        (point === 'between-029-030' && message === 'db.migration-completed' && version === 29) ||
        (point === 'committed-030' && message === 'db.migration-completed' && version === 30)
      if (stop) {
        const record = checkpoint(userData)
        assert.ok(active, 'Migration logger rendezvous requires an active database')
        writeRendezvous(userData, point, record.attemptId, active, false)
        const wait = new Int32Array(new SharedArrayBuffer(4))
        while (true) Atomics.wait(wait, 0, 0)
      }
    }
  }
  await initDbAtPathWithMigrationSafety(db, { backupDir: backups, logger: new CrashLogger() })
  throw new Error('Crash child unexpectedly completed')
}

const tests: Array<{ name: string; run: () => Promise<void> }> = []
function test(name: string, run: () => Promise<void>): void {
  tests.push({ name, run })
}

for (const point of POINTS) {
  test(`forced termination at ${point} leaves a durable block and verified source backup`, async () => {
    const sourceVersion = point === 'between-029-030' ? 28 : 29
    const userData = await runCrash(point, sourceVersion)
    await restartBlocked(userData)
    const record = checkpoint(userData)
    assert.equal(record.state, 'prepared')
    assert.equal(databaseLedger(userData), point === 'committed-030' ? 30 : 29)
    const backup = backupPath(userData)
    assert.equal(
      verifyMigrationBackup(backup, record.source, record.backupSha256).ledger.length,
      sourceVersion,
    )
    if (point === 'between-029-030' || point === 'committed-030') {
      if (point === 'between-029-030') {
        await assert.rejects(
          resolveUpgrade(userData, { attemptId: record.attemptId, resolution: 'retry-source' }),
          /history|schema/i,
        )
        await assert.rejects(
          resolveUpgrade(userData, { attemptId: record.attemptId, resolution: 'keep-current' }),
          /history|schema/i,
        )
        await restartBlocked(userData)
        const retained = new Map(
          [paths(userData).db, `${paths(userData).db}-wal`, `${paths(userData).db}-shm`]
            .filter((file) => fs.existsSync(file))
            .map((file) => [path.basename(file), sha256File(file)]),
        )
        restoreDatabaseFromBackup(backup, paths(userData).db, {
          attemptId: record.attemptId,
          expectedSource: record.source,
          expectedSha256: record.backupSha256,
          beforeDisplace: (recovery) =>
            writeMigrationCheckpoint(paths(userData).db, paths(userData).backups, {
              ...record,
              state: 'restoring',
              recovery,
              updatedAt: Date.now(),
            }),
        })
        const restoring = checkpoint(userData)
        assert.ok(restoring.recovery)
        const recoveryDirectory = path.join(
          path.dirname(paths(userData).db),
          restoring.recovery.directoryBasename,
        )
        for (const [file, hash] of retained) {
          assert.equal(
            sha256File(
              path.join(recoveryDirectory, file.replace('algo-learning.sqlite', 'main.sqlite')),
            ),
            hash,
          )
        }
        assert.equal(databaseLedger(userData), 28)
        await restartBlocked(userData)
      }
      if (point === 'between-029-030') await resolveRetrySource(userData)
      else await resolveKeepCurrent(userData)
    } else {
      await resolveRetrySource(userData)
    }
    closeDb()
    await initDbAtPathWithMigrationSafety(paths(userData).db, {
      backupDir: paths(userData).backups,
      logger,
    })
    assert.equal(databaseLedger(userData), 30)
    const current = checkpoint(userData)
    assert.equal(current.state, point === 'committed-030' ? 'resolved-keep-current' : 'completed')
    if (point !== 'committed-030') {
      assert.notEqual(current.attemptId, record.attemptId)
      const audit = path.join(
        paths(userData).backups,
        `algo-learning.sqlite.attempt-${record.attemptId}.json`,
      )
      assert.equal(JSON.parse(fs.readFileSync(audit, 'utf8')).state, 'resolved-retry-source')
    }
    assert.deepEqual(
      getDb().prepare('SELECT first_seen_at FROM problems WHERE id = ?').get('synthetic-problem'),
      { first_seen_at: Date.parse(HISTORICAL_TIME) },
    )
    assertDatabaseIntegrity(getDb())
    closeDb()
    const backupsBefore = fs
      .readdirSync(paths(userData).backups)
      .filter((file) => file.endsWith('.sqlite'))
    await initDbAtPathWithMigrationSafety(paths(userData).db, {
      backupDir: paths(userData).backups,
      logger,
    })
    assert.equal(databaseLedger(userData), 30)
    assert.deepEqual(
      fs.readdirSync(paths(userData).backups).filter((file) => file.endsWith('.sqlite')),
      backupsBefore,
    )
    closeDb()
  })
}

test('committed target keep-current preserves data written after migration and later startup', async () => {
  const userData = await runCrash('committed-030', 29)
  await restartBlocked(userData)
  const interrupted = checkpoint(userData)
  await assert.rejects(
    resolveUpgrade(userData, { attemptId: interrupted.attemptId, resolution: 'retry-source' }),
    /history|schema/i,
  )
  const database = new Database(paths(userData).db)
  try {
    database
      .prepare(
        `INSERT INTO problems (id, platform, platform_problem_id, canonical_url, first_seen_at, created_at, updated_at) VALUES ('after-parent-kill', 'codeforces', '2000A', 'https://example.test/after', ?, ?, ?)`,
      )
      .run(LATER, LATER, LATER)
  } finally {
    database.close()
  }
  await resolveKeepCurrent(userData)
  await initDbAtPathWithMigrationSafety(paths(userData).db, {
    backupDir: paths(userData).backups,
    logger,
  })
  assert.equal(
    (
      getDb()
        .prepare("SELECT COUNT(*) AS count FROM problems WHERE id = 'after-parent-kill'")
        .get() as { count: number }
    ).count,
    1,
  )
  closeDb()
  const resolved = checkpoint(userData)
  await resolveKeepCurrent(userData)
  assert.deepEqual(checkpoint(userData), resolved)
  await initDbAtPathWithMigrationSafety(paths(userData).db, {
    backupDir: paths(userData).backups,
    logger,
  })
  getDb()
    .prepare(
      `INSERT INTO problems (id, platform, platform_problem_id, canonical_url, first_seen_at, created_at, updated_at) VALUES ('after-normal-use', 'codeforces', '3000A', 'https://example.test/later', ?, ?, ?)`,
    )
    .run(LATER, LATER, LATER)
  getDb()
    .prepare(
      `INSERT INTO problem_visits (id, problem_id, platform, url, entered_at, created_at, updated_at) VALUES ('later-visit', 'after-normal-use', 'codeforces', 'https://example.test/later', ?, ?, ?)`,
    )
    .run(LATER, LATER, LATER)
  getDb().exec(
    `CREATE TRIGGER synthetic_startup_failure BEFORE UPDATE ON problem_visits BEGIN SELECT RAISE(ABORT, 'synthetic forward startup failure'); END`,
  )
  closeDb()
  await assert.rejects(
    initDbAtPathWithMigrationSafety(paths(userData).db, {
      backupDir: paths(userData).backups,
      logger,
    }),
    /synthetic forward startup failure/,
  )
  assert.throws(() => getDb(), /not initialized/)
  assert.deepEqual(
    checkpoint(userData),
    resolved,
    'A later ordinary startup failure must not restore an old checkpoint',
  )
  const current = new Database(paths(userData).db)
  try {
    assert.equal(
      (current.prepare('SELECT COUNT(*) AS count FROM problems').get() as { count: number }).count,
      3,
    )
    assert.equal(
      (
        current
          .prepare('SELECT first_seen_at FROM problems WHERE id = ?')
          .get('after-parent-kill') as { first_seen_at: number }
      ).first_seen_at,
      LATER,
    )
    assert.equal(
      (
        current
          .prepare('SELECT first_seen_at FROM problems WHERE id = ?')
          .get('after-normal-use') as { first_seen_at: number }
      ).first_seen_at,
      LATER,
    )
    current.exec('DROP TRIGGER synthetic_startup_failure')
    assertDatabaseIntegrity(current)
  } finally {
    current.close()
  }
  await initDbAtPathWithMigrationSafety(paths(userData).db, {
    backupDir: paths(userData).backups,
    logger,
  })
  assert.equal(
    (getDb().prepare('SELECT COUNT(*) AS count FROM problems').get() as { count: number }).count,
    3,
  )
  assertDatabaseIntegrity(getDb())
  closeDb()
})

async function main(): Promise<void> {
  if (process.argv[2] === '--child') {
    const point = z.enum(POINTS).parse(process.argv[3])
    await childMain(point, process.argv[4] ?? '')
    return
  }
  assert.ok(
    process.versions.electron,
    'Run the bundled interruption suite under Electron RUN_AS_NODE',
  )
  fs.mkdirSync(ROOT, { recursive: true })
  for (const current of tests) {
    try {
      await current.run()
      console.log(`[PASS] ${current.name}`)
    } catch (error) {
      console.error(`[FAIL] ${current.name}`)
      console.error(error instanceof Error ? error.stack : error)
      process.exitCode = 1
    } finally {
      closeDb()
    }
  }
  for (const profile of profiles) {
    assertProfile(profile)
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  }
}
await main()
