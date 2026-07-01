import { ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron'
import type { TabManager } from '../browser/TabManager'
import { getRealtimeAdapterForUrl, getRealtimeAdapterIds } from '../adapters/registry'
import { getSiteById } from '../db/repositories/siteRepository'
import { RealtimeSubmissionDiagnostics, type RealtimeSubmissionStatus } from './RealtimeSubmissionDiagnostics'
import { RealtimeHookInjector } from './RealtimeHookInjector'
import { SubmissionWatcher } from './SubmissionWatcher'

const SUBMISSION_DETECTED_CHANNEL = 'oj-submission:detected'
const STATUS_CHANNEL = 'realtimeSubmission:getStatus'

export class RealtimeSubmissionService {
  private readonly watcher: SubmissionWatcher
  private readonly diagnostics = new RealtimeSubmissionDiagnostics()
  private readonly hookInjector: RealtimeHookInjector
  private readonly ipcHandler: (event: IpcMainEvent, payload: unknown) => void
  private tabManager: TabManager | null = null
  private isIpcRegistered = false

  constructor(getWindow: () => BrowserWindow | null) {
    this.watcher = new SubmissionWatcher(getWindow)
    this.hookInjector = new RealtimeHookInjector({
      getRealtimeAdapterForUrl,
      getSiteById,
      diagnostics: this.diagnostics,
      logWarn: (message, ...args) => console.warn(message, ...args),
    })
    this.diagnostics.setSupportedAdapterIds(getRealtimeAdapterIds())
    this.ipcHandler = (event, payload) => {
      const senderUrl = event.sender.getURL()
      const senderTitle = event.sender.getTitle()
      const enrichedPayload = this.withPageTitle(payload, senderUrl, senderTitle)
      const result = this.watcher.handleDetected(enrichedPayload, { senderUrl })
      this.diagnostics.recordDetection(senderUrl, result)
    }
  }

  attachTabManager(tabManager: TabManager): void {
    this.tabManager = tabManager
    tabManager.addDomReadyListener((url) => {
      this.injectHook(tabManager, url)
    })
    tabManager.addNavigateListener((url) => {
      this.injectHook(tabManager, url)
    })
    tabManager.addActiveTabChangeListener((url) => {
      this.injectHook(tabManager, url)
    })
  }

  registerIpc(): void {
    if (this.isIpcRegistered) return
    ipcMain.on(SUBMISSION_DETECTED_CHANNEL, this.ipcHandler)
    ipcMain.handle(STATUS_CHANNEL, () => this.getStatus())
    this.isIpcRegistered = true
    this.diagnostics.setIpcRegistered(true)
  }

  dispose(): void {
    if (!this.isIpcRegistered) return
    ipcMain.off(SUBMISSION_DETECTED_CHANNEL, this.ipcHandler)
    ipcMain.removeHandler(STATUS_CHANNEL)
    this.isIpcRegistered = false
    this.diagnostics.setIpcRegistered(false)
  }

  getStatus(): RealtimeSubmissionStatus {
    return this.diagnostics.getStatus()
  }

  private injectHook(tabManager: TabManager, url: string): void {
    this.hookInjector.inject(tabManager, url)
  }

  private withPageTitle(payload: unknown, senderUrl: string, senderTitle?: string): unknown {
    if (!payload || typeof payload !== 'object') return payload

    const record = payload as Record<string, unknown>
    const meta = record.meta && typeof record.meta === 'object'
      ? { ...(record.meta as Record<string, unknown>) }
      : {}
    const existingTitle = typeof meta.pageTitle === 'string' ? meta.pageTitle : ''
    const pageTitle = existingTitle.trim()
      ? existingTitle
      : this.tabManager?.getTitleForUrl(senderUrl) ?? senderTitle

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
