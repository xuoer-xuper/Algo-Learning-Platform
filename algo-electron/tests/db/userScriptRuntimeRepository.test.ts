import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { closeDb, initDbAtPath } from '../../electron/db/connection'
import {
  createScript,
  deleteScript,
  getScriptById,
  updateScript,
} from '../../electron/db/repositories/userScriptRepository'
import {
  deleteUserScriptValue,
  getUserScriptUpdateState,
  getUserScriptValue,
  grantUserScriptHost,
  hasUserScriptHostPermission,
  listUserScriptHostPermissions,
  listUserScriptResources,
  listUserScriptValues,
  markUserScriptHostUsed,
  revokeUserScriptHost,
  setUserScriptValue,
  upsertUserScriptResource,
  upsertUserScriptUpdateState,
} from '../../electron/db/repositories/userScriptRuntimeRepository'

test('userscript runtime repositories round-trip metadata, values, resources, hosts, and update state', () => {
  withTemporaryDatabase(() => {
    const scriptId = createScript({
      name: 'Runtime Helper',
      namespace: 'runtime.example',
      identity_name: 'Runtime Helper',
      description: null,
      version: '1.0.0',
      match_urls_json: '["https://example.com/*"]',
      include_rules_json: '["https://mirror.example/*"]',
      exclude_rules_json: '["https://example.com/private/*"]',
      exclude_match_rules_json: '["https://example.com/strict/*"]',
      grant_json: '["GM_getValue","GM_setValue"]',
      connect_json: '["api.example.com"]',
      noframes: true,
      run_at: 'document-start',
      update_url: 'https://example.com/helper.meta.js',
      download_url: 'https://example.com/helper.user.js',
      last_install_url: 'https://example.com/install.user.js',
      antifeature_json: '["tracking"]',
      icon_url: 'https://example.com/icon.png',
      code: 'console.log("runtime")',
      file_path: null,
      site_ids_json: '[]',
      enabled: true,
    })

    const created = getScriptById(scriptId)
    assert.ok(created)
    assert.strictEqual(created.noframes, true)
    assert.strictEqual(created.exclude_match_rules_json, '["https://example.com/strict/*"]')
    assert.strictEqual(created.last_install_url, 'https://example.com/install.user.js')
    assert.strictEqual(updateScript(scriptId, {
      noframes: false,
      exclude_match_rules_json: '[]',
      last_install_url: null,
    }), true)
    assert.strictEqual(getScriptById(scriptId)?.noframes, false)
    assert.strictEqual(getScriptById(scriptId)?.exclude_match_rules_json, '[]')
    assert.strictEqual(getScriptById(scriptId)?.last_install_url, null)

    const valueId = setUserScriptValue(scriptId, 'settings', { theme: 'dark', count: 2 })
    assert.deepStrictEqual(getUserScriptValue(scriptId, 'settings')?.value, { theme: 'dark', count: 2 })
    assert.strictEqual(setUserScriptValue(scriptId, 'settings', ['updated']), valueId)
    assert.deepStrictEqual(listUserScriptValues(scriptId).map(value => [value.value_key, value.value]), [
      ['settings', ['updated']],
    ])
    assert.throws(() => setUserScriptValue(scriptId, 'invalid', undefined), /JSON serializable/)
    assert.strictEqual(deleteUserScriptValue(scriptId, 'settings'), true)
    assert.strictEqual(deleteUserScriptValue(scriptId, 'settings'), false)

    const requireId = upsertUserScriptResource({
      scriptId,
      kind: 'require',
      key: 'require-0',
      declarationOrder: 0,
      sourceUrl: 'https://cdn.example.com/helper.js',
      content: Buffer.from('console.log("dependency")', 'utf8'),
      contentEncoding: 'utf8',
      contentType: 'application/javascript',
      integrity: 'sha256-demo',
      fetchedAt: '2026-08-19T13:00:00+08:00',
    })
    assert.strictEqual(upsertUserScriptResource({
      scriptId,
      kind: 'require',
      key: 'require-0',
      declarationOrder: 0,
      sourceUrl: 'https://cdn.example.com/helper-v2.js',
      content: Buffer.from([0, 127, 255]),
    }), requireId)
    upsertUserScriptResource({
      scriptId,
      kind: 'resource',
      key: 'logo',
      declarationOrder: 0,
      sourceUrl: 'https://cdn.example.com/logo.png',
      content: Buffer.from([137, 80, 78, 71]),
      contentType: 'image/png',
    })
    const resources = listUserScriptResources(scriptId)
    assert.deepStrictEqual(resources.map(resource => resource.resource_kind), ['require', 'resource'])
    assert.deepStrictEqual(Array.from(resources[0].content_blob ?? []), [0, 127, 255])
    assert.throws(() => upsertUserScriptResource({
      scriptId,
      kind: 'require',
      key: 'require-conflict',
      declarationOrder: 0,
      sourceUrl: 'https://cdn.example.com/conflict.js',
    }), /UNIQUE constraint failed/)

    const permissionId = grantUserScriptHost(scriptId, 'API.Example.com')
    assert.strictEqual(hasUserScriptHostPermission(scriptId, 'api.example.com'), true)
    assert.strictEqual(markUserScriptHostUsed(scriptId, 'api.example.com'), true)
    assert.strictEqual(revokeUserScriptHost(scriptId, 'api.example.com'), true)
    assert.strictEqual(hasUserScriptHostPermission(scriptId, 'api.example.com'), false)
    assert.strictEqual(grantUserScriptHost(scriptId, 'api.example.com'), permissionId)
    assert.strictEqual(listUserScriptHostPermissions(scriptId).length, 1)

    upsertUserScriptUpdateState({
      scriptId,
      status: 'checking',
      etag: 'etag-1',
      nextCheckAt: '2026-08-20T13:00:00+08:00',
    })
    upsertUserScriptUpdateState({
      scriptId,
      status: 'available',
      availableVersion: '1.1.0',
      lastCheckedAt: '2026-08-19T13:10:00+08:00',
    })
    const updateState = getUserScriptUpdateState(scriptId)
    assert.strictEqual(updateState?.status, 'available')
    assert.strictEqual(updateState?.etag, 'etag-1')
    assert.strictEqual(updateState?.available_version, '1.1.0')
    assert.strictEqual(updateState?.next_check_at, '2026-08-20T13:00:00+08:00')

    assert.strictEqual(deleteScript(scriptId), true)
    assert.deepStrictEqual(listUserScriptResources(scriptId), [])
    assert.deepStrictEqual(listUserScriptHostPermissions(scriptId), [])
    assert.strictEqual(getUserScriptUpdateState(scriptId), null)
  })
})

function withTemporaryDatabase(run: () => void): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'userscript-runtime-repository-'))
  try {
    initDbAtPath(path.join(tempDir, 'runtime.sqlite'))
    run()
  } finally {
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}
