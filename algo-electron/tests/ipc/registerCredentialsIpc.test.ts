import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'
import { ipcMain, ipcRenderer, resetElectronMock } from 'electron'
import type { CredentialVault } from '../../electron/credentials/CredentialVault'

const ownerState = vi.hoisted(() => ({ id: 'shell-1' as string | null }))

vi.mock('../../electron/ipc/trustedSender', () => ({
  ipcMain,
  getShellWindowOwner: () => ownerState.id ? { id: ownerState.id } : null,
}))

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
      displayName: null,
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
    displayName: null,
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
    rename: vi.fn(() => null),
  } as unknown as CredentialVault
  registerCredentialsIpc(vault)

  await assert.rejects(ipcRenderer.invoke('credentials:list', 42), /siteId must be a string/)
  await assert.rejects(ipcRenderer.invoke('credentials:delete', 42), /credentialId must be a string/)
  assert.strictEqual(vault.list.mock.calls.length, 0)
  assert.strictEqual(vault.delete.mock.calls.length, 0)
})

test('credentials IPC renames credentials and routes autofill prompt responses by shell owner', async () => {
  const vault = {
    list: vi.fn(() => []),
    delete: vi.fn(() => true),
    rename: vi.fn(() => ({
      credentialId: 'credential-1',
      siteId: 'codeforces',
      username: 'alice',
      displayName: 'Primary',
      masked: '********',
      lastUsedAt: null,
      createdAt: 'now',
      updatedAt: 'now',
    })),
  } as unknown as CredentialVault
  const service = {
    getCurrentPrompt: vi.fn((windowId: string) => windowId === 'shell-1' ? {
      requestId: 'request-1',
      siteId: 'codeforces',
      pageUrl: 'https://codeforces.com/enter',
      credentials: [],
    } : null),
    respondSelection: vi.fn(() => true),
  }
  registerCredentialsIpc(vault, { getAutofillService: () => service as never })

  assert.deepStrictEqual(await ipcRenderer.invoke('credentials:rename', 'credential-1', 'Primary'), {
    credentialId: 'credential-1',
    siteId: 'codeforces',
    username: 'alice',
    displayName: 'Primary',
    masked: '********',
    lastUsedAt: null,
    createdAt: 'now',
    updatedAt: 'now',
  })
  assert.deepStrictEqual(vault.rename.mock.calls, [['credential-1', 'Primary']])
  assert.strictEqual((await ipcRenderer.invoke('credentials:autofillPrompt')).requestId, 'request-1')
  assert.strictEqual(await ipcRenderer.invoke('credentials:autofillRespond', 'request-1', 'credential-1'), true)
  assert.deepStrictEqual(service.respondSelection.mock.calls, [['shell-1', 'request-1', 'credential-1']])

  ownerState.id = null
  assert.strictEqual(await ipcRenderer.invoke('credentials:autofillPrompt'), null)
  assert.strictEqual(await ipcRenderer.invoke('credentials:autofillRespond', 'request-1', null), false)
})
