import * as fs from 'node:fs/promises'
import path from 'node:path'
import {
  createApplicationSessionSnapshot,
  parseApplicationSessionSnapshotJson,
  type ApplicationSessionSnapshot,
  type ApplicationSessionValidationReason,
} from './applicationSessionSnapshot'
import type { TabSessionSnapshotOptions } from '../browser/tabSessionSnapshot'

export interface ApplicationSessionFileHandle {
  writeFile(data: string): Promise<void>
  sync(): Promise<void>
  close(): Promise<void>
}

export interface ApplicationSessionFileSystem {
  mkdir(directoryPath: string): Promise<void>
  open(filePath: string): Promise<ApplicationSessionFileHandle>
  readFile(filePath: string): Promise<string>
  rename(sourcePath: string, destinationPath: string): Promise<void>
  rm(filePath: string): Promise<void>
}

export const nodeApplicationSessionFileSystem: ApplicationSessionFileSystem = {
  mkdir: async (directoryPath) => { await fs.mkdir(directoryPath, { recursive: true }) },
  open: async (filePath) => {
    const handle = await fs.open(filePath, 'wx')
    return {
      writeFile: async (data) => { await handle.writeFile(data, { encoding: 'utf8' }) },
      sync: async () => { await handle.sync() },
      close: async () => { await handle.close() },
    }
  },
  readFile: (filePath) => fs.readFile(filePath, 'utf8'),
  rename: (sourcePath, destinationPath) => fs.rename(sourcePath, destinationPath),
  rm: async (filePath) => { await fs.rm(filePath, { force: true }) },
}

export type ApplicationSessionLoadFallbackReason =
  | 'missing'
  | 'read-failed'
  | ApplicationSessionValidationReason

export type ApplicationSessionLoadResult =
  | { kind: 'restore'; snapshot: ApplicationSessionSnapshot }
  | { kind: 'fallback'; reason: ApplicationSessionLoadFallbackReason }

export interface ApplicationSessionStoreOptions extends TabSessionSnapshotOptions {
  fileSystem?: ApplicationSessionFileSystem
}

export interface ApplicationSessionPersistenceStore {
  save(snapshot: ApplicationSessionSnapshot): Promise<void>
}

export interface ApplicationSessionPersistenceTimer {
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

export type ApplicationSessionPersistenceFailureReason =
  | 'snapshot-provider-failed'
  | 'save-failed'

export interface ApplicationSessionPersistenceOptions {
  debounceMs?: number
  timer?: ApplicationSessionPersistenceTimer
  onDiagnostic?: (reason: ApplicationSessionPersistenceFailureReason) => void
}

export const DEFAULT_APPLICATION_SESSION_DEBOUNCE_MS = 250

const systemApplicationSessionPersistenceTimer: ApplicationSessionPersistenceTimer = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>)
  },
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT'
}

export class ApplicationSessionStore {
  private readonly fileSystem: ApplicationSessionFileSystem
  private readonly temporaryPath: string
  private readonly snapshotOptions: TabSessionSnapshotOptions
  private pendingWrite: ApplicationSessionSnapshot | null = null
  private writeLoop: Promise<void> | null = null

  constructor(
    private readonly filePath: string,
    options: ApplicationSessionStoreOptions = {},
  ) {
    this.fileSystem = options.fileSystem ?? nodeApplicationSessionFileSystem
    this.temporaryPath = `${filePath}.tmp`
    this.snapshotOptions = { allowInsecureLocalhost: options.allowInsecureLocalhost }
  }

  async load(): Promise<ApplicationSessionLoadResult> {
    await this.fileSystem.rm(this.temporaryPath).catch(() => {})
    let raw: string
    try {
      raw = await this.fileSystem.readFile(this.filePath)
    } catch (error) {
      return { kind: 'fallback', reason: isMissingFileError(error) ? 'missing' : 'read-failed' }
    }
    const parsed = parseApplicationSessionSnapshotJson(raw, this.snapshotOptions)
    return parsed.ok
      ? { kind: 'restore', snapshot: parsed.snapshot }
      : { kind: 'fallback', reason: parsed.reason }
  }

  save(snapshot: ApplicationSessionSnapshot): Promise<void> {
    this.pendingWrite = createApplicationSessionSnapshot(
      snapshot.windows,
      snapshot.mostRecentWindowId,
      this.snapshotOptions,
    )
    if (!this.writeLoop) {
      const writeLoop = this.drainWrites()
      this.writeLoop = writeLoop
      void writeLoop.finally(() => {
        if (this.writeLoop === writeLoop) this.writeLoop = null
      }).catch(() => {})
    }
    return this.writeLoop
  }

  private async drainWrites(): Promise<void> {
    try {
      while (this.pendingWrite) {
        const snapshot = this.pendingWrite
        this.pendingWrite = null
        await this.writeAtomic(snapshot)
      }
    } catch (error) {
      this.pendingWrite = null
      throw error
    }
  }

  private async writeAtomic(snapshot: ApplicationSessionSnapshot): Promise<void> {
    await this.fileSystem.mkdir(path.dirname(this.filePath))
    await this.fileSystem.rm(this.temporaryPath).catch(() => {})
    let handle: ApplicationSessionFileHandle | null = null
    try {
      handle = await this.fileSystem.open(this.temporaryPath)
      await handle.writeFile(`${JSON.stringify(snapshot)}\n`)
      await handle.sync()
      await handle.close()
      handle = null
      await this.fileSystem.rename(this.temporaryPath, this.filePath)
    } catch (error) {
      if (handle) await handle.close().catch(() => {})
      await this.fileSystem.rm(this.temporaryPath).catch(() => {})
      throw error
    }
  }
}

export class ApplicationSessionPersistence {
  private readonly debounceMs: number
  private readonly timer: ApplicationSessionPersistenceTimer
  private readonly onDiagnostic: ((reason: ApplicationSessionPersistenceFailureReason) => void) | undefined
  private timerHandle: { value: unknown } | null = null
  private pendingSnapshot: ApplicationSessionSnapshot | null = null
  private writeLoop: Promise<void> | null = null
  private disposePromise: Promise<void> | null = null
  private disposed = false

  constructor(
    private readonly store: ApplicationSessionPersistenceStore,
    private readonly getSnapshot: () => ApplicationSessionSnapshot,
    options: ApplicationSessionPersistenceOptions = {},
  ) {
    const requestedDebounceMs = options.debounceMs
    this.debounceMs = typeof requestedDebounceMs === 'number'
      && Number.isFinite(requestedDebounceMs)
      && requestedDebounceMs >= 0
      ? requestedDebounceMs
      : DEFAULT_APPLICATION_SESSION_DEBOUNCE_MS
    this.timer = options.timer ?? systemApplicationSessionPersistenceTimer
    this.onDiagnostic = options.onDiagnostic
  }

  schedule(): void {
    if (this.disposed) return
    this.clearScheduledWrite()

    const timerHandle = { value: undefined as unknown }
    timerHandle.value = this.timer.setTimeout(() => {
      if (this.timerHandle !== timerHandle) return
      this.timerHandle = null
      this.queueLatestSnapshot()
    }, this.debounceMs)
    this.timerHandle = timerHandle
  }

  flush(): Promise<void> {
    if (this.disposePromise) return this.disposePromise
    this.clearScheduledWrite()
    return this.flushLatestSnapshot()
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise
    this.disposed = true
    this.clearScheduledWrite()
    this.disposePromise = this.flushLatestSnapshot()
    return this.disposePromise
  }

  private clearScheduledWrite(): void {
    if (!this.timerHandle) return
    this.timer.clearTimeout(this.timerHandle.value)
    this.timerHandle = null
  }

  private async flushLatestSnapshot(): Promise<void> {
    this.queueLatestSnapshot()
    while (this.writeLoop) await this.writeLoop
  }

  private queueLatestSnapshot(): void {
    try {
      this.pendingSnapshot = this.getSnapshot()
    } catch {
      this.reportFailure('snapshot-provider-failed')
      return
    }

    if (this.writeLoop) return
    const writeLoop = this.drainWrites()
    this.writeLoop = writeLoop
    void writeLoop.finally(() => {
      if (this.writeLoop === writeLoop) this.writeLoop = null
    }).catch(() => {})
  }

  private async drainWrites(): Promise<void> {
    while (this.pendingSnapshot) {
      const snapshot = this.pendingSnapshot
      this.pendingSnapshot = null
      try {
        await this.store.save(snapshot)
      } catch {
        this.reportFailure('save-failed')
      }
    }
  }

  private reportFailure(reason: ApplicationSessionPersistenceFailureReason): void {
    try {
      this.onDiagnostic?.(reason)
    } catch {
      // Diagnostics must never prevent a later persistence attempt.
    }
  }
}
