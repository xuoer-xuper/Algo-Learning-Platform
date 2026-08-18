import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { test } from 'vitest'
import { migration025 } from '../../electron/db/migrations/025_userscript_identity'

test('migration 025 preserves duplicates and assigns deterministic script identities', () => {
  const db = createLegacyDatabase()
  try {
    insertLegacyScript(db, 'canonical-a', 'Helper', '2026-08-01T10:00:00.000')
    insertLegacyScript(db, 'canonical-b', 'Helper', '2026-08-01T10:00:00.000')
    insertLegacyScript(db, 'copy-later', 'Helper', '2026-08-02T10:00:00.000')
    insertLegacyScript(db, 'only-one', 'Other', '2026-08-03T10:00:00.000')

    migration025.up(db)

    const rows = db.prepare(`
      SELECT id, namespace, identity_name, auto_update_enabled
      FROM user_scripts
      ORDER BY id ASC
    `).all()

    assert.deepStrictEqual(rows, [
      {
        id: 'canonical-a',
        namespace: null,
        identity_name: 'Helper',
        auto_update_enabled: 1,
      },
      {
        id: 'canonical-b',
        namespace: 'local:canonical-b',
        identity_name: 'Helper',
        auto_update_enabled: 0,
      },
      {
        id: 'copy-later',
        namespace: 'local:copy-later',
        identity_name: 'Helper',
        auto_update_enabled: 0,
      },
      {
        id: 'only-one',
        namespace: null,
        identity_name: 'Other',
        auto_update_enabled: 1,
      },
    ])
  } finally {
    db.close()
  }
})

test('migration 025 identity indexes ignore deleted rows and constrain legacy NULL identities', () => {
  const db = createLegacyDatabase()
  try {
    insertLegacyScript(db, 'legacy-active', 'Legacy', '2026-08-01T10:00:00.000')
    migration025.up(db)

    assert.throws(
      () => insertIdentityScript(db, 'legacy-conflict', null, 'Legacy', null),
      /UNIQUE constraint failed/,
    )
    insertIdentityScript(db, 'legacy-deleted', null, 'Legacy', '2026-08-04T10:00:00.000')

    insertIdentityScript(db, 'declared-active', 'example.namespace', 'Declared', null)
    assert.throws(
      () => insertIdentityScript(db, 'declared-conflict', 'example.namespace', 'Declared', null),
      /UNIQUE constraint failed/,
    )
    insertIdentityScript(
      db,
      'declared-deleted',
      'example.namespace',
      'Declared',
      '2026-08-04T10:00:00.000',
    )

    const indexes = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'index' AND tbl_name = 'user_scripts'
      ORDER BY name ASC
    `).all() as { name: string }[]
    assert.deepStrictEqual(indexes.map(row => row.name), [
      'sqlite_autoindex_user_scripts_1',
      'user_scripts_active_identity_unique',
      'user_scripts_active_legacy_identity_unique',
    ])
  } finally {
    db.close()
  }
})

test('migration 025 ignores earlier deleted duplicates when choosing the active canonical', () => {
  const db = createLegacyDatabase()
  try {
    insertLegacyScript(db, 'deleted-earlier', 'Helper', '2026-08-01T10:00:00.000')
    db.prepare('UPDATE user_scripts SET deleted_at = ? WHERE id = ?').run(
      '2026-08-02T10:00:00.000',
      'deleted-earlier',
    )
    insertLegacyScript(db, 'active-canonical', 'Helper', '2026-08-03T10:00:00.000')
    insertLegacyScript(db, 'active-copy', 'Helper', '2026-08-04T10:00:00.000')

    migration025.up(db)

    const rows = db.prepare(`
      SELECT id, namespace, auto_update_enabled
      FROM user_scripts
      ORDER BY id ASC
    `).all()
    assert.deepStrictEqual(rows, [
      { id: 'active-canonical', namespace: null, auto_update_enabled: 1 },
      { id: 'active-copy', namespace: 'local:active-copy', auto_update_enabled: 0 },
      { id: 'deleted-earlier', namespace: null, auto_update_enabled: 1 },
    ])
  } finally {
    db.close()
  }
})

function createLegacyDatabase(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE user_scripts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      version TEXT,
      match_urls_json TEXT NOT NULL,
      code TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      file_path TEXT,
      site_ids_json TEXT DEFAULT '[]',
      deleted_at TEXT
    );
  `)
  return db
}

function insertLegacyScript(
  db: Database.Database,
  id: string,
  name: string,
  createdAt: string,
): void {
  db.prepare(`
    INSERT INTO user_scripts (
      id, name, match_urls_json, code, enabled, created_at, updated_at
    ) VALUES (?, ?, '[]', '', 1, ?, ?)
  `).run(id, name, createdAt, createdAt)
}

function insertIdentityScript(
  db: Database.Database,
  id: string,
  namespace: string | null,
  identityName: string,
  deletedAt: string | null,
): void {
  db.prepare(`
    INSERT INTO user_scripts (
      id, name, namespace, identity_name, match_urls_json, code,
      enabled, auto_update_enabled, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, '[]', '', 1, 1, ?, ?, ?)
  `).run(
    id,
    identityName,
    namespace,
    identityName,
    '2026-08-04T10:00:00.000',
    '2026-08-04T10:00:00.000',
    deletedAt,
  )
}
