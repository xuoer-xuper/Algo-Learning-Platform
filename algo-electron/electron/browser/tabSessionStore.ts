import * as fs from 'node:fs/promises'
import path from 'node:path'
import type { TabSessionSnapshot } from './tabManagerTypes'
import {
  createTabSessionSnapshot,
  parseTabSessionSnapshotJson,
  type TabSessionSnapshotOptions,
  type TabSessionValidationReason,
} from './tabSessionSnapshot'

export interface TabSessionFileHandle {
  writeFile(data: string): Promise<void>
  sync(): Promise<void>
  close(): Promise<void>
}

export interface TabSessionFileSystem {
  mkdir(directoryPath: string): Promise<void>
  open(filePath: string): Promise<TabSessionFileHandle>
  readFile(filePath: string): Promise<string>
  rename(sourcePath: string, destinationPath: string): Promise<void>
  rm(filePath: string): Promise<void>
}

export const nodeTabSessionFileSystem: TabSessionFileSystem = {
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

export type TabSessionLoadFallbackReason =
  | 'missing'
  | 'read-failed'
  | TabSessionValidationReason

export type TabSessionLoadResult =
  | { kind: 'restore'; snapshot: TabSessionSnapshot }
  | { kind: 'fallback'; reason: TabSessionLoadFallbackReason }

export interface TabSessionStoreOptions extends TabSessionSnapshotOptions {
  fileSystem?: TabSessionFileSystem
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT'
}

export class TabSessionStore {
  private readonly fileSystem: TabSessionFileSystem
  private readonly temporaryPath: string
  private readonly snapshotOptions: TabSessionSnapshotOptions
  private pendingWrite: TabSessionSnapshot | null = null
  private writeLoop: Promise<void> | null = null

  constructor(
    private readonly filePath: string,
    options: TabSessionStoreOptions = {},
  ) {
    this.fileSystem = options.fileSystem ?? nodeTabSessionFileSystem
    this.temporaryPath = `${filePath}.tmp`
    this.snapshotOptions = { allowInsecureLocalhost: options.allowInsecureLocalhost }
  }

  async load(): Promise<TabSessionLoadResult> {
    await this.fileSystem.rm(this.temporaryPath).catch(() => {})
    let raw: string
    try {
      raw = await this.fileSystem.readFile(this.filePath)
    } catch (error) {
      return { kind: 'fallback', reason: isMissingFileError(error) ? 'missing' : 'read-failed' }
    }
    const parsed = parseTabSessionSnapshotJson(raw, this.snapshotOptions)
    return parsed.ok
      ? { kind: 'restore', snapshot: parsed.snapshot }
      : { kind: 'fallback', reason: parsed.reason }
  }

  save(snapshot: TabSessionSnapshot): Promise<void> {
    this.pendingWrite = createTabSessionSnapshot(snapshot.tabs, snapshot.activeTabId, this.snapshotOptions)
    if (!this.writeLoop) {
      this.writeLoop = this.drainWrites().finally(() => {
        this.writeLoop = null
      })
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

  private async writeAtomic(snapshot: TabSessionSnapshot): Promise<void> {
    await this.fileSystem.mkdir(path.dirname(this.filePath))
    await this.fileSystem.rm(this.temporaryPath).catch(() => {})
    let handle: TabSessionFileHandle | null = null
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
