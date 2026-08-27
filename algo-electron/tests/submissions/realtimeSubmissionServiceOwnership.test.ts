import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'vitest'
import { ipcMain, MockWebContents, resetElectronMock } from 'electron'
import type { BrowserPageEvent, TabManager } from '../../electron/browser/TabManager.ts'
import { registerOjWebContents, resetTrustedSenderRegistry } from '../../electron/ipc/trustedSender.ts'
import type { Logger } from '../../electron/shared/logger.ts'
import { RealtimeSubmissionService } from '../../electron/submissions/RealtimeSubmissionService.ts'

const CHANNEL = 'oj-submission:detected'

function createLogger(warnings: unknown[][]): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: (...args) => { warnings.push(args) },
    error: () => undefined,
    fatal: () => undefined,
    getLogFilePath: () => null,
  }
}

function createTabManager() {
  let listener: ((event: BrowserPageEvent) => void) | null = null
  const manager = {
    addPageEventListener(callback: (event: BrowserPageEvent) => void) {
      listener = callback
      return () => { listener = null }
    },
    getTitleForPage: () => 'Owned page title',
    executeScriptAcrossFramesForPage: async () => undefined,
  } as unknown as TabManager
  return {
    manager,
    emit(event: BrowserPageEvent) {
      listener?.(event)
    },
  }
}

function eventFor(sender: MockWebContents) {
  return { sender, senderFrame: sender.mainFrame } as never
}

beforeEach(() => {
  resetElectronMock()
  resetTrustedSenderRegistry()
})

afterEach(() => {
  resetTrustedSenderRegistry()
})

async function pullDocumentToken(sender: MockWebContents): Promise<string> {
  const token = await ipcMain.invokeHandler(
    'oj-submission:getDocumentToken',
    eventFor(sender),
  )
  return token as string
}

test('realtime submission IPC requires a current exact page owner', async () => {
  const warnings: unknown[][] = []
  const service = new RealtimeSubmissionService(() => undefined, createLogger(warnings))
  const detections: unknown[] = []
  const watcher = (service as unknown as {
    watcher: { handleDetected(payload: unknown): { inserted: boolean } }
  }).watcher
  watcher.handleDetected = (payload) => {
    detections.push(payload)
    return { inserted: true }
  }
  service.registerIpc()

  const sender = new MockWebContents()
  await sender.loadURL('https://leetcode.cn/problems/two-sum/')
  registerOjWebContents(sender)
  ipcMain.emit(CHANNEL, eventFor(sender), { token: 'a'.repeat(32), payload: { meta: {} } })
  assert.strictEqual(detections.length, 0, 'A registered OJ sender without a page owner must fail closed')

  const tabManager = createTabManager()
  service.attachTabManager(tabManager.manager)
  const pageEvent: BrowserPageEvent = {
    windowId: 'window-1',
    tabId: 'tab-1',
    webContentsId: sender.id,
    url: sender.getURL(),
    isMainFrame: true,
    reason: 'page-title-updated',
  }
  tabManager.emit(pageEvent)
  const documentToken = await pullDocumentToken(sender)
  ipcMain.emit(CHANNEL, eventFor(sender), { token: documentToken, payload: { meta: {} } })
  assert.deepStrictEqual(detections, [{ meta: { pageTitle: 'Owned page title' } }])

  await sender.loadURL('https://leetcode.cn/problems/three-sum/')
  ipcMain.emit(CHANNEL, eventFor(sender), { token: documentToken, payload: { meta: {} } })
  assert.strictEqual(detections.length, 1, 'A page owner from the previous navigation must fail closed')

  tabManager.emit({ ...pageEvent, url: sender.getURL() })
  service.detachTabManager(tabManager.manager)
  ipcMain.emit(CHANNEL, eventFor(sender), { token: documentToken, payload: { meta: {} } })
  assert.strictEqual(detections.length, 1, 'A detached window must not retain submission page ownership')
  assert.ok(warnings.some(([message]) => message === 'realtime-submission.sender-page-unresolved'))

  service.dispose()
})

test('the document token is pull-based, stable per webContents and dropped on destroy', async () => {
  const warnings: unknown[][] = []
  const service = new RealtimeSubmissionService(() => undefined, createLogger(warnings))
  const detections: unknown[] = []
  const watcher = (service as unknown as {
    watcher: { handleDetected(payload: unknown): { inserted: boolean } }
  }).watcher
  watcher.handleDetected = (payload) => {
    detections.push(payload)
    return { inserted: true }
  }
  service.registerIpc()

  // Hook injection reads site config from SQLite; this test only covers token
  // lifetime, so the injector is stubbed to keep it database-free.
  ;(service as unknown as { hookInjector: { inject(): void } }).hookInjector = { inject: () => undefined }

  const sender = new MockWebContents()
  await sender.loadURL('https://codeforces.com/problemset/problem/1/A')
  registerOjWebContents(sender)
  const tabManager = createTabManager()
  service.attachTabManager(tabManager.manager)
  const pageEvent: BrowserPageEvent = {
    windowId: 'window-1',
    tabId: 'tab-1',
    webContentsId: sender.id,
    url: sender.getURL(),
    isMainFrame: true,
    reason: 'did-navigate',
  }
  tabManager.emit(pageEvent)

  // A preload that asks late still gets a usable token; a push could not.
  const first = await pullDocumentToken(sender)
  assert.match(first, /^[a-f0-9]{32}$/)
  assert.strictEqual(await pullDocumentToken(sender), first, 'Repeated pulls must be idempotent')

  // Same-document SPA navigation must not invalidate the token the live
  // preload already holds.
  tabManager.emit({ ...pageEvent, reason: 'did-navigate-in-page' })
  ipcMain.emit(CHANNEL, eventFor(sender), { token: first, payload: { meta: {} } })
  assert.strictEqual(detections.length, 1, 'An in-page navigation must not orphan the held token')

  ipcMain.emit(CHANNEL, eventFor(sender), { token: 'b'.repeat(32), payload: { meta: {} } })
  assert.strictEqual(detections.length, 1, 'A forged token must fail closed')
  assert.ok(warnings.some(([message]) => message === 'realtime-submission.sender-document-token-mismatch'))

  tabManager.emit({ ...pageEvent, reason: 'destroyed' })
  const afterDestroy = await pullDocumentToken(sender)
  assert.notStrictEqual(afterDestroy, first, 'A destroyed webContents must not keep its old token')

  service.dispose()
})
