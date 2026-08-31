import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'
import { ipcMain, ipcRenderer } from 'electron'
import { resetElectronMock } from '../electron/electronMock'
import type { CredentialVault } from '../../electron/credentials/CredentialVault'

const ownerState = vi.hoisted(() => ({ id: 'shell-1' as string | null }))

vi.mock('../../electron/ipc/trustedSender', () => ({
  ipcMain,
  onFromOj: (channel: string, listener: (...args: any[]) => void) => ipcMain.on(channel, listener),
  getShellWindowOwner: () => ownerState.id ? { id: ownerState.id } : null,
}))

const { registerCredentialsIpc } = await import('../../electron/ipc/registerCredentialsIpc')

beforeEach(() => {
  resetElectronMock()
  ownerState.id = 'shell-1'
})

test('credentials IPC exposes only masked list and delete operations', async () => {
  // vi.fn 必须留在局部常量上：写进对象字面量、整个对象再断言成 CredentialVault 之后，
  // 字段类型会退化成类的方法签名，mock.calls 就读不到了。签名用 CredentialVault['list']
  // 这种索引写法从真实类上取，替身实现和真实契约不会各自漂移。
  const list = vi.fn<CredentialVault['list']>(siteId => [{
    credentialId: 'credential-1',
    siteId: siteId ?? 'codeforces',
    username: 'alice',
    displayName: null,
    masked: '********',
    lastUsedAt: null,
    createdAt: '2026-08-19 10:00:00',
    updatedAt: '2026-08-19 10:00:00',
  }])
  const remove = vi.fn<CredentialVault['delete']>(() => true)
  const vault = { list, delete: remove } as unknown as CredentialVault

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
  assert.deepStrictEqual(list.mock.calls, [['codeforces']])
  assert.strictEqual(JSON.stringify(listed).includes('password'), false)
  assert.strictEqual(JSON.stringify(listed).includes('secret'), false)

  assert.strictEqual(await ipcRenderer.invoke('credentials:delete', 'credential-1'), true)
  assert.deepStrictEqual(remove.mock.calls, [['credential-1']])
})

test('credentials IPC rejects non-string identifiers before reaching the vault', async () => {
  const list = vi.fn<CredentialVault['list']>(() => [])
  const remove = vi.fn<CredentialVault['delete']>(() => true)
  const vault = {
    list,
    delete: remove,
    rename: vi.fn<CredentialVault['rename']>(() => null),
  } as unknown as CredentialVault
  registerCredentialsIpc(vault)

  await assert.rejects(ipcRenderer.invoke('credentials:list', 42), /siteId must be a string/)
  await assert.rejects(ipcRenderer.invoke('credentials:delete', 42), /credentialId must be a string/)
  assert.strictEqual(list.mock.calls.length, 0)
  assert.strictEqual(remove.mock.calls.length, 0)
})

test('credentials IPC renames credentials and routes autofill prompt responses by shell owner', async () => {
  const rename = vi.fn<CredentialVault['rename']>(() => ({
    credentialId: 'credential-1',
    siteId: 'codeforces',
    username: 'alice',
    displayName: 'Primary',
    masked: '********',
    lastUsedAt: null,
    createdAt: 'now',
    updatedAt: 'now',
  }))
  const vault = {
    list: vi.fn<CredentialVault['list']>(() => []),
    delete: vi.fn<CredentialVault['delete']>(() => true),
    rename,
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
  assert.deepStrictEqual(rename.mock.calls, [['credential-1', 'Primary']])
  assert.strictEqual((await ipcRenderer.invoke('credentials:autofillPrompt')).requestId, 'request-1')
  assert.strictEqual(await ipcRenderer.invoke('credentials:autofillRespond', 'request-1', 'credential-1'), true)
  assert.deepStrictEqual(service.respondSelection.mock.calls, [['shell-1', 'request-1', 'credential-1']])

  ownerState.id = null
  assert.strictEqual(await ipcRenderer.invoke('credentials:autofillPrompt'), null)
  assert.strictEqual(await ipcRenderer.invoke('credentials:autofillRespond', 'request-1', null), false)
})

test('credentials IPC routes capture prompts and responses by shell owner', async () => {
  const vault = {
    list: vi.fn<CredentialVault['list']>(() => []),
    delete: vi.fn<CredentialVault['delete']>(() => true),
    rename: vi.fn<CredentialVault['rename']>(() => null),
  } as unknown as CredentialVault
  const service = {
    getCurrentPrompt: vi.fn((windowId: string) => windowId === 'shell-1' ? {
      captureId: 'capture-1',
      siteId: 'codeforces',
      siteName: 'Codeforces',
      username: 'alice',
      displayName: null,
      masked: '********',
      isUpdate: false,
    } : null),
    respondCapture: vi.fn(async () => true),
    receiveCapture: vi.fn(async () => true),
  }
  registerCredentialsIpc(vault, { getCaptureService: () => service as never })

  const prompt = await ipcRenderer.invoke('credentials:capturePrompt')
  assert.strictEqual(prompt.captureId, 'capture-1')
  assert.strictEqual(JSON.stringify(prompt).includes('password'), false)
  assert.strictEqual(await ipcRenderer.invoke('credentials:captureRespond', 'capture-1', 'save'), true)
  assert.deepStrictEqual(service.respondCapture.mock.calls, [['shell-1', 'capture-1', 'save']])

  assert.strictEqual(await ipcRenderer.invoke('credentials:captureRespond', 'capture-1', 'nope'), false)
  assert.strictEqual(await ipcRenderer.invoke('credentials:captureRespond', '', 'save'), false)
  ownerState.id = null
  assert.strictEqual(await ipcRenderer.invoke('credentials:capturePrompt'), null)
  assert.strictEqual(await ipcRenderer.invoke('credentials:captureRespond', 'capture-1', 'cancel'), false)
})
