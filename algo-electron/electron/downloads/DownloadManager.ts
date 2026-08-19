import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  DownloadPathAllocator,
  sanitizeDownloadFilename,
  type DownloadPathFileSystem,
} from './downloadPath'

export type NativeDownloadState = 'completed' | 'cancelled' | 'interrupted'
export type ManagedDownloadErrorCode = 'path-setup-failed' | 'intercept-failed'

export interface ManagedDownloadResult {
  downloadId: string
  fileName: string
  savePath: string | null
  state: NativeDownloadState
  receivedBytes: number
  totalBytes: number
  finishedAt: string
  errorCode?: ManagedDownloadErrorCode
}

export interface DownloadWillStartEvent {
  preventDefault(): void
}

export interface ManagedDownloadItem {
  getFilename(): string
  getURL?(): string
  setSavePath(filePath: string): void
  once(event: 'done', listener: (event: unknown, state: NativeDownloadState) => void): unknown
  getReceivedBytes?(): number
  getTotalBytes?(): number
}

export type WillDownloadListener = (
  event: DownloadWillStartEvent,
  item: ManagedDownloadItem,
  webContents?: unknown,
) => void

export interface DownloadSessionLike {
  on(event: 'will-download', listener: WillDownloadListener): unknown
  removeListener(event: 'will-download', listener: WillDownloadListener): unknown
}

export interface DownloadManagerOptions {
  downloadDirectory: string
  fileSystem?: DownloadPathFileSystem
  clock?: () => number
  idFactory?: () => string
  interceptDownload?: (
    download: { sourceUrl: string; fileName: string },
    webContents?: unknown,
  ) => boolean
  captureResultContext?: (webContents?: unknown) => unknown
}

export type DownloadResultListener = (result: ManagedDownloadResult, webContents?: unknown) => void

function safeByteCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0
}

function normalizeDownloadState(value: NativeDownloadState): NativeDownloadState {
  return value === 'completed' || value === 'cancelled' ? value : 'interrupted'
}

export class DownloadManager {
  private readonly pathAllocator: DownloadPathAllocator
  private readonly clock: () => number
  private readonly idFactory: () => string
  private readonly interceptDownload: DownloadManagerOptions['interceptDownload']
  private readonly captureResultContext: DownloadManagerOptions['captureResultContext']
  private readonly resultListeners = new Set<DownloadResultListener>()
  private readonly sessionListeners = new Map<DownloadSessionLike, WillDownloadListener>()
  private destroyed = false

  constructor(options: DownloadManagerOptions) {
    this.pathAllocator = new DownloadPathAllocator(options.downloadDirectory, options.fileSystem)
    this.clock = options.clock ?? Date.now
    this.idFactory = options.idFactory ?? randomUUID
    this.interceptDownload = options.interceptDownload
    this.captureResultContext = options.captureResultContext
  }

  attachSession(session: DownloadSessionLike): () => void {
    if (this.destroyed) throw new Error('DownloadManager has been destroyed')
    const existingListener = this.sessionListeners.get(session)
    if (existingListener) return () => this.detachSession(session)

    const listener: WillDownloadListener = (event, item, webContents) => {
      this.handleWillDownload(event, item, webContents)
    }
    this.sessionListeners.set(session, listener)
    session.on('will-download', listener)
    return () => this.detachSession(session)
  }

  addResultListener(listener: DownloadResultListener): () => void {
    if (this.destroyed) return () => undefined
    this.resultListeners.add(listener)
    return () => this.resultListeners.delete(listener)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const [session, listener] of this.sessionListeners) {
      session.removeListener('will-download', listener)
    }
    this.sessionListeners.clear()
    this.resultListeners.clear()
  }

  private detachSession(session: DownloadSessionLike): void {
    const listener = this.sessionListeners.get(session)
    if (!listener) return
    session.removeListener('will-download', listener)
    this.sessionListeners.delete(session)
  }

  private handleWillDownload(
    event: DownloadWillStartEvent,
    item: ManagedDownloadItem,
    webContents?: unknown,
  ): void {
    const resultContext = this.captureResultContext
      ? this.captureResultContext(webContents)
      : webContents
    let fileName = sanitizeDownloadFilename(item.getFilename())
    let savePath: string | null = null

    const sourceUrl = item.getURL?.() ?? ''
    if (sourceUrl && this.interceptDownload) {
      try {
        if (this.interceptDownload({ sourceUrl, fileName }, webContents)) {
          event.preventDefault()
          return
        }
      } catch {
        event.preventDefault()
        this.emitResult({
          downloadId: this.idFactory(),
          fileName,
          savePath: null,
          state: 'interrupted',
          receivedBytes: 0,
          totalBytes: 0,
          finishedAt: new Date(this.clock()).toISOString(),
          errorCode: 'intercept-failed',
        }, resultContext)
        return
      }
    }
    const downloadId = this.idFactory()

    try {
      savePath = this.pathAllocator.reserve(fileName)
      fileName = path.basename(savePath)
      item.setSavePath(savePath)
    } catch {
      if (savePath) this.pathAllocator.release(savePath)
      event.preventDefault()
      this.emitResult({
        downloadId,
        fileName,
        savePath: null,
        state: 'interrupted',
        receivedBytes: 0,
        totalBytes: 0,
        finishedAt: new Date(this.clock()).toISOString(),
        errorCode: 'path-setup-failed',
      }, resultContext)
      return
    }

    const completedSavePath = savePath
    item.once('done', (_doneEvent, state) => {
      this.pathAllocator.release(completedSavePath)
      this.emitResult({
        downloadId,
        fileName,
        savePath: completedSavePath,
        state: normalizeDownloadState(state),
        receivedBytes: safeByteCount(item.getReceivedBytes?.()),
        totalBytes: safeByteCount(item.getTotalBytes?.()),
        finishedAt: new Date(this.clock()).toISOString(),
      }, resultContext)
    })
  }

  private emitResult(result: ManagedDownloadResult, webContents?: unknown): void {
    if (this.destroyed) return
    for (const listener of this.resultListeners) {
      try {
        if (webContents === undefined) listener({ ...result })
        else listener({ ...result }, webContents)
      } catch {
        // One observer must not break download finalization or other observers.
      }
    }
  }
}
