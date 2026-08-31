import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { app, BrowserWindow, dialog, ipcMain, ipcRenderer, shell } from 'electron'
import { resetElectronMock } from '../electron/electronMock'
import { closeDb, initDbAtPath } from '../../electron/db/connection'
import {
  createScript,
  getAllScripts,
  getScriptById,
  updateScript,
  type UserScript,
} from '../../electron/db/repositories/userScriptRepository'
import {
  getUserScriptUpdateState,
  listUserScriptResources,
} from '../../electron/db/repositories/userScriptRuntimeRepository'
import {
  getUserScriptImportConfirmationOptions,
  registerScriptsIpc,
} from '../../electron/ipc/registerScriptsIpc'
import { PendingUserScriptInstallRegistry } from '../../electron/downloads/userScriptNavigation'
import { UserScriptRemoteInstaller } from '../../electron/scripts/UserScriptRemoteInstaller'

// 替身要连"schema 元组"这一形态一起模拟，见 trustedSenderDouble 的说明。
// 工厂是 async 的：`vi.mock` 会被提到文件顶，普通工厂里引用不到上面的 import。
vi.mock('../../electron/ipc/trustedSender', async () => {
  const { createTrustedSenderDouble } = await import('./trustedSenderDouble')
  return {
    getShellWindowOwner: () => null,
    ipcMain: createTrustedSenderDouble(),
  }
})

let tempDirectory = ''

beforeEach(() => {
  resetElectronMock()
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'userscript-ipc-test-'))
  initDbAtPath(path.join(tempDirectory, 'test.sqlite'))
  vi.spyOn(app, 'getPath').mockReturnValue(tempDirectory)
})

afterEach(() => {
  closeDb()
  vi.restoreAllMocks()
  fs.rmSync(tempDirectory, { recursive: true, force: true })
})

test('new imports persist complete runtime metadata and create an explicit empty namespace canonical', async () => {
  const parent = new BrowserWindow()
  const source = userscript('Helper', '1.0.0', 'https://example.com/*', undefined, runtimeMetadataLines())
  const sourcePath = writeSource('new.user.js', source)
  const openDialog = vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({
    canceled: false,
    filePaths: [sourcePath],
  })
  const messageBox = vi.spyOn(dialog, 'showMessageBox')
  registerScriptsIpc({ getParentWindow: () => parent })

  const id = await ipcRenderer.invoke('scripts:importFile') as string
  const imported = getScriptById(id)

  assert.ok(imported)
  assert.strictEqual(imported.namespace, '')
  assert.strictEqual(imported.identity_name, 'Helper')
  assert.strictEqual(imported.version, '1.0.0')
  assert.strictEqual(imported.auto_update_enabled, true)
  assertRuntimeMetadata(imported)
  assert.ok(imported.file_path?.endsWith('.user.js'))
  assert.strictEqual(fs.readFileSync(imported.file_path!, 'utf8'), source)
  assert.strictEqual(openDialog.mock.calls[0][0], parent)
  assert.strictEqual(messageBox.mock.calls.length, 0)
  assert.ok(fs.existsSync(sourcePath), 'the selected source file must never be removed')
})

test('imports download and atomically persist verified require and resource caches', async () => {
  const dependency = 'globalThis.__dependencyReady = true'
  const style = 'body { color: red; }'
  const source = userscript('Resource Helper', '1.0.0', 'https://example.com/*', undefined, [
    `// @require https://cdn.example.com/dependency.js#sha256=${createHash('sha256').update(dependency).digest('hex')}`,
    `// @resource theme https://cdn.example.com/theme.css#md5=${createHash('md5').update(style).digest('base64')}`,
  ])
  const sourcePath = writeSource('resource.user.js', source)
  vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
  const fetchResource = vi.fn(async (url: string) => new Response(
    url.endsWith('.js') ? dependency : style,
    { headers: { 'content-type': url.endsWith('.js') ? 'application/javascript' : 'text/css' } },
  ))
  registerScriptsIpc({ fetchResource })

  const scriptId = await ipcRenderer.invoke('scripts:importFile') as string
  const resources = listUserScriptResources(scriptId)
  assert.deepStrictEqual(resources.map(resource => [
    resource.resource_kind,
    resource.resource_key,
    resource.declaration_order,
    resource.source_url,
    resource.content_encoding,
    resource.content_type,
    Boolean(resource.integrity),
  ]), [
    ['require', 'require-0', 0, 'https://cdn.example.com/dependency.js', 'utf8', 'application/javascript', true],
    ['resource', 'theme', 0, 'https://cdn.example.com/theme.css', 'binary', 'text/css', true],
  ])
  assert.strictEqual(Buffer.from(resources[0].content_blob ?? []).toString('utf8'), dependency)
  assert.strictEqual(fetchResource.mock.calls.length, 2)
})

test('resource verification failure leaves the existing script and managed files untouched', async () => {
  const existingId = createScript({
    name: 'Helper',
    namespace: '',
    identity_name: 'Helper',
    description: null,
    version: '1.0.0',
    match_urls_json: '[]',
    code: 'old source',
    file_path: null,
    site_ids_json: '[]',
    enabled: true,
  })
  const sourcePath = writeSource('failed-update.user.js', userscript(
    'Helper',
    '1.1.0',
    'https://example.com/*',
    undefined,
    [`// @require https://cdn.example.com/dependency.js#sha256=${'00'.repeat(32)}`],
  ))
  vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
  vi.spyOn(dialog, 'showMessageBox').mockResolvedValue({ response: 0, checkboxChecked: false })
  registerScriptsIpc({ fetchResource: async () => new Response('different') })

  await assert.rejects(() => ipcRenderer.invoke('scripts:importFile'), /integrity mismatch/)
  assert.strictEqual(getScriptById(existingId)?.version, '1.0.0')
  assert.strictEqual(getScriptById(existingId)?.code, 'old source')
  assert.deepStrictEqual(listUserScriptResources(existingId), [])
  assert.strictEqual(fs.existsSync(path.join(tempDirectory, 'userscripts')), false)
})

test('remote preview and confirmation install through the same atomic resource transaction', async () => {
  const sourceUrl = 'https://example.com/releases/helper.user.js?stable=1'
  const dependency = 'globalThis.__remoteDependency = true'
  const source = userscript('Remote Helper', '2.0.0', 'https://example.com/*', 'remote.namespace', [
    `// @updateURL ${sourceUrl}`,
    '// @downloadURL https://example.com/releases/helper.user.js',
    `// @require https://cdn.example.com/dependency.js#sha256=${createHash('sha256').update(dependency).digest('hex')}`,
  ])
  const registry = new PendingUserScriptInstallRegistry({ idFactory: () => 'remote-install' })
  const route = registry.register(sourceUrl)
  assert.ok(route)
  const fetch = vi.fn(async (url: string) => {
    if (url.includes('dependency.js')) return new Response(dependency)
    return new Response(source, { headers: { etag: '"remote-v2"', 'last-modified': 'Thu, 20 Aug 2026 12:00:00 GMT' } })
  })
  const installer = new UserScriptRemoteInstaller({ fetch })
  registerScriptsIpc({
    getUserScriptInstallRegistry: () => registry,
    getUserScriptRemoteInstaller: () => installer,
  })

  const preview = await ipcRenderer.invoke('scripts:getRemoteInstallPreview', route.request.installId) as UserScriptInstallPreview
  assert.strictEqual(preview.name, 'Remote Helper')
  assert.strictEqual(preview.version, '2.0.0')
  assert.strictEqual(preview.requires, 1)

  const result = await ipcRenderer.invoke(
    'scripts:confirmRemoteInstall',
    route.request.installId,
    'install',
  ) as UserScriptInstallInstallResult
  assert.strictEqual(result.status, 'installed')
  const installed = getScriptById(result.scriptId!)
  assert.strictEqual(installed?.last_install_url, sourceUrl)
  assert.strictEqual(installed?.update_url, sourceUrl)
  assert.strictEqual(listUserScriptResources(result.scriptId!).length, 1)
  const state = getUserScriptUpdateState(result.scriptId!)
  assert.strictEqual(state?.status, 'current')
  assert.strictEqual(state?.etag, '"remote-v2"')
  assert.strictEqual(registry.get(route.request.installId), null)
  assert.strictEqual(installer.consume(route.request.installId), null)
})

test('remote confirmation claims a legacy identity and rejects a concurrent replay', async () => {
  const legacyId = createScript({
    name: 'Legacy Display',
    namespace: null,
    identity_name: 'Remote Helper',
    description: null,
    version: '1.0.0',
    match_urls_json: '[]',
    code: 'legacy',
    file_path: null,
    site_ids_json: '["codeforces"]',
    enabled: false,
  })
  const registry = new PendingUserScriptInstallRegistry({ idFactory: () => 'legacy-remote-install' })
  const route = registry.register('https://example.com/remote.user.js')
  assert.ok(route)
  const installer = new UserScriptRemoteInstaller({
    fetch: async () => new Response(userscript('Remote Helper', '2.0.0')),
  })
  registerScriptsIpc({
    getUserScriptInstallRegistry: () => registry,
    getUserScriptRemoteInstaller: () => installer,
  })
  const preview = await ipcRenderer.invoke('scripts:getRemoteInstallPreview', route.request.installId) as UserScriptInstallPreview
  assert.strictEqual(preview.existingScriptId, legacyId)

  const results = await Promise.all([
    ipcRenderer.invoke('scripts:confirmRemoteInstall', route.request.installId, 'install'),
    ipcRenderer.invoke('scripts:confirmRemoteInstall', route.request.installId, 'install'),
  ]) as Array<UserScriptInstallInstallResult | null>
  assert.strictEqual(results.filter(result => result?.status === 'installed').length, 1)
  assert.strictEqual(results.filter(result => result === null).length, 1)
  assert.strictEqual(getAllScripts().length, 1)
  assert.strictEqual(getScriptById(legacyId)?.namespace, '')
  assert.strictEqual(getScriptById(legacyId)?.site_ids_json, '["codeforces"]')
  assert.strictEqual(getScriptById(legacyId)?.enabled, false)
})

test('remote confirmation invalidates a preview when the installed version changed', async () => {
  const scriptId = createScript({
    name: 'Remote Helper',
    namespace: '',
    identity_name: 'Remote Helper',
    description: null,
    version: '1.0.0',
    match_urls_json: '[]',
    code: 'old',
    file_path: null,
    site_ids_json: '[]',
    enabled: true,
  })
  const registry = new PendingUserScriptInstallRegistry({ idFactory: () => 'stale-remote-install' })
  const route = registry.register('https://example.com/stale.user.js')
  assert.ok(route)
  const installer = new UserScriptRemoteInstaller({
    fetch: async () => new Response(userscript('Remote Helper', '2.0.0')),
  })
  registerScriptsIpc({
    getUserScriptInstallRegistry: () => registry,
    getUserScriptRemoteInstaller: () => installer,
  })
  await ipcRenderer.invoke('scripts:getRemoteInstallPreview', route.request.installId)
  assert.strictEqual(getScriptById(scriptId)?.version, '1.0.0')
  updateScript(scriptId, { version: '1.5.0' })

  const result = await ipcRenderer.invoke(
    'scripts:confirmRemoteInstall',
    route.request.installId,
    'install',
  ) as UserScriptInstallInstallResult
  assert.strictEqual(result.status, 'stale')
  assert.strictEqual(getScriptById(scriptId)?.version, '1.5.0')
})

test('scripts:getAll returns a renderer-safe summary without source or absolute paths', async () => {
  createScript({
    name: 'Summary helper',
    namespace: 'https://example.com',
    identity_name: 'Summary helper',
    description: null,
    version: null,
    match_urls_json: '["https://example.com/*"]',
    code: 'window.secretSource = true',
    file_path: path.join(tempDirectory, 'userscripts', 'summary.user.js'),
    site_ids_json: '["codeforces"]',
    enabled: true,
  })
  registerScriptsIpc()

  const result = await ipcRenderer.invoke('scripts:getAll') as Array<Record<string, unknown>>
  assert.deepStrictEqual(result, [{
    id: result[0].id,
    name: 'Summary helper',
    enabled: true,
    site_ids_json: '["codeforces"]',
    has_file: true,
  }])
  assert.strictEqual(Object.hasOwn(result[0], 'code'), false)
  assert.strictEqual(Object.hasOwn(result[0], 'file_path'), false)
})

test('scripts code view and editor stay inside the managed directory, delete removes only managed files', async () => {
  const scriptsDirectory = path.join(tempDirectory, 'userscripts')
  fs.mkdirSync(scriptsDirectory, { recursive: true })
  const managedPath = path.join(scriptsDirectory, '00000000-0000-4000-8000-000000000003.js')
  const unmanagedPath = path.join(tempDirectory, 'outside.user.js')
  fs.writeFileSync(managedPath, 'console.log("managed")')
  fs.writeFileSync(unmanagedPath, 'console.log("outside")')
  const managedId = createScript({
    name: 'Managed',
    namespace: '',
    identity_name: 'Managed',
    description: null,
    version: null,
    match_urls_json: '[]',
    code: 'fallback',
    file_path: managedPath,
    site_ids_json: '[]',
    enabled: true,
  })
  const outsideId = createScript({
    name: 'Outside',
    namespace: '',
    identity_name: 'Outside',
    description: null,
    version: null,
    match_urls_json: '[]',
    code: 'outside',
    file_path: unmanagedPath,
    site_ids_json: '[]',
    enabled: true,
  })
  const openPath = vi.spyOn(shell, 'openPath').mockResolvedValue('')
  registerScriptsIpc()

  assert.deepStrictEqual(await ipcRenderer.invoke('scripts:getCode', managedId), {
    status: 'ok',
    scriptId: managedId,
    code: 'console.log("managed")',
  })
  // Each failure mode is distinguishable so the UI can explain it instead of
  // rendering one undifferentiated "unavailable".
  assert.deepStrictEqual(
    await ipcRenderer.invoke('scripts:getCode', outsideId),
    { status: 'unmanaged' },
  )
  assert.deepStrictEqual(
    await ipcRenderer.invoke('scripts:getCode', '00000000-0000-4000-8000-00000000dead'),
    { status: 'not-found' },
  )
  assert.deepStrictEqual(
    await ipcRenderer.invoke('scripts:openEditor', managedId),
    { status: 'ok' },
  )
  assert.strictEqual(openPath.mock.calls[0][0], managedPath)
  assert.deepStrictEqual(
    await ipcRenderer.invoke('scripts:openEditor', outsideId),
    { status: 'unmanaged' },
  )
  openPath.mockResolvedValueOnce('Windows cannot open this file')
  assert.deepStrictEqual(
    await ipcRenderer.invoke('scripts:openEditor', managedId),
    { status: 'open-failed' },
  )
  assert.strictEqual(await ipcRenderer.invoke('scripts:delete', managedId), true)
  assert.strictEqual(fs.existsSync(managedPath), false)
  assert.strictEqual(await ipcRenderer.invoke('scripts:delete', outsideId), true)
  assert.strictEqual(fs.existsSync(unmanagedPath), true)
})

test('deleting one of two rows sharing a managed file keeps the file for the survivor', async () => {
  const scriptsDirectory = path.join(tempDirectory, 'userscripts')
  fs.mkdirSync(scriptsDirectory, { recursive: true })
  const sharedPath = path.join(scriptsDirectory, 'shared--0123456789ab--ba9876543210.user.js')
  fs.writeFileSync(sharedPath, userscript('Shared', '1.0.0'))
  const base = {
    namespace: '',
    description: null,
    version: null,
    match_urls_json: '[]',
    code: 'shared',
    file_path: sharedPath,
    site_ids_json: '[]',
    enabled: true,
  }
  const firstId = createScript({ ...base, name: 'Shared A', identity_name: 'Shared A' })
  createScript({ ...base, name: 'Shared B', identity_name: 'Shared B' })
  registerScriptsIpc()

  assert.strictEqual(await ipcRenderer.invoke('scripts:delete', firstId), true)
  assert.strictEqual(
    fs.existsSync(sharedPath),
    true,
    'A managed file still referenced by another row must survive deletion',
  )
})

test('confirmed updates preserve user configuration and remove only the replaced managed file', async () => {
  const scriptsDirectory = path.join(tempDirectory, 'userscripts')
  fs.mkdirSync(scriptsDirectory, { recursive: true })
  const oldFilePath = path.join(scriptsDirectory, '00000000-0000-4000-8000-000000000001.js')
  fs.writeFileSync(oldFilePath, userscript('Helper', '1.0.0'))
  const existingId = createScript({
    name: 'My Display Name',
    namespace: '',
    identity_name: 'Helper',
    description: 'old',
    version: '1.0.0',
    match_urls_json: '["https://old.example/*"]',
    code: 'old',
    file_path: oldFilePath,
    site_ids_json: '["codeforces","atcoder"]',
    enabled: false,
    auto_update_enabled: false,
  })
  const sourcePath = writeSource(
    'update.user.js',
    userscript('Helper', '1.1.0', 'https://new.example/*', undefined, runtimeMetadataLines()),
  )
  vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
  const messageBox = vi.spyOn(dialog, 'showMessageBox').mockResolvedValue({ response: 0, checkboxChecked: false })
  registerScriptsIpc()

  const importedId = await ipcRenderer.invoke('scripts:importFile')
  const updated = getScriptById(existingId)

  assert.strictEqual(importedId, existingId)
  assert.strictEqual(getAllScripts().length, 1)
  assert.ok(updated)
  assert.strictEqual(updated.name, 'My Display Name')
  assert.strictEqual(updated.site_ids_json, '["codeforces","atcoder"]')
  assert.strictEqual(updated.enabled, false)
  assert.strictEqual(updated.auto_update_enabled, false)
  assert.strictEqual(updated.version, '1.1.0')
  assert.deepStrictEqual(JSON.parse(updated.match_urls_json), ['https://new.example/*'])
  assertRuntimeMetadata(updated)
  assert.strictEqual(fs.existsSync(oldFilePath), false)
  assert.strictEqual(fs.existsSync(sourcePath), true)

  const options = messageBox.mock.calls[0][0]
  assert.deepStrictEqual(options.buttons, ['更新现有脚本', '另存为本地副本', '取消'])
  assert.strictEqual(options.defaultId, 0)
  assert.strictEqual(options.cancelId, 2)
})

test('local-copy choice creates an isolated identity with auto-update disabled', async () => {
  createScript({
    name: 'Helper',
    namespace: 'example.namespace',
    identity_name: 'Helper',
    description: null,
    version: '1.0.0',
    match_urls_json: '[]',
    code: 'old',
    file_path: null,
    site_ids_json: '["codeforces"]',
    enabled: true,
  })
  const sourcePath = writeSource(
    'copy.user.js',
    userscript(
      'Helper',
      '1.0.0',
      'https://example.com/*',
      'example.namespace',
      runtimeMetadataLines(),
    ),
  )
  vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
  vi.spyOn(dialog, 'showMessageBox').mockResolvedValue({ response: 1, checkboxChecked: false })
  registerScriptsIpc()

  const copyId = await ipcRenderer.invoke('scripts:importFile') as string
  const scripts = getAllScripts()
  const copy = scripts.find(script => script.id === copyId)

  assert.strictEqual(scripts.length, 2)
  // namespace 在类型上可空（null 表示旧的 canonical 身份），本地副本必须是 local: 前缀的
  // 非空字符串；这里用 ?. 让 null 走到断言失败，而不是抛 TypeError。
  assert.ok(copy?.namespace?.startsWith('local:'))
  assert.strictEqual(copy?.auto_update_enabled, false)
  assert.ok(copy?.code.includes(`// @namespace   ${copy.namespace}`))
  assert.ok(copy)
  assertRuntimeMetadata(copy)
})

test('cancelled legacy claim does not mutate the database or create a managed file', async () => {
  const legacyId = createScript({
    name: 'Legacy Display',
    namespace: null,
    identity_name: 'Helper',
    description: null,
    version: '1.0.0',
    match_urls_json: '[]',
    code: 'legacy',
    file_path: null,
    site_ids_json: '[]',
    enabled: true,
  })
  const sourcePath = writeSource(
    'claim.user.js',
    userscript('Helper', '1.0.0'),
  )
  vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
  vi.spyOn(dialog, 'showMessageBox').mockResolvedValue({ response: 2, checkboxChecked: false })
  registerScriptsIpc()

  assert.strictEqual(await ipcRenderer.invoke('scripts:importFile'), null)
  assert.strictEqual(getScriptById(legacyId)?.namespace, null)
  assert.strictEqual(fs.existsSync(path.join(tempDirectory, 'userscripts')), false)
  assert.strictEqual(fs.existsSync(sourcePath), true)
})

test('a confirmed no-namespace import claims legacy NULL identity without deleting the selected source', async () => {
  const scriptsDirectory = path.join(tempDirectory, 'userscripts')
  fs.mkdirSync(scriptsDirectory, { recursive: true })
  const sourcePath = path.join(scriptsDirectory, '00000000-0000-4000-8000-000000000002.js')
  fs.writeFileSync(sourcePath, userscript(
    'Helper',
    '1.1.0',
    'https://example.com/*',
    undefined,
    runtimeMetadataLines(),
  ))
  const legacyId = createScript({
    name: 'Legacy Display',
    namespace: null,
    identity_name: 'Helper',
    description: null,
    version: '1.0.0',
    match_urls_json: '[]',
    code: 'legacy',
    file_path: sourcePath,
    site_ids_json: '["codeforces"]',
    enabled: false,
    auto_update_enabled: false,
  })
  vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
  vi.spyOn(dialog, 'showMessageBox').mockResolvedValue({ response: 0, checkboxChecked: false })
  registerScriptsIpc()

  assert.strictEqual(await ipcRenderer.invoke('scripts:importFile'), legacyId)
  const updated = getScriptById(legacyId)
  assert.strictEqual(getAllScripts().length, 1)
  assert.strictEqual(updated?.namespace, '')
  assert.strictEqual(updated?.name, 'Legacy Display')
  assert.strictEqual(updated?.site_ids_json, '["codeforces"]')
  assert.strictEqual(updated?.enabled, false)
  assert.strictEqual(updated?.auto_update_enabled, false)
  assert.ok(updated)
  assertRuntimeMetadata(updated)
  assert.strictEqual(fs.existsSync(sourcePath), true)
  assert.notStrictEqual(updated?.file_path, sourcePath)
})

test('version confirmation options keep destructive defaults on cancel', () => {
  const expected = {
    newer: ['更新现有脚本', 0],
    same: ['覆盖现有脚本', 0],
    older: ['仍然降级', 2],
    unknown: ['覆盖现有脚本', 2],
  } as const

  for (const [comparison, [primary, defaultId]] of Object.entries(expected)) {
    const options = getUserScriptImportConfirmationOptions(comparison as keyof typeof expected)
    assert.deepStrictEqual(options.buttons, [primary, '另存为本地副本', '取消'])
    assert.strictEqual(options.defaultId, defaultId)
    assert.strictEqual(options.cancelId, 2)
    assert.strictEqual(options.noLink, true)
  }
})

test('scripts:save accepts only display name and unique string site ids', async () => {
  const scriptId = createScript({
    name: 'Helper',
    namespace: '',
    identity_name: 'Helper',
    description: null,
    version: '1.0.0',
    match_urls_json: '[]',
    code: 'code',
    file_path: null,
    site_ids_json: '[]',
    enabled: true,
  })
  registerScriptsIpc()

  assert.strictEqual(await ipcRenderer.invoke('scripts:save', scriptId, {
    name: 'Custom Label',
    site_ids_json: '["codeforces","atcoder"]',
  }), scriptId)
  assert.strictEqual(getScriptById(scriptId)?.name, 'Custom Label')

  await assert.rejects(() => ipcRenderer.invoke('scripts:save', null, {
    name: 'Invalid',
    site_ids_json: '[]',
  }))
  await assert.rejects(() => ipcRenderer.invoke('scripts:save', scriptId, {
    name: 'Invalid',
    site_ids_json: '["codeforces","codeforces"]',
  }))
  await assert.rejects(() => ipcRenderer.invoke('scripts:save', scriptId, {
    name: 'Invalid',
    site_ids_json: '[]',
    code: 'blocked',
  }))
  assert.strictEqual(getScriptById(scriptId)?.code, 'code')

  /*
   * 纯空白的 id 与名字。
   *
   * 这两条守的是通道 schema 用 `pattern(/\S/)` 而不是 `text({min:1})` 的那个选择：
   * `'   '` 长度不为 0，`min:1` 会放它过去，于是变成一次查不到行的 UPDATE——静默无效，
   * 和"改成功了"在返回值上分不出来。原先的手写检查判的是 `trim().length === 0`，
   * 迁移后必须仍然拒绝。
   */
  await assert.rejects(
    () => ipcRenderer.invoke('scripts:save', '   ', { name: 'x', site_ids_json: '[]' }),
    /Rejected IPC sender \(payload\)/,
    '纯空白 id 应被拒绝',
  )
  await assert.rejects(
    () => ipcRenderer.invoke('scripts:save', scriptId, { name: '  ', site_ids_json: '[]' }),
    /Rejected IPC sender \(payload\)/,
    '纯空白脚本名应被拒绝',
  )
  assert.strictEqual(getScriptById(scriptId)?.name, 'Custom Label', '两次非法调用都不应改到库里')
})

test('scripts:toggle rejects malformed arguments before they reach the database', async () => {
  const scriptId = createScript({
    name: 'Helper',
    namespace: '',
    identity_name: 'Helper',
    description: null,
    version: '1.0.0',
    match_urls_json: '[]',
    code: 'code',
    file_path: null,
    site_ids_json: '[]',
    enabled: true,
  })
  registerScriptsIpc()

  /*
   * `scripts:toggle` 迁移前是本文件唯一一条完全裸奔的通道：只有类型标注
   * `(_event, id: string, enabled: boolean)`，没有任何运行时检查，renderer 给什么
   * `toggleScript` 就往 UPDATE 里绑什么。这里逐个钉住之前能穿过去的形状。
   */
  assert.strictEqual(await ipcRenderer.invoke('scripts:toggle', scriptId, false), true)
  assert.strictEqual(getScriptById(scriptId)?.enabled, false)

  for (const badEnabled of [1, 0, 'true', null, undefined]) {
    await assert.rejects(
      () => ipcRenderer.invoke('scripts:toggle', scriptId, badEnabled),
      /Rejected IPC sender \(payload\)/,
      `enabled 应拒绝 ${JSON.stringify(badEnabled) ?? 'undefined'}`,
    )
  }
  for (const badId of [42, '', '   ', null, {}]) {
    await assert.rejects(
      () => ipcRenderer.invoke('scripts:toggle', badId, true),
      /Rejected IPC sender \(payload\)/,
      `id 应拒绝 ${JSON.stringify(badId) ?? 'undefined'}`,
    )
  }
  assert.strictEqual(getScriptById(scriptId)?.enabled, false, '非法调用不应改动 enabled')
})

function writeSource(fileName: string, content: string): string {
  const filePath = path.join(tempDirectory, fileName)
  fs.writeFileSync(filePath, content)
  return filePath
}

function userscript(
  name: string,
  version: string,
  match = 'https://example.com/*',
  namespace?: string,
  extraMetadata: string[] = [],
): string {
  return [
    '// ==UserScript==',
    `// @name        ${name}`,
    ...(namespace ? [`// @namespace   ${namespace}`] : []),
    `// @version     ${version}`,
    `// @match       ${match}`,
    ...extraMetadata,
    '// ==/UserScript==',
    'console.log("helper")',
    '',
  ].join('\n')
}

function runtimeMetadataLines(): string[] {
  return [
    '// @include     https://include.example/*',
    '// @exclude     https://example.com/private/*',
    '// @exclude-match https://example.com/strict-private/*',
    '// @grant       GM_getValue',
    '// @grant       GM_setValue',
    '// @connect     api.example.com',
    '// @noframes',
    '// @run-at      document-start',
    '// @updateURL   https://example.com/helper.meta.js',
    '// @downloadURL https://example.com/helper.user.js',
    '// @antifeature tracking',
    '// @icon        https://example.com/icon.png',
  ]
}

function assertRuntimeMetadata(script: UserScript): void {
  assert.deepStrictEqual(JSON.parse(script.include_rules_json), ['https://include.example/*'])
  assert.deepStrictEqual(JSON.parse(script.exclude_rules_json), ['https://example.com/private/*'])
  assert.deepStrictEqual(JSON.parse(script.exclude_match_rules_json), ['https://example.com/strict-private/*'])
  assert.deepStrictEqual(JSON.parse(script.grant_json), ['GM_getValue', 'GM_setValue'])
  assert.deepStrictEqual(JSON.parse(script.connect_json), ['api.example.com'])
  assert.strictEqual(script.noframes, true)
  assert.strictEqual(script.run_at, 'document-start')
  assert.strictEqual(script.update_url, 'https://example.com/helper.meta.js')
  assert.strictEqual(script.download_url, 'https://example.com/helper.user.js')
  assert.deepStrictEqual(JSON.parse(script.antifeature_json), ['tracking'])
  assert.strictEqual(script.icon_url, 'https://example.com/icon.png')
}
