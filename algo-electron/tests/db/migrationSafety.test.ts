import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import {
  closeDb,
  getDb,
  initDbAtPath,
  initDbAtPathWithMigrationSafety,
} from '../../electron/db/connection.ts'
import {
  getMigrationFailureMarkerPath,
  MigrationRetryBlockedError,
} from '../../electron/backup/sqliteMigrationBackup.ts'
import type { Migration } from '../../electron/db/migrate.ts'
import type { Logger } from '../../electron/shared/logger.ts'
import { ORPHAN_VISIT_LEAVE_REASON } from '../../electron/tracking/orphanProblemVisits.ts'

class MemoryLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  fatal(): void {}
  getLogFilePath(): null { return null }
}

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = []
function test(name: string, fn: () => void | Promise<void>): void {
  tests.push({ name, fn })
}

test('backs up before migrations, restores on failure, and blocks the same retry', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-migration-safety-'))
  const dbPath = path.join(tempDir, 'data', 'algo-learning.sqlite')
  const backupDir = path.join(tempDir, 'backups')

  try {
    initDbAtPath(dbPath)
    getDb().exec(`CREATE TABLE recovery_sentinel (value TEXT NOT NULL); INSERT INTO recovery_sentinel VALUES ('preserved');`)
    closeDb()

    let failingMigrationRuns = 0
    const migrations: Migration[] = [
      {
        version: 9001,
        name: 'committed_before_failure',
        up: database => database.exec('CREATE TABLE must_be_restored_away (id INTEGER PRIMARY KEY)'),
      },
      {
        version: 9002,
        name: 'intentional_failure',
        up: () => {
          failingMigrationRuns += 1
          throw new Error('intentional migration failure')
        },
      },
    ]

    await assert.rejects(
      initDbAtPathWithMigrationSafety(dbPath, { backupDir, migrations, logger: new MemoryLogger() }),
      /intentional migration failure/,
    )

    const markerPath = getMigrationFailureMarkerPath(backupDir, dbPath)
    assert.strictEqual(fs.existsSync(markerPath), true)
    assert.strictEqual(fs.readdirSync(backupDir).filter(name => name.endsWith('.sqlite')).length, 1)

    const restored = new Database(dbPath)
    assert.deepStrictEqual(restored.prepare('SELECT value FROM recovery_sentinel').get(), { value: 'preserved' })
    assert.strictEqual(
      restored.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'must_be_restored_away'").get(),
      undefined,
    )
    restored.close()

    await assert.rejects(
      initDbAtPathWithMigrationSafety(dbPath, { backupDir, migrations, logger: new MemoryLogger() }),
      MigrationRetryBlockedError,
    )
    assert.strictEqual(failingMigrationRuns, 1, 'Failure marker must prevent retrying the same migration')

    await initDbAtPathWithMigrationSafety(dbPath, { backupDir, migrations: [], logger: new MemoryLogger() })
    assert.strictEqual(fs.existsSync(markerPath), false, 'Successful initialization clears stale failure markers')
    closeDb()
  } finally {
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('keeps only three pre-migration backups', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-migration-retention-'))
  const dbPath = path.join(tempDir, 'data', 'algo-learning.sqlite')
  const backupDir = path.join(tempDir, 'backups')

  try {
    initDbAtPath(dbPath)
    closeDb()

    for (let version = 9100; version <= 9103; version += 1) {
      await initDbAtPathWithMigrationSafety(dbPath, {
        backupDir,
        migrations: [{
          version,
          name: `retention_${version}`,
          up: database => database.exec(`CREATE TABLE retention_${version} (id INTEGER PRIMARY KEY)`),
        }],
        logger: new MemoryLogger(),
        now: () => new Date(`2026-08-18T00:00:0${version - 9100}.000Z`),
      })
      closeDb()
    }

    const backups = fs.readdirSync(backupDir).filter(name => name.endsWith('.sqlite'))
    assert.strictEqual(backups.length, 3)
    assert.strictEqual(backups.some(name => name.includes('20260818000000000')), false)
  } finally {
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('closes orphan visits at entered_at and marks startup recovery', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-orphan-visits-'))
  const dbPath = path.join(tempDir, 'data', 'algo-learning.sqlite')
  const backupDir = path.join(tempDir, 'backups')
  const enteredAt = '2026-08-17T23:50:00.000'

  try {
    initDbAtPath(dbPath)
    const database = getDb()
    database.prepare(`
      INSERT INTO problems (
        id, platform, platform_problem_id, canonical_url, status,
        first_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'unknown', ?, ?, ?)
    `).run('problem-1', 'codeforces', '1A', 'https://codeforces.com/problemset/problem/1/A', enteredAt, enteredAt, enteredAt)
    database.prepare(`
      INSERT INTO problem_visits (
        id, problem_id, platform, url, entered_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('visit-1', 'problem-1', 'codeforces', 'https://codeforces.com/problemset/problem/1/A', enteredAt, enteredAt, enteredAt)
    closeDb()

    await initDbAtPathWithMigrationSafety(dbPath, { backupDir, migrations: [], logger: new MemoryLogger() })
    const visit = getDb().prepare(`
      SELECT left_at, duration_seconds, active_seconds, leave_reason
      FROM problem_visits WHERE id = 'visit-1'
    `).get() as Record<string, unknown>
    assert.deepStrictEqual(visit, {
      left_at: enteredAt,
      duration_seconds: 0,
      active_seconds: 0,
      leave_reason: ORPHAN_VISIT_LEAVE_REASON,
    })
  } finally {
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

let failedCount = 0
console.log('Running migration safety tests...\n')
for (const currentTest of tests) {
  try {
    await currentTest.fn()
    console.log(`[PASS] ${currentTest.name}`)
  } catch (error: any) {
    console.error(`[FAIL] ${currentTest.name}`)
    console.error(error.stack || error)
    failedCount += 1
  }
}

console.log(`\nTests finished. Failed: ${failedCount}/${tests.length}`)
if (failedCount > 0) process.exitCode = 1
