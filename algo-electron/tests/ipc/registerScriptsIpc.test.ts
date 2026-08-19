import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test, vi } from 'vitest'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  ipcRenderer,
  resetElectronMock,
} from 'electron'
import { closeDb, initDbAtPath } from '../../electron/db/connection'
import {
  createScript,
  getAllScripts,
  getScriptById,
  type UserScript,
} from '../../electron/db/repositories/userScriptRepository'
import {
  getUserScriptImportConfirmationOptions,
  registerScriptsIpc,
} from '../../electron/ipc/registerScriptsIpc'

vi.mock('../../electron/ipc/trustedSender', () => ({
  getShellWindowOwner: () => null,
  ipcMain,
}))

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

test('scripts:getAll returns a renderer-safe summary without source or absolute paths', async () => {
  createScript({
    name: 'Summary helper',
    namespace: 'https://example.com',
    identity_name: 'Summary helper',
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
  const messageBox = vi.spyOn(dialog, 'showMessageBox').mockResolvedValue({ response: 0 })
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
  vi.spyOn(dialog, 'showMessageBox').mockResolvedValue({ response: 1 })
  registerScriptsIpc()

  const copyId = await ipcRenderer.invoke('scripts:importFile') as string
  const scripts = getAllScripts()
  const copy = scripts.find(script => script.id === copyId)

  assert.strictEqual(scripts.length, 2)
  assert.ok(copy?.namespace.startsWith('local:'))
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
  vi.spyOn(dialog, 'showMessageBox').mockResolvedValue({ response: 2 })
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
  vi.spyOn(dialog, 'showMessageBox').mockResolvedValue({ response: 0 })
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
