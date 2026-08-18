import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { closeDb, initDbAtPath } from '../../electron/db/connection'
import {
  claimLegacyScriptIdentity,
  createScript,
  getLegacyScriptByIdentityName,
  getScriptByIdentity,
  updateScriptWithLegacyClaim,
  updateScript,
} from '../../electron/db/repositories/userScriptRepository'

test('repository keeps display names editable while script identities remain stable', () => {
  withTemporaryDatabase(() => {
    const scriptId = createScript({
      name: 'Friendly Helper',
      namespace: 'example.namespace',
      identity_name: 'Stable Helper',
      description: null,
      version: '1.0.0',
      match_urls_json: '[]',
      code: '',
      file_path: null,
      site_ids_json: '[]',
      enabled: true,
    })

    assert.strictEqual(updateScript(scriptId, { name: 'My Custom Label' }), true)

    const script = getScriptByIdentity('example.namespace', 'Stable Helper')
    assert.ok(script)
    assert.strictEqual(script.id, scriptId)
    assert.strictEqual(script.name, 'My Custom Label')
    assert.strictEqual(script.identity_name, 'Stable Helper')
    assert.strictEqual(script.auto_update_enabled, true)
    assert.strictEqual(getScriptByIdentity('example.namespace', 'My Custom Label'), null)
    assert.strictEqual(getScriptByIdentity('Example.Namespace', 'Stable Helper'), null)
  })
})

test('repository creates local copies and atomically claims an active legacy canonical', () => {
  withTemporaryDatabase(() => {
    const localId = createScript({
      name: 'Local Copy',
      description: null,
      version: '1.0.0',
      match_urls_json: '[]',
      code: '',
      file_path: null,
      site_ids_json: '[]',
      enabled: true,
    })
    const local = getScriptByIdentity(`local:${localId}`, 'Local Copy')
    assert.ok(local)
    assert.strictEqual(local.auto_update_enabled, false)

    const legacyId = createScript({
      name: 'Legacy Display',
      namespace: null,
      identity_name: 'Legacy Identity',
      description: null,
      version: '1.0.0',
      match_urls_json: '[]',
      code: '',
      file_path: null,
      site_ids_json: '[]',
      enabled: true,
    })
    assert.strictEqual(getLegacyScriptByIdentityName('Legacy Identity')?.id, legacyId)
    assert.strictEqual(getScriptByIdentity('', 'Legacy Identity'), null)
    assert.strictEqual(claimLegacyScriptIdentity(legacyId, ''), true)
    assert.strictEqual(getLegacyScriptByIdentityName('Legacy Identity'), null)
    assert.strictEqual(getScriptByIdentity('', 'Legacy Identity')?.id, legacyId)

    const emptyNamespaceId = createScript({
      name: 'No Namespace Canonical',
      namespace: '',
      identity_name: 'Empty Identity',
      description: null,
      version: '1.0.0',
      match_urls_json: '[]',
      code: '',
      file_path: null,
      site_ids_json: '[]',
      enabled: true,
    })
    assert.strictEqual(getScriptByIdentity('', 'Empty Identity')?.id, emptyNamespaceId)

    const claimedLegacyId = createScript({
      name: 'Claimed Display',
      namespace: null,
      identity_name: 'Claimed Identity',
      description: null,
      version: '1.0.0',
      match_urls_json: '[]',
      code: '',
      file_path: null,
      site_ids_json: '[]',
      enabled: true,
    })

    assert.strictEqual(claimLegacyScriptIdentity(claimedLegacyId, 'claimed.namespace'), true)
    assert.strictEqual(getLegacyScriptByIdentityName('Claimed Identity'), null)
    assert.strictEqual(
      getScriptByIdentity('claimed.namespace', 'Claimed Identity')?.id,
      claimedLegacyId,
    )
    assert.strictEqual(claimLegacyScriptIdentity(claimedLegacyId, 'other.namespace'), false)
  })
})

test('legacy identity claim rolls back when the imported content update fails', () => {
  withTemporaryDatabase(() => {
    const legacyId = createScript({
      name: 'Legacy',
      namespace: null,
      identity_name: 'Legacy',
      description: null,
      version: '1.0.0',
      match_urls_json: '[]',
      code: '',
      file_path: null,
      site_ids_json: '[]',
      enabled: true,
    })

    assert.strictEqual(updateScriptWithLegacyClaim(legacyId, 'claimed.namespace', {}), false)
    assert.strictEqual(getLegacyScriptByIdentityName('Legacy')?.id, legacyId)
    assert.strictEqual(getScriptByIdentity('claimed.namespace', 'Legacy'), null)
  })
})

function withTemporaryDatabase(run: () => void): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'userscript-identity-test-'))
  try {
    initDbAtPath(path.join(tempDir, 'identity.sqlite'))
    run()
  } finally {
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}
