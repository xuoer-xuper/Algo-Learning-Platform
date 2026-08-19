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
    const used = getCredentialById(id)
    assert.ok(used?.last_used_at)
    assert.strictEqual(softDeleteCredential(id), true)
    assert.strictEqual(getCredentialById(id), null)
    assert.deepStrictEqual(getDb().prepare('SELECT secret_envelope, deleted_at FROM site_credentials WHERE id = ?').get(id), {
      secret_envelope: null,
      deleted_at: getDb().prepare('SELECT deleted_at FROM site_credentials WHERE id = ?').get(id)!.deleted_at,
    })

    const revivedId = upsertCredential({ siteId: 'codeforces', username: 'alice', secretEnvelope })
    assert.strictEqual(revivedId, id)
    assert.deepStrictEqual(getCredentialById(id)?.secret_envelope, secretEnvelope)
  } finally {
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
