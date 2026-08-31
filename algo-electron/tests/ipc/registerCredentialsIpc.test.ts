import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'
import { ipcMain, ipcRenderer } from 'electron'
import { resetElectronMock } from '../electron/electronMock'
import type { CredentialVault } from '../../electron/credentials/CredentialVault'

const ownerState = vi.hoisted(() => ({ id: 'shell-1' as string | null }))

/*
 * 本文件刻意绕开 sender 校验（那部分由 tests/security/trustedSender.test.ts 负责），
 * 只单测注册模块的接线。但绕开 sender 不等于可以绕开载荷校验——替身要连"schema 元组"
 * 这一形态一起模拟，否则 schema 数组会被当成 listener 存进 handler 表。
 * 转发逻辑见 trustedSenderDouble（registerScriptsIpc.test.ts 共用同一份）。
 */
vi.mock('../../electron/ipc/trustedSender', async () => {
  const { createTrustedSenderDouble } = await import('./trustedSenderDouble')
  return {
    ipcMain: createTrustedSenderDouble(),
    onFromOj: (channel: string, listener: (...args: any[]) => void) => ipcMain.on(channel, listener),
    getShellWindowOwner: () => ownerState.id ? { id: ownerState.id } : null,
  }
})

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

  /*
   * 拒绝理由从 handler 里手写的 `TypeError('siteId must be a string')` 换成了统一的
   * 载荷拒绝。断言的承重部分没变——非法参数必须在进 Vault 之前被拦住，下面两条
   * `mock.calls.length === 0` 才是要守的东西；错误文案本身不是契约。
   *
   * 顺带多验两种以前漏掉的形状：空串和 null。原先的手写检查只判 `typeof !== 'string'`，
   * 空串能过（变成一次查不到的 list 调用），null 会被 `typeof` 挡住但理由含混。
   */
  for (const bad of [42, '', null, {}]) {
    await assert.rejects(
      ipcRenderer.invoke('credentials:list', bad),
      /Rejected IPC sender \(payload\)/,
      `credentials:list 应拒绝 ${JSON.stringify(bad)}`,
    )
    await assert.rejects(
      ipcRenderer.invoke('credentials:delete', bad),
      /Rejected IPC sender \(payload\)/,
      `credentials:delete 应拒绝 ${JSON.stringify(bad)}`,
    )
  }
  // undefined 对 list 是合法的（不按站点过滤），对 delete 不是。
  await assert.rejects(ipcRenderer.invoke('credentials:delete'), /Rejected IPC sender \(payload\)/)
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

  /*
   * 形状不对的现在是拒绝，而不是返回 false。
   *
   * 改判的理由：captureId 与 action 只可能来自壳 renderer 自己的代码，形状不对说明我们
   * 有 bug；而返回 false 会和"服务说不"（没有待处理的捕获、owner 已销毁——见下面 owner
   * 为 null 那条）混在一起，两种情况在调用方看来一模一样。App.tsx 的调用点本来就 catch，
   * 那处 catch 还会把错误提示显示出来，正是想要的效果。
   */
  await assert.rejects(
    ipcRenderer.invoke('credentials:captureRespond', 'capture-1', 'nope'),
    /Rejected IPC sender \(payload\)/,
    '未列出的 action 应被拒绝',
  )
  await assert.rejects(
    ipcRenderer.invoke('credentials:captureRespond', '', 'save'),
    /Rejected IPC sender \(payload\)/,
    '空 captureId 应被拒绝',
  )
  assert.strictEqual(
    service.respondCapture.mock.calls.length, 1,
    '两次非法调用都不应到达 service（此前只有 save 那次合法）',
  )
  ownerState.id = null
  assert.strictEqual(await ipcRenderer.invoke('credentials:capturePrompt'), null)
  assert.strictEqual(await ipcRenderer.invoke('credentials:captureRespond', 'capture-1', 'cancel'), false)
})
