import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import {
  exportLearningData,
  parseLearningDataExport,
} from '../../electron/backup/learningDataExport'
import { upsertCredential } from '../../electron/db/repositories/credentialRepository'

test('learning data export lists every excluded table and never includes credentials', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-credential-export-'))
  try {
    initDbAtPath(path.join(tempDir, 'export.sqlite'))
    getDb()
      .prepare(
        `
      INSERT INTO site_configs (
        id, name, domains_json, home_url, enabled, is_builtin, created_at, updated_at
      ) VALUES ('codeforces', 'Codeforces', '["codeforces.com"]', 'https://codeforces.com', 1, 1, 'now', 'now')
    `,
      )
      .run()
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
    const actualTables = (
      getDb()
        .prepare(
          `
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `,
        )
        .all() as Array<{ name: string }>
    ).map((row) => row.name)
    const exportedTables = Object.keys(exported.tables)
    const expectedExcluded = actualTables.filter((table) => !exportedTables.includes(table)).sort()
    assert.deepStrictEqual(exported.metadata.excluded_tables, expectedExcluded)
    assert.ok(exported.metadata.excluded_tables.includes('site_credentials'))
    assert.ok(exported.metadata.excluded_tables.includes('user_script_values'))
    assert.ok(exported.metadata.excluded_tables.includes('user_script_resources'))
    assert.ok(exported.metadata.excluded_tables.includes('user_script_host_permissions'))
    assert.ok(exported.metadata.excluded_tables.includes('user_script_update_state'))
    assert.ok(exported.metadata.excluded_tables.includes('schema_migrations'))
    assert.strictEqual(JSON.stringify(exported).includes('export-user'), false)
    assert.strictEqual(JSON.stringify(exported).includes('export-secret-sentinel'), false)
    assert.match(exported.metadata.complete_backup_hint, /JSON 和 SQLite.*都不是完整用户目录备份/)
    for (const scope of ['笔记正文', '图片附件', '配置', '脚本文件', '浏览器会话', '敏感数据']) {
      assert.ok(exported.metadata.complete_backup_hint.includes(scope))
    }
    const legacyExport = parseLearningDataExport({
      ...exported,
      schema_version: 1,
      exported_at: new Date(exported.exported_at).toISOString(),
      metadata: { excluded: exported.metadata.excluded },
    })
    assert.strictEqual(
      legacyExport.metadata.complete_backup_hint,
      exported.metadata.complete_backup_hint,
    )
    assert.throws(
      () => parseLearningDataExport({ ...exported, schema_version: 3 }),
      /不支持的导出版本/,
    )
  } finally {
    closeDb()
    const resolved = path.resolve(tempDir)
    assert.ok(resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}site-credential-export-`))
    fs.rmSync(resolved, { recursive: true, force: true })
  }
})
