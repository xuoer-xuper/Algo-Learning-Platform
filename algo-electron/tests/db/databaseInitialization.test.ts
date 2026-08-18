import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, vi } from 'vitest'

const fakeDatabaseState = vi.hoisted(() => ({
  appliedVersions: [] as number[],
  orphanChanges: 0,
}))

vi.mock('better-sqlite3', async () => {
  const fsModule = await import('node:fs')
  const pathModule = await import('node:path')

  return {
    default: class FakeDatabase {
      constructor(readonly databasePath: string) {
        fsModule.mkdirSync(pathModule.dirname(databasePath), { recursive: true })
        if (!fsModule.existsSync(databasePath)) fsModule.writeFileSync(databasePath, 'original')
      }

      pragma(): void {}
      exec(): void {}
      close(): void {}

      prepare(sql: string) {
        if (sql.includes('sqlite_master')) return { get: () => ({ present: 1 }) }
        if (sql.startsWith('SELECT version')) {
          return { all: () => fakeDatabaseState.appliedVersions.map(version => ({ version })) }
        }
        if (sql.startsWith('INSERT INTO schema_migrations')) {
          return { run: (version: number) => { fakeDatabaseState.appliedVersions.push(version) } }
        }
        if (sql.includes('UPDATE problem_visits')) {
          return { run: () => ({ changes: fakeDatabaseState.orphanChanges }) }
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      }

      transaction(callback: () => void): () => void {
        return () => callback()
      }

      async backup(destination: string): Promise<void> {
        fsModule.copyFileSync(this.databasePath, destination)
      }
    },
  }
})

import {
  closeDb,
  initDbAtPathWithMigrationSafety,
} from '../../electron/db/connection.ts'
import {
  getMigrationFailureMarkerPath,
  MigrationRetryBlockedError,
  writeMigrationFailureMarker,
} from '../../electron/backup/sqliteMigrationBackup.ts'
import type { Logger } from '../../electron/shared/logger.ts'

class MemoryLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  fatal(): void {}
  getLogFilePath(): null { return null }
}

test('initializes asynchronously, clears stale markers, and records applied migrations', async () => {
  fakeDatabaseState.appliedVersions = []
  fakeDatabaseState.orphanChanges = 2
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-db-init-unit-'))
  const databasePath = path.join(tempDir, 'data', 'algo-learning.sqlite')
  const backupDir = path.join(tempDir, 'backups')
  const markerPath = writeMigrationFailureMarker(backupDir, databasePath, {
    databasePath,
    backupPath: path.join(backupDir, 'old.sqlite'),
    failedAt: '2026-08-18T00:00:00.000Z',
    pendingMigrations: [{ version: 99, name: 'stale' }],
    error: 'stale',
  })

  try {
    await initDbAtPathWithMigrationSafety(databasePath, {
      backupDir,
      migrations: [{ version: 25, name: 'success', up: () => undefined }],
      logger: new MemoryLogger(),
    })
    assert.deepStrictEqual(fakeDatabaseState.appliedVersions, [25])
    assert.strictEqual(fs.existsSync(markerPath), false)
  } finally {
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('restores failed migrations and blocks the same pending version', async () => {
  fakeDatabaseState.appliedVersions = []
  fakeDatabaseState.orphanChanges = 0
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-db-init-failure-unit-'))
  const databasePath = path.join(tempDir, 'data', 'algo-learning.sqlite')
  const backupDir = path.join(tempDir, 'backups')
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })
  fs.writeFileSync(databasePath, 'original')

  const migrations = [{
    version: 25,
    name: 'failure',
    up: () => {
      fs.writeFileSync(databasePath, 'mutated')
      throw new Error('migration failed')
    },
  }]

  try {
    await assert.rejects(
      initDbAtPathWithMigrationSafety(databasePath, { backupDir, migrations, logger: new MemoryLogger() }),
      /migration failed/,
    )
    assert.strictEqual(fs.readFileSync(databasePath, 'utf8'), 'original')
    assert.strictEqual(fs.existsSync(getMigrationFailureMarkerPath(backupDir, databasePath)), true)

    await assert.rejects(
      initDbAtPathWithMigrationSafety(databasePath, { backupDir, migrations, logger: new MemoryLogger() }),
      MigrationRetryBlockedError,
    )
  } finally {
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
