import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import {
  assertMigrationRetryAllowed,
  clearMigrationFailureMarker,
  createPreMigrationBackup,
  getMigrationFailureMarkerPath,
  MigrationRetryBlockedError,
  restoreDatabaseFromBackup,
  writeMigrationFailureMarker,
} from '../../electron/backup/sqliteMigrationBackup.ts'

test('rotates migration backups and restores the database without WAL sidecars', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-migration-backup-unit-'))
  const databasePath = path.join(tempDir, 'algo-learning.sqlite')
  const backupDir = path.join(tempDir, 'backups')
  const database = {
    backup: async (destination: string) => {
      fs.writeFileSync(destination, `backup:${path.basename(destination)}`)
    },
  }

  try {
    for (let index = 0; index < 4; index += 1) {
      await createPreMigrationBackup(
        database,
        databasePath,
        backupDir,
        new Date(`2026-08-18T00:00:0${index}.000Z`),
      )
    }
    const backups = fs.readdirSync(backupDir).filter(name => name.endsWith('.sqlite'))
    assert.strictEqual(backups.length, 3)
    assert.strictEqual(backups.some(name => name.includes('20260818000000000')), false)

    const restoreSource = path.join(tempDir, 'restore-source.sqlite')
    fs.writeFileSync(restoreSource, 'restored')
    fs.writeFileSync(databasePath, 'broken')
    fs.writeFileSync(`${databasePath}-wal`, 'wal')
    fs.writeFileSync(`${databasePath}-shm`, 'shm')
    restoreDatabaseFromBackup(restoreSource, databasePath)

    assert.strictEqual(fs.readFileSync(databasePath, 'utf8'), 'restored')
    assert.strictEqual(fs.existsSync(`${databasePath}-wal`), false)
    assert.strictEqual(fs.existsSync(`${databasePath}-shm`), false)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('blocks matching failed migrations and clears stale markers', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-migration-marker-unit-'))
  const databasePath = path.join(tempDir, 'algo-learning.sqlite')
  const backupDir = path.join(tempDir, 'backups')

  try {
    const markerPath = writeMigrationFailureMarker(backupDir, databasePath, {
      databasePath,
      backupPath: path.join(backupDir, 'backup.sqlite'),
      failedAt: '2026-08-18T00:00:00.000Z',
      pendingMigrations: [{ version: 25, name: 'failed' }],
      error: 'failed',
    })
    assert.strictEqual(markerPath, getMigrationFailureMarkerPath(backupDir, databasePath))
    assert.throws(
      () => assertMigrationRetryAllowed(backupDir, databasePath, [{ version: 25, name: 'failed' }]),
      MigrationRetryBlockedError,
    )
    assert.doesNotThrow(
      () => assertMigrationRetryAllowed(backupDir, databasePath, [{ version: 26, name: 'new' }]),
    )
    clearMigrationFailureMarker(backupDir, databasePath)
    assert.strictEqual(fs.existsSync(markerPath), false)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('fails closed when a migration marker is unreadable', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-migration-marker-invalid-'))
  const databasePath = path.join(tempDir, 'algo-learning.sqlite')
  const backupDir = path.join(tempDir, 'backups')

  try {
    fs.mkdirSync(backupDir, { recursive: true })
    fs.writeFileSync(getMigrationFailureMarkerPath(backupDir, databasePath), '{invalid')
    assert.throws(
      () => assertMigrationRetryAllowed(backupDir, databasePath, []),
      MigrationRetryBlockedError,
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
