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
  ipcMain.emit(CHANNEL, eventFor(sender), { meta: {} })
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
  ipcMain.emit(CHANNEL, eventFor(sender), { meta: {} })
  assert.deepStrictEqual(detections, [{ meta: { pageTitle: 'Owned page title' } }])

  await sender.loadURL('https://leetcode.cn/problems/three-sum/')
  ipcMain.emit(CHANNEL, eventFor(sender), { meta: {} })
  assert.strictEqual(detections.length, 1, 'A page owner from the previous navigation must fail closed')

  tabManager.emit({ ...pageEvent, url: sender.getURL() })
  service.detachTabManager(tabManager.manager)
  ipcMain.emit(CHANNEL, eventFor(sender), { meta: {} })
  assert.strictEqual(detections.length, 1, 'A detached window must not retain submission page ownership')
  assert.ok(warnings.some(([message]) => message === 'realtime-submission.sender-page-unresolved'))

  service.dispose()
})
