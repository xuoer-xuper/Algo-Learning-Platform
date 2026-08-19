import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { test } from 'vitest'
import {
  closeDb,
  getDb,
  initDbAtPath,
  initDbAtPathWithMigrationSafety,
} from '../../electron/db/connection'
import type { Logger } from '../../electron/shared/logger'
import { migration026 } from '../../electron/db/migrations/026_site_credentials'

test('migration 026 creates versioned site credential storage with enforced invariants', () => {
  const db = new Database(':memory:')
  try {
    db.pragma('foreign_keys = ON')
    db.exec('CREATE TABLE site_configs (id TEXT PRIMARY KEY)')
    db.prepare('INSERT INTO site_configs (id) VALUES (?)').run('codeforces')
    migration026.up(db)

    const columns = db.prepare('PRAGMA table_info(site_credentials)').all() as Array<{ name: string; notnull: number }>
    assert.deepStrictEqual(columns.map(column => column.name), [
      'id', 'site_id', 'username', 'secret_envelope', 'last_used_at',
      'sync_excluded', 'created_at', 'updated_at', 'deleted_at',
    ])

    const envelope = JSON.stringify({
      version: 1,
      provider: 'electron-safe-storage',
      ciphertextBase64: Buffer.from('ciphertext').toString('base64'),
    })
    const insert = db.prepare(`
      INSERT INTO site_credentials (
        id, site_id, username, secret_envelope, sync_excluded,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?)
    `)
    insert.run('credential-1', 'codeforces', 'alice', envelope, '2026-08-19T10:00:00+08:00', '2026-08-19T10:00:00+08:00')

    assert.throws(
      () => insert.run('credential-2', 'codeforces', 'alice', envelope, '2026-08-19T10:00:00+08:00', '2026-08-19T10:00:00+08:00'),
      /UNIQUE constraint failed/,
    )
    assert.throws(
      () => db.prepare(`
        INSERT INTO site_credentials (
          id, site_id, username, secret_envelope, sync_excluded,
          created_at, updated_at
        ) VALUES ('credential-bad', 'codeforces', 'bob', ?, 0, 'now', 'now')
      `).run(envelope),
      /CHECK constraint failed/,
    )
    db.prepare(`
      UPDATE site_credentials
      SET secret_envelope = NULL, deleted_at = '2026-08-19T11:00:00+08:00', updated_at = '2026-08-19T11:00:00+08:00'
      WHERE id = 'credential-1'
    `).run()
    assert.deepStrictEqual(
      db.prepare('SELECT secret_envelope, deleted_at FROM site_credentials WHERE id = ?').get('credential-1'),
      { secret_envelope: null, deleted_at: '2026-08-19T11:00:00+08:00' },
    )
  } finally {
    db.close()
  }
})

test('migration safety restores the pre-026 database when a later migration fails', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-credential-migration-safety-'))
  const dbPath = path.join(tempDir, 'data', 'algo-learning.sqlite')
  const backupDir = path.join(tempDir, 'backups')
  try {
    initDbAtPath(dbPath)
    getDb().exec(`CREATE TABLE migration_sentinel (value TEXT NOT NULL); INSERT INTO migration_sentinel VALUES ('preserved');`)
    closeDb()

    const legacy = new Database(dbPath)
    legacy.prepare('DELETE FROM schema_migrations WHERE version = 26').run()
    legacy.exec('DROP TABLE site_credentials')
    legacy.close()

    await assert.rejects(
      initDbAtPathWithMigrationSafety(dbPath, {
        backupDir,
        migrations: [
          migration026,
          { version: 9003, name: 'credential_follow_up_failure', up: () => { throw new Error('follow-up failure') } },
        ],
        logger: new SilentLogger(),
      }),
      /follow-up failure/,
    )

    const restored = new Database(dbPath)
    assert.deepStrictEqual(restored.prepare('SELECT value FROM migration_sentinel').get(), { value: 'preserved' })
    assert.strictEqual(
      restored.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'site_credentials'").get(),
      undefined,
    )
    restored.close()
  } finally {
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  fatal(): void {}
  getLogFilePath(): null { return null }
}
