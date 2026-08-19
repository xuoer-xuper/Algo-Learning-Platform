import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { test } from 'vitest'
import { migration029 } from '../../electron/db/migrations/029_site_credential_labels'

test('migration 029 adds an optional credential display name and is idempotent', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`
      CREATE TABLE site_credentials (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        username TEXT NOT NULL,
        secret_envelope TEXT,
        last_used_at TEXT,
        sync_excluded INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      INSERT INTO site_credentials (
        id, site_id, username, secret_envelope, created_at, updated_at
      ) VALUES ('credential-1', 'codeforces', 'alice', '{"version":1}', 'now', 'now');
    `)

    migration029.up(db)
    migration029.up(db)

    const columns = db.prepare('PRAGMA table_info(site_credentials)').all() as Array<{ name: string; notnull: number }>
    const displayName = columns.find(column => column.name === 'display_name')
    assert.ok(displayName)
    assert.strictEqual(displayName.notnull, 0)

    const row = db.prepare('SELECT display_name FROM site_credentials WHERE id = ?').get('credential-1') as { display_name: string | null }
    assert.strictEqual(row.display_name, null)
    db.prepare('UPDATE site_credentials SET display_name = ? WHERE id = ?').run('Primary', 'credential-1')
    assert.strictEqual(
      (db.prepare('SELECT display_name FROM site_credentials WHERE id = ?').get('credential-1') as { display_name: string }).display_name,
      'Primary',
    )
  } finally {
    db.close()
  }
})
