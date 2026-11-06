import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { app, dialog, ipcRenderer } from 'electron'
import { z } from 'zod'
// invokeHandler 是替身专有的名字（类型层只有替身模块有），从 electronMock 直接导入；
// 'electron' 的运行时别名在 vitest 下指向同一个模块实例。
import { ipcMain as mockIpcMain, resetElectronMock } from '../electron/electronMock'
import { closeDb, initDbAtPath } from '../../electron/db/connection'
import { createOutputSchema } from '../../src/shared/types/common'
import { registerSitesIpc } from '../../electron/ipc/registerSitesIpc'
import { registerBackupIpc } from '../../electron/ipc/registerBackupIpc'
import { registerRatingIpc } from '../../electron/ipc/registerRatingIpc'
import { registerCoachIpc } from '../../electron/ipc/registerCoachIpc'
import type { CoachOrchestrator } from '../../electron/coach/CoachOrchestrator'
import type { LearningDataImportPreview } from '@shared/types/backup'

const ownerState = vi.hoisted(() => ({ id: 'shell-1' as string | null }))

/*
 * 统一输出形状（R4）的 IPC 边界契约。
 *
 * 断言分两层：
 * 1. `assertEnvelope`——每个 handler 的实际返回都要能被 `createOutputSchema`
 *    织出的判别联合原样解析（success 字面量、error 字符串、code 六元闭集）。
 *    这是"渲染层拿到的每一条失败都有 code 可循"的机器保证；
 * 2. deepStrictEqual——逐 channel 钉住成功载荷收进 `data`、失败文案是固定 copy。
 *    凡是 catch 里直接透传 `errorMessage(error)` 的旧写法，都会被
 *    "抛出的哨兵文本不得出现在载荷里"这条断言抓出来。
 *
 * `electron-env.d.ts` 里的七个结果类型是本形状的手写镜像（全局脚本 d.ts 不能
 * import schema），两边漂移时这里先红。
 */

vi.mock('../../electron/ipc/trustedSender', async () => {
  const { createTrustedSenderDouble } = await import('./trustedSenderDouble')
  const double = createTrustedSenderDouble()
  return {
    ipcMain: double,
    coachPetIpcMain: double,
    onFromOj: (channel: string, listener: (...args: unknown[]) => void) =>
      double.on(channel, listener),
    getShellWindowOwner: () => (ownerState.id ? { id: ownerState.id } : null),
  }
})

/** 站点仓库替换成可编程替身：形状契约不依赖真实站点表。 */
const siteRepo = vi.hoisted(() => ({
  getAllSites: vi.fn(),
  getSiteById: vi.fn(),
  createSite: vi.fn(),
  toggleSite: vi.fn(),
  deleteSite: vi.fn(),
  exportSitesConfig: vi.fn(),
  previewImportSites: vi.fn(),
  confirmImportSites: vi.fn(),
}))
vi.mock('../../electron/db/repositories/siteRepository', () => siteRepo)

/** Codeforces 拉取是外网依赖，替身化；成功/失败两个分支都由测试投喂。 */
const cf = vi.hoisted(() => ({
  fetchCFCurrentRating: vi.fn(),
  fetchCFRatingHistory: vi.fn(),
  formatCFRatingHistory: vi.fn(),
}))
vi.mock('../../electron/rating/codeforces', () => cf)

const envelopeSchema = createOutputSchema(z.unknown())

function assertEnvelope(value: unknown): void {
  const parsed = envelopeSchema.safeParse(value)
  assert.equal(parsed.success, true, `输出不符合统一 IPC 形状: ${JSON.stringify(value)}`)
}

/** 失败分支必须携带 ERROR_CODES 闭集里的 code（取消对话框一类的分支除外）。 */
function assertFailure(value: unknown, expected: { error: string; code?: string }): void {
  assertEnvelope(value)
  assert.deepEqual(value, {
    success: false,
    error: expected.error,
    ...(expected.code ? { code: expected.code } : {}),
  })
}

/** 替身的 invokeHandler 返回 unknown：断言前先按联合形状收窄（assertEnvelope 已实测）。 */
function envelopeOf<T>(
  value: unknown,
): { success: true; data: T } | { success: false; error: string; code?: string } {
  return value as { success: true; data: T } | { success: false; error: string; code?: string }
}

function fakeCoachOrchestrator(hintService: {
  getDecryptedApiKey: () => string
  testConnection: (config: unknown) => Promise<unknown>
}): CoachOrchestrator {
  return {
    getLlmHintService: () => hintService,
  } as unknown as CoachOrchestrator
}

let tempDirectory = ''

beforeEach(() => {
  resetElectronMock()
  ownerState.id = 'shell-1'
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ipc-output-shapes-'))
  initDbAtPath(path.join(tempDirectory, 'test.sqlite'))
  vi.spyOn(app, 'getPath').mockReturnValue(tempDirectory)

  siteRepo.getAllSites.mockReset()
  siteRepo.getSiteById.mockReset()
  siteRepo.createSite.mockReset()
  siteRepo.toggleSite.mockReset()
  siteRepo.deleteSite.mockReset()
  siteRepo.exportSitesConfig.mockReset()
  siteRepo.previewImportSites.mockReset()
  siteRepo.confirmImportSites.mockReset()
  cf.fetchCFCurrentRating.mockReset()
  cf.fetchCFRatingHistory.mockReset()
  cf.formatCFRatingHistory.mockReset()

  registerSitesIpc()
  registerBackupIpc()
  registerRatingIpc()
  registerCoachIpc({ getCoachPetWindow: () => null, getCoachOrchestrator: () => null })
})

afterEach(() => {
  closeDb()
  vi.restoreAllMocks()
  fs.rmSync(tempDirectory, { recursive: true, force: true })
})

test('createOutputSchema 本体：成功/失败分支、code 可省、未知 code 拒绝', () => {
  const schema = createOutputSchema(z.object({ path: z.string() }))
  assert.deepEqual(schema.parse({ success: true, data: { path: 'x' } }), {
    success: true,
    data: { path: 'x' },
  })
  assert.deepEqual(schema.parse({ success: false, error: 'e', code: 'IO' }), {
    success: false,
    error: 'e',
    code: 'IO',
  })
  assert.deepEqual(schema.parse({ success: false, error: 'e' }), { success: false, error: 'e' })
  assert.equal(schema.safeParse({ success: false, error: 'e', code: 'NOT_A_CODE' }).success, false)
  assert.equal(schema.safeParse({ success: true }).success, false)
  assert.equal(schema.safeParse({ success: true, data: { path: 1 } }).success, false)
})

test('sites:exportConfig 成功把 path/count 收进 data，取消不带 code', async () => {
  siteRepo.exportSitesConfig.mockReturnValue({
    version: 1,
    exportedAt: '2026-11-01 10:00:00',
    sites: [{ id: 'a' }],
  })
  vi.spyOn(dialog, 'showSaveDialog').mockResolvedValue({
    canceled: false,
    filePath: path.join(tempDirectory, 'sites.json'),
  })

  const result = await ipcRenderer.invoke('sites:exportConfig')
  assertEnvelope(result)
  assert.deepEqual(result, {
    success: true,
    data: { path: path.join(tempDirectory, 'sites.json'), count: 1 },
  })

  // 真实 Electron 取消时 filePath 是空串，handler 按 `canceled || !filePath` 判断。
  vi.spyOn(dialog, 'showSaveDialog').mockResolvedValue({ canceled: true, filePath: '' })
  const canceled = await ipcRenderer.invoke('sites:exportConfig')
  assertFailure(canceled, { error: '取消导出' })
})

test('sites:exportConfig 失败给固定文案与 IO，不透传原始异常', async () => {
  siteRepo.exportSitesConfig.mockImplementation(() => {
    throw new Error('SECRET-INTERNAL-DETAIL')
  })
  vi.spyOn(dialog, 'showSaveDialog').mockResolvedValue({
    canceled: false,
    filePath: path.join(tempDirectory, 'sites.json'),
  })

  const result = await ipcRenderer.invoke('sites:exportConfig')
  assertFailure(result, { error: '导出站点配置失败', code: 'IO' })
  assert.equal(JSON.stringify(result).includes('SECRET-INTERNAL-DETAIL'), false)
})

test('sites:importConfig 成功、文件结构不合法（VALIDATION）、解析失败（IO）', async () => {
  const filePath = path.join(tempDirectory, 'import.json')

  siteRepo.previewImportSites.mockReturnValue({
    valid: true,
    preview: { newSites: [], conflicts: [], builtinSkipped: [] },
  })
  fs.writeFileSync(filePath, '{"version":1,"sites":[]}')
  vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({
    canceled: false,
    filePaths: [filePath],
  })
  const ok = await ipcRenderer.invoke('sites:importConfig')
  assertEnvelope(ok)
  assert.deepEqual(ok, {
    success: true,
    data: { preview: { newSites: [], conflicts: [], builtinSkipped: [] } },
  })

  siteRepo.previewImportSites.mockReturnValue({ valid: false, error: '无效的配置数据' })
  const invalid = await ipcRenderer.invoke('sites:importConfig')
  assertFailure(invalid, { error: '无效的配置数据', code: 'VALIDATION' })

  fs.writeFileSync(filePath, 'not json')
  siteRepo.previewImportSites.mockReset()
  const unparseable = await ipcRenderer.invoke('sites:importConfig')
  assertFailure(unparseable, { error: '读取导入文件失败', code: 'IO' })
  assert.equal(JSON.stringify(unparseable).toLowerCase().includes('json'), false)
})

test('sites:confirmImport 成功载荷进 data；仓库抛错给固定文案不透传', async () => {
  siteRepo.confirmImportSites.mockReturnValue({ imported: 2, overwritten: 1 })
  const ok = await ipcRenderer.invoke('sites:confirmImport', { sites: [], overwriteIds: [] })
  assertEnvelope(ok)
  assert.deepEqual(ok, { success: true, data: { imported: 2, overwritten: 1 } })

  siteRepo.confirmImportSites.mockImplementation(() => {
    throw new Error('SECRET-DB-LOCK')
  })
  const failed = await ipcRenderer.invoke('sites:confirmImport', { sites: [], overwriteIds: [] })
  assertFailure(failed, { error: '导入站点配置失败', code: 'IO' })
  assert.equal(JSON.stringify(failed).includes('SECRET-DB-LOCK'), false)
})

test('rating:syncCodeforces 成功载荷进 data；拉取失败归 EXTERNAL 不透传', async () => {
  cf.fetchCFCurrentRating.mockResolvedValue({ rating: 1500 })
  cf.fetchCFRatingHistory.mockResolvedValue([])
  cf.formatCFRatingHistory.mockReturnValue([])

  const ok = await ipcRenderer.invoke('rating:syncCodeforces', 'someone')
  assertEnvelope(ok)
  assert.deepEqual(ok, { success: true, data: { historyCount: 0, inserted: 0, peak: null } })

  cf.fetchCFCurrentRating.mockRejectedValue(new Error('SECRET-NETWORK-DETAIL'))
  const failed = await ipcRenderer.invoke('rating:syncCodeforces', 'someone')
  assertFailure(failed, { error: '同步 Codeforces 数据失败', code: 'EXTERNAL' })
  assert.equal(JSON.stringify(failed).includes('SECRET-NETWORK-DETAIL'), false)
})

test('backup:createDatabaseBackup 成功进 data；取消无 code；备份失败归 IO', async () => {
  vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({
    canceled: false,
    filePaths: [tempDirectory],
  })
  const ok = await ipcRenderer.invoke('backup:createDatabaseBackup')
  assertEnvelope(ok)
  assert.equal(ok.success, true)
  if (ok.success !== true) return
  assert.ok(fs.existsSync(ok.data.path))
  assert.ok(fs.statSync(ok.data.path).size > 0)

  vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({
    canceled: true,
    filePaths: [],
  })
  assertFailure(await ipcRenderer.invoke('backup:createDatabaseBackup'), { error: '取消备份' })

  // mkdir 无法在"已存在的文件"下建目录，制造一个真实 IO 失败。
  const blockingFile = path.join(tempDirectory, 'blocking')
  fs.writeFileSync(blockingFile, 'not a dir')
  vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({
    canceled: false,
    filePaths: [blockingFile],
  })
  const failed = await ipcRenderer.invoke('backup:createDatabaseBackup')
  assertFailure(failed, { error: '创建数据库备份失败', code: 'IO' })
})

test('backup:exportLearningData 成功带 counts；目录不可写归 IO 不透传', async () => {
  vi.spyOn(dialog, 'showSaveDialog').mockResolvedValue({
    canceled: false,
    filePath: path.join(tempDirectory, 'learning-data.json'),
  })
  const ok = await ipcRenderer.invoke('backup:exportLearningData')
  assertEnvelope(ok)
  assert.equal(ok.success, true)
  if (ok.success !== true) return
  assert.ok(fs.existsSync(ok.data.path))
  assert.ok(typeof ok.data.counts === 'object')

  vi.spyOn(dialog, 'showSaveDialog').mockResolvedValue({
    canceled: false,
    filePath: path.join(tempDirectory, 'missing-dir', 'out.json'),
  })
  const failed = await ipcRenderer.invoke('backup:exportLearningData')
  assertFailure(failed, { error: '导出学习数据失败', code: 'IO' })
})

test('backup:previewLearningDataImport 无主窗口 FORBIDDEN、取消、校验失败、成功', async () => {
  vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({
    canceled: false,
    filePaths: [path.join(tempDirectory, 'data.json')],
  })

  ownerState.id = null
  assertFailure(await ipcRenderer.invoke('backup:previewLearningDataImport'), {
    error: '无法确定导入窗口，导入已取消',
    code: 'FORBIDDEN',
  })
  ownerState.id = 'shell-1'

  vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({
    canceled: true,
    filePaths: [],
  })
  assertFailure(await ipcRenderer.invoke('backup:previewLearningDataImport'), {
    error: '取消导入',
  })

  const filePath = path.join(tempDirectory, 'data.json')
  vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({
    canceled: false,
    filePaths: [filePath],
  })
  fs.writeFileSync(filePath, 'not json')
  const invalid = await ipcRenderer.invoke('backup:previewLearningDataImport')
  assertEnvelope(invalid)
  assert.equal(invalid.success, false)
  if (invalid.success !== false) return
  assert.equal(invalid.code, 'VALIDATION')
  // error 是对用户自己那份文件的结构诊断（preview.error 原文），非空即可。
  assert.ok(invalid.error.length > 0)

  // 真实导出一份再预览：成功分支的 preview 是领域对象本体。成功路径会挂
  // `event.sender.once('destroyed', …)`，electronMock 的 `ipcRenderer.invoke`
  // 给的空事件没有 sender，这里用替身提供的 invokeHandler 传一个显式事件。
  fs.writeFileSync(filePath, JSON.stringify(await exportFixture()))
  const ok = envelopeOf<{ preview: LearningDataImportPreview }>(
    await mockIpcMain.invokeHandler('backup:previewLearningDataImport', {
      sender: { once: vi.fn() },
    }),
  )
  assertEnvelope(ok)
  assert.equal(ok.success, true)
  if (ok.success !== true) return
  assert.equal(ok.data.preview.valid, true)
})

test('backup:confirmLearningDataImport 无待确认归 NOT_FOUND；确认成功计数进 data', async () => {
  // pendingImports 按 ownerId 存在模块级 Map 里、跨测试存活；换一个 owner 才能测到
  // "没有待确认数据"的分支（上一个测试的 preview 会留下 shell-1 的待确认数据）。
  ownerState.id = 'shell-confirm'
  assertFailure(await ipcRenderer.invoke('backup:confirmLearningDataImport', false), {
    error: '没有待确认的导入数据，请先选择要导入的文件',
    code: 'NOT_FOUND',
  })

  const filePath = path.join(tempDirectory, 'data.json')
  fs.writeFileSync(filePath, JSON.stringify(await exportFixture()))
  vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({
    canceled: false,
    filePaths: [filePath],
  })
  const preview = envelopeOf<{ preview: LearningDataImportPreview }>(
    await mockIpcMain.invokeHandler('backup:previewLearningDataImport', {
      sender: { once: vi.fn() },
    }),
  )
  assert.equal(preview.success, true)

  const ok = await ipcRenderer.invoke('backup:confirmLearningDataImport', false)
  assertEnvelope(ok)
  assert.equal(ok.success, true)
  if (ok.success !== true) return
  // 空库导出（零行）导入后三张计数包都是全 0、无冲突；逐包断言而不是深比较
  // 整个对象：仓库的 emptyCounts 按表名生成键，键集是仓库内部决定的事。
  assert.deepEqual(ok.data.conflicts, [])
  for (const counts of [ok.data.inserted, ok.data.updated, ok.data.skipped]) {
    assert.ok(
      Object.values(counts).every((count) => count === 0),
      `计数包应为全 0: ${JSON.stringify(counts)}`,
    )
  }
})

test('coach:testLlmConnection 三个失败分支与成功分支都走统一联合', async () => {
  // 未注册 Orchestrator（beforeEach 里注入的是 () => null）。
  assertFailure(
    await ipcRenderer.invoke('coach:testLlmConnection', {
      api_key: '',
      base_url: 'https://ark.example.com',
      model: 'm',
    }),
    { error: 'Coach 未初始化', code: 'EXTERNAL' },
  )

  const notConfigured = fakeCoachOrchestrator({
    getDecryptedApiKey: () => '',
    testConnection: async () => {
      throw new Error('should not be called')
    },
  })
  registerCoachIpc({
    getCoachPetWindow: () => null,
    getCoachOrchestrator: () => notConfigured,
  })
  assertFailure(
    await ipcRenderer.invoke('coach:testLlmConnection', {
      api_key: '',
      base_url: 'https://ark.example.com',
      model: 'm',
    }),
    { error: '未配置 API Key', code: 'VALIDATION' },
  )

  const connected = fakeCoachOrchestrator({
    getDecryptedApiKey: () => 'stored-key',
    testConnection: async () => ({
      success: true,
      message: '连接成功，模型回复: ok',
      latency_ms: 5,
      model: 'm',
    }),
  })
  registerCoachIpc({
    getCoachPetWindow: () => null,
    getCoachOrchestrator: () => connected,
  })
  const ok = await ipcRenderer.invoke('coach:testLlmConnection', {
    api_key: '',
    base_url: 'https://ark.example.com',
    model: 'm',
  })
  assertEnvelope(ok)
  assert.deepEqual(ok, {
    success: true,
    data: { message: '连接成功，模型回复: ok', latency_ms: 5, model: 'm' },
  })

  const unreachable = fakeCoachOrchestrator({
    getDecryptedApiKey: () => 'stored-key',
    testConnection: async () => ({ success: false, message: '连接失败: timeout' }),
  })
  registerCoachIpc({
    getCoachPetWindow: () => null,
    getCoachOrchestrator: () => unreachable,
  })
  assertFailure(
    await ipcRenderer.invoke('coach:testLlmConnection', {
      api_key: '',
      base_url: 'https://ark.example.com',
      model: 'm',
    }),
    { error: '连接失败: timeout', code: 'EXTERNAL' },
  )
})

/** 真实跑一次学习数据导出，给 preview/confirm 两个 channel 喂合法文件。 */
async function exportFixture(): Promise<Record<string, unknown>> {
  const { exportLearningData } = await import('../../electron/backup/learningDataExport')
  return exportLearningData() as unknown as Record<string, unknown>
}
