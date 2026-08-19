import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { test } from 'vitest'
import { closeDb, initDbAtPath } from '../../electron/db/connection'
import { migration028 } from '../../electron/db/migrations/028_site_login_autofill'
import { getAllSites, getSiteById, seedBuiltinSites } from '../../electron/db/repositories/siteRepository'

test('migration 028 adds login autofill columns and backfills existing built-in rows', () => {
  const db = new Database(':memory:')
  try {
    createPre028SiteTable(db)
    db.prepare(`
      INSERT INTO site_configs (
        id, name, domains_json, home_url, enabled, is_builtin, created_at, updated_at
      ) VALUES ('codeforces', 'Codeforces', '["codeforces.com"]', 'https://codeforces.com', 1, 1, 'now', 'now')
    `).run()
    migration028.up(db)

    const columns = db.prepare('PRAGMA table_info(site_configs)').all() as Array<{ name: string }>
    for (const column of [
      'login_url_patterns_json',
      'login_username_selectors_json',
      'login_password_selectors_json',
    ]) {
      assert.ok(columns.some(candidate => candidate.name === column), `missing ${column}`)
    }

    const row = db.prepare(`
      SELECT adapter, cookie_policy, login_url_patterns_json,
        login_username_selectors_json, login_password_selectors_json
      FROM site_configs WHERE id = 'codeforces'
    `).get() as Record<string, unknown>
    assert.strictEqual(row.adapter, 'codeforces')
    assert.strictEqual(row.cookie_policy, 'session-only')
    assert.deepStrictEqual(JSON.parse(row.login_url_patterns_json as string), ['/enter'])
    assert.ok(JSON.parse(row.login_username_selectors_json as string).includes('input[name="handleOrEmail"]'))
    assert.ok(JSON.parse(row.login_password_selectors_json as string).includes('input[name="password"]'))
  } finally {
    db.close()
  }
})

test('built-in seed makes DB site_configs the complete seven-site runtime source without overwriting enable state', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-login-autofill-'))
  try {
    initDbAtPath(path.join(tempDir, 'site.sqlite'))
    seedBuiltinSites()
    const sites = getAllSites()
    assert.strictEqual(sites.length, 7)
    for (const site of sites) {
      assert.ok(site.adapter, `${site.id} adapter`)
      assert.ok(site.cookiePolicy, `${site.id} cookie policy`)
      assert.ok(site.loginUrlPatterns?.length, `${site.id} login URL patterns`)
      assert.ok(site.loginUsernameSelectors?.length, `${site.id} username selectors`)
      assert.ok(site.loginPasswordSelectors?.length, `${site.id} password selectors`)
    }

    const codeforces = getSiteById('codeforces')!
    assert.ok(codeforces.problemUrlPatterns?.length)
    assert.strictEqual(codeforces.adapter, 'codeforces')
    assert.strictEqual(codeforces.loginUrlPatterns?.[0], '/enter')
  } finally {
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

function createPre028SiteTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE site_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domains_json TEXT NOT NULL,
      home_url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      problem_url_patterns_json TEXT,
      submit_url_patterns_json TEXT,
      cookie_policy TEXT,
      adapter TEXT,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
}
