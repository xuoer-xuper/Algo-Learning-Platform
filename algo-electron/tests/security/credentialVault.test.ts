import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  CredentialVaultCore,
  CredentialVaultError,
  type CredentialRepository,
  type CredentialSafeStorage,
} from '../../electron/credentials/credentialVaultCore'
import type {
  CredentialSecretEnvelopeV1,
  SiteCredential,
  SiteCredentialSummary,
} from '../../electron/db/repositories/credentialRepository'

function createHarness(options: {
  available?: boolean
  encrypted?: Buffer
  decryptResults?: Array<{ result: string; shouldReEncrypt: boolean }>
  getCredential?: SiteCredential | null
} = {}) {
  const calls = {
    encrypt: [] as string[],
    decrypt: [] as Buffer[],
    upsert: [] as Array<{ siteId: string; username: string; secretEnvelope: CredentialSecretEnvelopeV1 }>,
    marked: [] as string[],
  }
  let nextId = 'credential-1'
  const summary: SiteCredentialSummary = {
    id: nextId,
    site_id: 'codeforces',
    username: 'alice',
    last_used_at: null,
    created_at: '2026-08-19 10:00:00',
    updated_at: '2026-08-19 10:00:00',
  }
  let credential = options.getCredential ?? null
  const repository: CredentialRepository = {
    upsertCredential: (input) => {
      calls.upsert.push(input)
      nextId = credential?.id ?? nextId
      credential = {
        id: nextId,
        site_id: input.siteId,
        username: input.username,
        secret_envelope: input.secretEnvelope,
        last_used_at: null,
        sync_excluded: true,
        created_at: summary.created_at,
        updated_at: summary.updated_at,
      }
      return nextId
    },
    listCredentials: (siteId) => siteId && siteId !== summary.site_id ? [] : [{ ...summary, id: nextId }],
    getCredentialById: () => credential,
    softDeleteCredential: () => true,
    markCredentialUsed: (id) => { calls.marked.push(id); return true },
  }
  let resultIndex = 0
  const safeStorage: CredentialSafeStorage = {
    isEncryptionAvailable: () => options.available ?? true,
    encryptStringAsync: async (value) => {
      calls.encrypt.push(value)
      return options.encrypted ?? Buffer.from(`encrypted:${value}`)
    },
    decryptStringAsync: async (value) => {
      calls.decrypt.push(value)
      const result = options.decryptResults?.[resultIndex]
      resultIndex += 1
      return result ?? { result: value.toString('utf8'), shouldReEncrypt: false }
    },
  }
  return { vault: new CredentialVaultCore({ safeStorage, repository }), calls }
}

test('rejects save when system encryption is unavailable without touching storage', async () => {
  const { vault, calls } = createHarness({ available: false })
  await assert.rejects(
    vault.save({ siteId: 'codeforces', username: 'alice', password: 'secret' }),
    (error: unknown) => error instanceof CredentialVaultError && error.code === 'encryption-unavailable',
  )
  assert.deepStrictEqual(calls.encrypt, [])
  assert.deepStrictEqual(calls.upsert, [])
})

test('save encrypts before repository write and only returns a masked renderer summary', async () => {
  const { vault, calls } = createHarness()
  const result = await vault.save({ siteId: 'codeforces', username: 'alice', password: 'secret' })
  assert.deepStrictEqual(result, {
    credentialId: 'credential-1',
    siteId: 'codeforces',
    username: 'alice',
    masked: '********',
    lastUsedAt: null,
    createdAt: '2026-08-19 10:00:00',
    updatedAt: '2026-08-19 10:00:00',
  })
  assert.deepStrictEqual(calls.encrypt, ['secret'])
  assert.strictEqual(calls.upsert.length, 1)
  assert.strictEqual(calls.upsert[0].secretEnvelope.provider, 'electron-safe-storage')
  assert.ok(!JSON.stringify(result).includes('secret'))
  assert.ok(!JSON.stringify(result).includes('encrypted:'))
})

test('getForAutofill rejects unsupported envelopes and never falls back to plaintext', async () => {
  const unsupported = {
    id: 'credential-1',
    site_id: 'codeforces',
    username: 'alice',
    secret_envelope: { version: 9, provider: 'legacy', ciphertextBase64: 'c2VjcmV0' },
    last_used_at: null,
    sync_excluded: true,
    created_at: '2026-08-19 10:00:00',
    updated_at: '2026-08-19 10:00:00',
  } as unknown as SiteCredential
  const { vault, calls } = createHarness({ getCredential: unsupported })
  await assert.rejects(
    vault.getForAutofill('credential-1'),
    (error: unknown) => error instanceof CredentialVaultError && error.code === 'invalid-envelope',
  )
  assert.deepStrictEqual(calls.decrypt, [])
})

test('rotates an old safeStorage key before returning the main-process-only autofill value', async () => {
  const ciphertext = Buffer.from('old-ciphertext')
  const credential: SiteCredential = {
    id: 'credential-1',
    site_id: 'codeforces',
    username: 'alice',
    secret_envelope: {
      version: 1,
      provider: 'electron-safe-storage',
      ciphertextBase64: ciphertext.toString('base64'),
    },
    last_used_at: null,
    sync_excluded: true,
    created_at: '2026-08-19 10:00:00',
    updated_at: '2026-08-19 10:00:00',
  }
  const { vault, calls } = createHarness({
    getCredential: credential,
    decryptResults: [
      { result: 'secret', shouldReEncrypt: true },
      { result: 'secret', shouldReEncrypt: false },
    ],
    encrypted: Buffer.from('new-ciphertext'),
  })
  const result = await vault.getForAutofill('credential-1')
  assert.deepStrictEqual(result, {
    credentialId: 'credential-1',
    siteId: 'codeforces',
    username: 'alice',
    password: 'secret',
  })
  assert.strictEqual(calls.decrypt.length, 2)
  assert.deepStrictEqual(calls.encrypt, ['secret'])
  assert.strictEqual(calls.upsert.length, 1)
  assert.strictEqual(calls.upsert[0].secretEnvelope.ciphertextBase64, Buffer.from('new-ciphertext').toString('base64'))
  assert.deepStrictEqual(calls.marked, ['credential-1'])
})

test('list and delete expose no envelope and preserve structured validation errors', () => {
  const { vault } = createHarness()
  assert.deepStrictEqual(vault.list(), [{
    credentialId: 'credential-1',
    siteId: 'codeforces',
    username: 'alice',
    masked: '********',
    lastUsedAt: null,
    createdAt: '2026-08-19 10:00:00',
    updatedAt: '2026-08-19 10:00:00',
  }])
  assert.strictEqual(vault.delete('credential-1'), true)
  assert.throws(
    () => vault.delete(''),
    (error: unknown) => error instanceof CredentialVaultError && error.code === 'invalid-input',
  )
})
