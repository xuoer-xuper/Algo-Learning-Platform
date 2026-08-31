import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import {
  getCredentialById,
  listCredentials,
  markCredentialUsed,
  renameCredential,
  parseCredentialEnvelope,
  softDeleteCredential,
  upsertCredential,
} from '../../electron/db/repositories/credentialRepository'

test('credential repository stores only a versioned envelope, revives tombstones, and hides deleted rows', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-credential-repository-'))
  try {
    initDbAtPath(path.join(tempDir, 'credentials.sqlite'))
    getDb().prepare(`
      INSERT INTO site_configs (
        id, name, domains_json, home_url, enabled, is_builtin, created_at, updated_at
      ) VALUES ('codeforces', 'Codeforces', '["codeforces.com"]', 'https://codeforces.com', 1, 1, 'now', 'now')
    `).run()

    const ciphertext = Buffer.from('encrypted-password-sentinel').toString('base64')
    const secretEnvelope = { version: 1 as const, provider: 'electron-safe-storage' as const, ciphertextBase64: ciphertext }
    const id = upsertCredential({ siteId: 'codeforces', username: 'alice', secretEnvelope })
    const stored = getCredentialById(id)
    assert.deepStrictEqual(stored?.secret_envelope, secretEnvelope)
    assert.deepStrictEqual(listCredentials(), [{
      id,
      site_id: 'codeforces',
      username: 'alice',
      display_name: null,
      last_used_at: null,
      created_at: stored?.created_at,
      updated_at: stored?.updated_at,
    }])

    const raw = getDb().prepare('SELECT secret_envelope, sync_excluded, deleted_at FROM site_credentials WHERE id = ?').get(id) as Record<string, unknown>
    assert.strictEqual(raw.sync_excluded, 1)
    assert.strictEqual(raw.deleted_at, null)
    assert.ok(String(raw.secret_envelope).includes('electron-safe-storage'))
    assert.ok(!String(raw.secret_envelope).includes('encrypted-password-sentinel'))
    assert.throws(() => parseCredentialEnvelope({ version: 1, provider: 'electron-safe-storage', ciphertextBase64: 'not base64!' }), /base64/)
    assert.throws(() => parseCredentialEnvelope({ provider: 'electron-safe-storage', ciphertextBase64: ciphertext }), /unsupported shape/)

    assert.strictEqual(markCredentialUsed(id), true)
    assert.strictEqual(renameCredential(id, 'Primary'), true)
    assert.strictEqual(listCredentials()[0].display_name, 'Primary')
    const used = getCredentialById(id)
    assert.ok(used?.last_used_at)
    assert.strictEqual(softDeleteCredential(id), true)
    assert.strictEqual(getCredentialById(id), null)
    /*
     * 软删除后：密文必须被清空，deleted_at 必须被写上。
     *
     * 原先这里是 `deepStrictEqual(row, { secret_envelope: null, deleted_at: <再查一次 deleted_at> })`
     * ——把 deleted_at 和它自己比，这半条断言无论如何都成立，等于只验了 secret_envelope。
     * 现在改成验它确实是个非空字符串：软删除的语义是"留痕删除"，时间戳没写上就是没留痕。
     *
     * `prepare<Params, Row>` 的第二个类型参数就是行类型，标上之后 `.get()` 返回的是有类型的行，
     * 不必再 `as Record<string, unknown>`（那样读字段又退回字符串索引，写错字段名不会报错）。
     */
    const deletedRow = getDb()
      .prepare<[string], { secret_envelope: string | null; deleted_at: string | null }>(
        'SELECT secret_envelope, deleted_at FROM site_credentials WHERE id = ?',
      )
      .get(id)
    assert.ok(deletedRow, 'soft delete must keep the row')
    assert.strictEqual(deletedRow.secret_envelope, null, 'soft delete must wipe the ciphertext')
    assert.ok(
      typeof deletedRow.deleted_at === 'string' && deletedRow.deleted_at.length > 0,
      'soft delete must stamp deleted_at',
    )

    const revivedId = upsertCredential({ siteId: 'codeforces', username: 'alice', secretEnvelope })
    assert.strictEqual(revivedId, id)
    assert.deepStrictEqual(getCredentialById(id)?.secret_envelope, secretEnvelope)
  } finally {
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
