import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'
import { ipcMain, ipcRenderer, resetElectronMock } from 'electron'
import type { CredentialVault } from '../../electron/credentials/CredentialVault'

vi.mock('../../electron/ipc/trustedSender', () => ({ ipcMain }))

const { registerCredentialsIpc } = await import('../../electron/ipc/registerCredentialsIpc')

beforeEach(() => {
  resetElectronMock()
})

test('credentials IPC exposes only masked list and delete operations', async () => {
  const vault = {
    list: vi.fn((siteId?: string) => [{
      credentialId: 'credential-1',
      siteId: siteId ?? 'codeforces',
      username: 'alice',
      masked: '********',
      lastUsedAt: null,
      createdAt: '2026-08-19 10:00:00',
      updatedAt: '2026-08-19 10:00:00',
    }]),
    delete: vi.fn(() => true),
  } as unknown as CredentialVault

  registerCredentialsIpc(vault)

  const listed = await ipcRenderer.invoke('credentials:list', 'codeforces')
  assert.deepStrictEqual(listed, [{
    credentialId: 'credential-1',
    siteId: 'codeforces',
    username: 'alice',
    masked: '********',
    lastUsedAt: null,
    createdAt: '2026-08-19 10:00:00',
    updatedAt: '2026-08-19 10:00:00',
  }])
  assert.deepStrictEqual(vault.list.mock.calls, [['codeforces']])
  assert.strictEqual(JSON.stringify(listed).includes('password'), false)
  assert.strictEqual(JSON.stringify(listed).includes('secret'), false)

  assert.strictEqual(await ipcRenderer.invoke('credentials:delete', 'credential-1'), true)
  assert.deepStrictEqual(vault.delete.mock.calls, [['credential-1']])
})

test('credentials IPC rejects non-string identifiers before reaching the vault', async () => {
  const vault = {
    list: vi.fn(() => []),
    delete: vi.fn(() => true),
  } as unknown as CredentialVault
  registerCredentialsIpc(vault)

  await assert.rejects(ipcRenderer.invoke('credentials:list', 42), /siteId must be a string/)
  await assert.rejects(ipcRenderer.invoke('credentials:delete', 42), /credentialId must be a string/)
  assert.strictEqual(vault.list.mock.calls.length, 0)
  assert.strictEqual(vault.delete.mock.calls.length, 0)
})
