import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { test } from 'vitest'
import {
  closeDb,
  initDbAtPathWithMigrationSafety,
} from '../../electron/db/connection'
import { migration027 } from '../../electron/db/migrations/027_userscript_runtime'
import type { Logger } from '../../electron/shared/logger'

const now = '2026-08-19T12:00:00+08:00'

test('migration 027 backfills separated metadata and creates constrained runtime storage', () => {
  const migrationSource = fs.readFileSync(
    path.join(process.cwd(), 'electron', 'db', 'migrations', '027_userscript_runtime.ts'),
    'utf8',
  )
  assert.match(migrationSource, /function parseMigration027Metadata/)
  assert.doesNotMatch(migrationSource, /from ['"]\.\.\/\.\.\/scripts\//)

  const db = new Database(':memory:')
  try {
    db.pragma('foreign_keys = ON')
    createPre027UserScriptsTable(db)
    db.prepare(`
      INSERT INTO user_scripts (
        id, name, namespace, identity_name, match_urls_json, code,
        enabled, auto_update_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
    `).run(
      'script-1',
      'Helper',
      '',
      'Helper',
      JSON.stringify(['https://example.com/*', 'https://mirror.example/*']),
      userscriptSource(),
      now,
      now,
    )

    migration027.up(db)

    const columns = db.prepare('PRAGMA table_info(user_scripts)').all() as Array<{ name: string }>
    for (const column of [
      'include_rules_json', 'exclude_rules_json', 'exclude_match_rules_json',
      'grant_json', 'connect_json', 'noframes', 'run_at', 'update_url',
      'download_url', 'last_install_url', 'antifeature_json', 'icon_url',
    ]) {
      assert.ok(columns.some(candidate => candidate.name === column), `missing ${column}`)
    }

    const script = db.prepare(`
      SELECT match_urls_json, include_rules_json, exclude_rules_json,
        exclude_match_rules_json, grant_json, connect_json, noframes,
        run_at, update_url, download_url, antifeature_json, icon_url
      FROM user_scripts WHERE id = 'script-1'
    `).get() as Record<string, unknown>
    assert.deepStrictEqual(JSON.parse(script.match_urls_json as string), ['https://example.com/*'])
    assert.deepStrictEqual(JSON.parse(script.include_rules_json as string), ['https://mirror.example/*'])
    assert.deepStrictEqual(JSON.parse(script.exclude_rules_json as string), ['https://example.com/private/*'])
    assert.deepStrictEqual(JSON.parse(script.exclude_match_rules_json as string), ['https://example.com/strict/*'])
    assert.deepStrictEqual(JSON.parse(script.grant_json as string), ['GM_getValue'])
    assert.deepStrictEqual(JSON.parse(script.connect_json as string), ['api.example.com'])
    assert.strictEqual(script.noframes, 1)
    assert.strictEqual(script.run_at, 'document-start')
    assert.strictEqual(script.update_url, 'https://example.com/helper.meta.js')
    assert.strictEqual(script.download_url, 'https://example.com/helper.user.js')
    assert.deepStrictEqual(JSON.parse(script.antifeature_json as string), ['tracking'])
    assert.strictEqual(script.icon_url, 'https://example.com/icon.png')

    assert.throws(
      () => db.prepare("UPDATE user_scripts SET include_rules_json = '{}' WHERE id = 'script-1'").run(),
      /CHECK constraint failed/,
    )

    insertRuntimeRows(db)
    // `prepare<Params, Row>` 的第二个类型参数就是行类型；不标的话 `.get()` 返回 unknown，
    // 读 `.content_blob` 报"Property 'content_blob' does not exist on type '{}'"，
    // 只能靠 `as Buffer` 硬转过去。标上以后 BLOB 确实是 Buffer，转换也就不需要了。
    const resourceRow = db
      .prepare<[], { content_blob: Buffer }>("SELECT content_blob FROM user_script_resources WHERE id = 'resource-1'")
      .get()
    assert.ok(resourceRow, 'migration should have inserted the sample resource row')
    assert.deepStrictEqual(Array.from(resourceRow.content_blob), [0, 127, 255])
    assert.throws(
      () => db.prepare(`
        INSERT INTO user_script_update_state (script_id, status, updated_at)
        VALUES ('script-1', 'invalid', ?)
      `).run(now),
      /CHECK constraint failed/,
    )
    assert.throws(
      () => db.prepare(`
        INSERT INTO user_script_resources (
          id, script_id, resource_kind, resource_key, declaration_order,
          source_url, created_at, updated_at
        ) VALUES ('resource-conflict', 'script-1', 'require', 'require-2', 0, 'https://cdn.example/2.js', ?, ?)
      `).run(now, now),
      /UNIQUE constraint failed/,
    )

    db.prepare("DELETE FROM user_scripts WHERE id = 'script-1'").run()
    for (const table of [
      'user_script_values',
      'user_script_resources',
      'user_script_host_permissions',
      'user_script_update_state',
    ]) {
      const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
      assert.strictEqual(count.count, 0, `${table} did not cascade`)
    }
  } finally {
    db.close()
  }
})

test('migration safety restores the pre-027 database when a later migration fails', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'userscript-runtime-migration-safety-'))
  const dbPath = path.join(tempDir, 'data', 'algo-learning.sqlite')
  const backupDir = path.join(tempDir, 'backups')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  try {
    const legacy = new Database(dbPath)
    legacy.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations VALUES (26, 'site_credentials', '${now}');
      CREATE TABLE migration_sentinel (value TEXT NOT NULL);
      INSERT INTO migration_sentinel VALUES ('preserved');
    `)
    createPre027UserScriptsTable(legacy)
    legacy.close()

    await assert.rejects(
      initDbAtPathWithMigrationSafety(dbPath, {
        backupDir,
        migrations: [
          migration027,
          { version: 9004, name: 'runtime_follow_up_failure', up: () => { throw new Error('follow-up failure') } },
        ],
        logger: new SilentLogger(),
      }),
      /follow-up failure/,
    )

    const restored = new Database(dbPath)
    assert.deepStrictEqual(restored.prepare('SELECT value FROM migration_sentinel').get(), { value: 'preserved' })
    assert.strictEqual(
      restored.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user_script_values'").get(),
      undefined,
    )
    const columns = restored.prepare('PRAGMA table_info(user_scripts)').all() as Array<{ name: string }>
    assert.strictEqual(columns.some(column => column.name === 'include_rules_json'), false)
    restored.close()
  } finally {
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

function createPre027UserScriptsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE user_scripts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      namespace TEXT,
      identity_name TEXT NOT NULL DEFAULT '',
      description TEXT,
      version TEXT,
      match_urls_json TEXT NOT NULL,
      code TEXT NOT NULL,
      file_path TEXT,
      site_ids_json TEXT DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      auto_update_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `)
}

function insertRuntimeRows(db: Database.Database): void {
  db.prepare(`
    INSERT INTO user_script_values (
      id, script_id, value_key, value_json, created_at, updated_at
    ) VALUES ('value-1', 'script-1', 'theme', '"dark"', ?, ?)
  `).run(now, now)
  db.prepare(`
    INSERT INTO user_script_resources (
      id, script_id, resource_kind, resource_key, declaration_order,
      source_url, content_blob, content_encoding, created_at, updated_at
    ) VALUES ('resource-1', 'script-1', 'require', 'require-1', 0, ?, ?, 'binary', ?, ?)
  `).run('https://cdn.example/1.js', Buffer.from([0, 127, 255]), now, now)
  db.prepare(`
    INSERT INTO user_script_host_permissions (
      id, script_id, host_pattern, granted_at
    ) VALUES ('host-1', 'script-1', 'api.example.com', ?)
  `).run(now)
  db.prepare(`
    INSERT INTO user_script_update_state (
      script_id, next_check_at, status, updated_at
    ) VALUES ('script-1', ?, 'idle', ?)
  `).run(now, now)
}

function userscriptSource(): string {
  return [
    '// ==UserScript==',
    '// @name Helper',
    '// @match https://example.com/*',
    '// @include https://mirror.example/*',
    '// @exclude https://example.com/private/*',
    '// @exclude-match https://example.com/strict/*',
    '// @grant GM_getValue',
    '// @connect api.example.com',
    '// @noframes',
    '// @run-at document-start',
    '// @updateURL https://example.com/helper.meta.js',
    '// @downloadURL https://example.com/helper.user.js',
    '// @antifeature tracking',
    '// @icon https://example.com/icon.png',
    '// ==/UserScript==',
    'console.log("helper")',
  ].join('\n')
}

class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  fatal(): void {}
  getLogFilePath(): null { return null }
}
