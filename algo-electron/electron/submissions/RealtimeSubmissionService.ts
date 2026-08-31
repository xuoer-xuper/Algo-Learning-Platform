import { ipcMain, type IpcMainEvent } from 'electron'
import { randomBytes } from 'node:crypto'
import type { BrowserPageEvent, TabManager } from '../browser/TabManager'
import { getRealtimeAdapterForUrl, getRealtimeAdapterIds } from '../adapters/registry'
import { getSiteById } from '../db/repositories/siteRepository'
import { RealtimeSubmissionDiagnostics, type RealtimeSubmissionStatus } from './RealtimeSubmissionDiagnostics'
import { RealtimeHookInjector } from './RealtimeHookInjector'
import { SubmissionWatcher, SUBMISSION_WATCHER_DETECTED_EVENT } from './SubmissionWatcher'
import type { SubmissionNotification } from './SubmissionWatcherCore'
import { handleFromOj, handleFromShell, onFromOj, type IpcListener } from '../ipc/trustedSender'
import { OJ_SUBMISSION_TOKEN_CHANNEL as DOCUMENT_TOKEN_CHANNEL } from '../browser/ojBridge'
import { appLogger, type Logger } from '../shared/logger'

const SUBMISSION_DETECTED_CHANNEL = 'oj-submission:detected'
const STATUS_CHANNEL = 'realtimeSubmission:getStatus'
const DOCUMENT_TOKEN_PATTERN = /^[a-f0-9]{32}$/

export class RealtimeSubmissionService {
  private readonly watcher: SubmissionWatcher
  private readonly diagnostics = new RealtimeSubmissionDiagnostics()
  private readonly hookInjector: RealtimeHookInjector
  private readonly ipcHandler: (event: IpcMainEvent, payload: unknown) => void
  /**
   * 存的是 `onFromOj` 返回的守卫包装器，不是 `ipcHandler` 本身——注销时必须传同一个函数
   * 引用给 `ipcMain.off`。类型直接引用 `IpcListener`，`any` 收敛到那一个定义处。
   */
  private registeredIpcHandler: IpcListener<IpcMainEvent> | null = null
  private readonly tabManagerCleanups = new Map<TabManager, () => void>()
  private readonly pageHosts = new Map<number, {
    tabManager: TabManager
    event: BrowserPageEvent
  }>()
  /**
   * One token per OJ webContents, minted lazily when its preload asks. It is
   * deliberately not rotated per navigation: the sender-URL check already
   * rejects stale documents, and rotation would reintroduce a window where the
   * preload holds a token main has already replaced.
   */
  private readonly documentTokens = new Map<number, string>()
  private isIpcRegistered = false

  constructor(notifyProblemsUpdated: () => void, logger: Logger = appLogger) {
    this.watcher = new SubmissionWatcher(notifyProblemsUpdated, logger)
    this.hookInjector = new RealtimeHookInjector({
      getRealtimeAdapterForUrl,
      getSiteById,
      diagnostics: this.diagnostics,
      logWarn: (message, ...args) => logger.warn(message, ...args),
    })
    this.diagnostics.setSupportedAdapterIds(getRealtimeAdapterIds())
    this.ipcHandler = (event, payload) => {
      const senderUrl = event.sender.getURL()
      const pageHost = this.pageHosts.get(event.sender.id)
      if (!pageHost || pageHost.event.url !== senderUrl) {
        logger.warn('realtime-submission.sender-page-unresolved', {
          webContentsId: event.sender.id,
          senderUrl,
        })
        return
      }
      const envelope = parseSubmissionEnvelope(payload)
      if (!envelope || envelope.token !== this.documentTokens.get(event.sender.id)) {
        logger.warn('realtime-submission.sender-document-token-mismatch', {
          webContentsId: event.sender.id,
          senderUrl,
        })
        return
      }
      const enrichedPayload = this.withPageTitle(envelope.payload, pageHost, event.sender.getTitle())
      const result = this.watcher.handleDetected(enrichedPayload, { senderUrl })
      this.diagnostics.recordDetection(senderUrl, result)
    }
  }

  attachTabManager(tabManager: TabManager): () => void {
    const existing = this.tabManagerCleanups.get(tabManager)
    if (existing) return existing

    const removePageListener = tabManager.addPageEventListener((event) => {
      if (event.reason === 'destroyed') {
        this.pageHosts.delete(event.webContentsId)
        this.documentTokens.delete(event.webContentsId)
        return
      }
      if (event.isMainFrame) this.pageHosts.set(event.webContentsId, { tabManager, event })
      if (
        event.reason === 'did-navigate'
        || event.reason === 'did-navigate-in-page'
        || event.reason === 'dom-ready'
        || event.reason === 'did-frame-finish-load'
        || event.reason === 'did-finish-load'
        || event.reason === 'active-tab-changed'
      ) {
        this.injectHook(tabManager, event)
      }
    })
    const cleanup = (): void => {
      removePageListener()
      this.tabManagerCleanups.delete(tabManager)
      for (const [webContentsId, host] of this.pageHosts) {
        if (host.tabManager === tabManager) this.pageHosts.delete(webContentsId)
      }
    }
    this.tabManagerCleanups.set(tabManager, cleanup)
    return cleanup
  }

  detachTabManager(tabManager: TabManager): void {
    this.tabManagerCleanups.get(tabManager)?.()
  }

  /**
   * 订阅提交检测结果（阶段 2：CoachEventBridge 入口）。
   * 与 renderer 的题目列表更新通知互不影响。
   * 返回 unsubscribe 函数，便于清理。
   */
  onSubmissionDetected(callback: (notification: SubmissionNotification) => void): () => void {
    this.watcher.on(SUBMISSION_WATCHER_DETECTED_EVENT, callback)
    return () => {
      this.watcher.off(SUBMISSION_WATCHER_DETECTED_EVENT, callback)
    }
  }

  registerIpc(): void {
    if (this.isIpcRegistered) return
    this.registeredIpcHandler = onFromOj(SUBMISSION_DETECTED_CHANNEL, this.ipcHandler)
    handleFromOj(DOCUMENT_TOKEN_CHANNEL, event => this.issueDocumentToken(event.sender.id))
    handleFromShell(STATUS_CHANNEL, () => this.getStatus())
    this.isIpcRegistered = true
    this.diagnostics.setIpcRegistered(true)
  }

  dispose(): void {
    for (const cleanup of [...this.tabManagerCleanups.values()]) cleanup()
    this.pageHosts.clear()
    this.documentTokens.clear()
    if (this.isIpcRegistered && this.registeredIpcHandler) {
      ipcMain.off(SUBMISSION_DETECTED_CHANNEL, this.registeredIpcHandler)
      this.registeredIpcHandler = null
    }
    if (this.isIpcRegistered) {
      ipcMain.removeHandler(STATUS_CHANNEL)
      ipcMain.removeHandler(DOCUMENT_TOKEN_CHANNEL)
    }
    this.isIpcRegistered = false
    this.diagnostics.setIpcRegistered(false)
  }

  private issueDocumentToken(webContentsId: number): string {
    const existing = this.documentTokens.get(webContentsId)
    if (existing) return existing
    const token = randomBytes(16).toString('hex')
    this.documentTokens.set(webContentsId, token)
    return token
  }

  getStatus(): RealtimeSubmissionStatus {
    return this.diagnostics.getStatus()
  }

  private injectHook(tabManager: TabManager, event: BrowserPageEvent): void {
    this.hookInjector.inject(tabManager, event)
  }

  private withPageTitle(
    payload: unknown,
    pageHost: { tabManager: TabManager; event: BrowserPageEvent },
    senderTitle?: string,
  ): unknown {
    if (!payload || typeof payload !== 'object') return payload

    const record = payload as Record<string, unknown>
    const meta = record.meta && typeof record.meta === 'object'
      ? { ...(record.meta as Record<string, unknown>) }
      : {}
    const existingTitle = typeof meta.pageTitle === 'string' ? meta.pageTitle : ''
    const pageTitle = existingTitle.trim()
      ? existingTitle
      : pageHost.tabManager.getTitleForPage(pageHost.event) ?? senderTitle

    if (!pageTitle?.trim()) return payload

    return {
      ...record,
      meta: {
        ...meta,
        pageTitle,
      },
    }
  }
}

function parseSubmissionEnvelope(value: unknown): { token: string; payload: unknown } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).length !== 2
    || typeof record.token !== 'string'
    || !DOCUMENT_TOKEN_PATTERN.test(record.token)
    || !Object.prototype.hasOwnProperty.call(record, 'payload')
  ) return null
  return { token: record.token, payload: record.payload }
}
