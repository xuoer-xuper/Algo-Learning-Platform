import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import { exportLearningData } from '../../electron/backup/learningDataExport'
import { upsertCredential } from '../../electron/db/repositories/credentialRepository'

test('learning data export lists every excluded table and never includes credentials', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-credential-export-'))
  try {
    initDbAtPath(path.join(tempDir, 'export.sqlite'))
    getDb().prepare(`
      INSERT INTO site_configs (
        id, name, domains_json, home_url, enabled, is_builtin, created_at, updated_at
      ) VALUES ('codeforces', 'Codeforces', '["codeforces.com"]', 'https://codeforces.com', 1, 1, 'now', 'now')
    `).run()
    upsertCredential({
      siteId: 'codeforces',
      username: 'export-user',
      secretEnvelope: {
        version: 1,
        provider: 'electron-safe-storage',
        ciphertextBase64: Buffer.from('export-secret-sentinel').toString('base64'),
      },
    })

    const exported = exportLearningData()
    const actualTables = (getDb().prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `).all() as Array<{ name: string }>).map(row => row.name)
    const exportedTables = Object.keys(exported.tables)
    const expectedExcluded = actualTables.filter(table => !exportedTables.includes(table)).sort()
    assert.deepStrictEqual(exported.metadata.excluded_tables, expectedExcluded)
    assert.ok(exported.metadata.excluded_tables.includes('site_credentials'))
    assert.ok(exported.metadata.excluded_tables.includes('user_script_values'))
    assert.ok(exported.metadata.excluded_tables.includes('user_script_resources'))
    assert.ok(exported.metadata.excluded_tables.includes('user_script_host_permissions'))
    assert.ok(exported.metadata.excluded_tables.includes('user_script_update_state'))
    assert.ok(exported.metadata.excluded_tables.includes('schema_migrations'))
    assert.strictEqual(JSON.stringify(exported).includes('export-user'), false)
    assert.strictEqual(JSON.stringify(exported).includes('export-secret-sentinel'), false)
    assert.match(exported.metadata.complete_backup_hint, /完整备份请用数据库备份/)
  } finally {
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
