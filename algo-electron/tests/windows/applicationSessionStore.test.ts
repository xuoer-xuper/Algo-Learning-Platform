import { describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { TabSnapshot } from '../../electron/browser/tabManagerTypes'
import {
  ApplicationSessionPersistence,
  ApplicationSessionStore,
  DEFAULT_APPLICATION_SESSION_DEBOUNCE_MS,
  type ApplicationSessionFileHandle,
  type ApplicationSessionFileSystem,
  type ApplicationSessionPersistenceFailureReason,
  type ApplicationSessionPersistenceTimer,
} from '../../electron/windows/applicationSessionStore'
import type { ApplicationSessionSnapshot } from '../../electron/windows/applicationSessionSnapshot'

type FailureStage = 'write' | 'sync' | 'close' | 'rename'

interface Deferred {
  promise: Promise<void>
  resolve(): void
}

function deferred(): Deferred {
  let resolve = (): void => {}
  const promise = new Promise<void>((promiseResolve) => { resolve = promiseResolve })
  return { promise, resolve }
}

function fileError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

class MemoryApplicationSessionFileSystem implements ApplicationSessionFileSystem {
  readonly files = new Map<string, string>()
  readonly operations: string[] = []
  readonly renamedPayloads: string[] = []
  failOnceAt: FailureStage | null = null
  readError: unknown = null
  syncGate: Deferred | null = null
  syncStarted: Deferred | null = null

  async mkdir(): Promise<void> {}

  async open(filePath: string): Promise<ApplicationSessionFileHandle> {
    if (this.files.has(filePath)) throw fileError('EEXIST', 'temporary file already exists')
    this.files.set(filePath, '')
    let closed = false
    return {
      writeFile: async (data) => {
        this.operations.push('write')
        this.throwOnce('write')
        if (closed) throw fileError('EBADF', 'closed')
        this.files.set(filePath, data)
      },
      sync: async () => {
        this.operations.push('sync')
        this.syncStarted?.resolve()
        if (this.syncGate) await this.syncGate.promise
        this.throwOnce('sync')
        if (closed) throw fileError('EBADF', 'closed')
      },
      close: async () => {
        this.operations.push('close')
        this.throwOnce('close')
        closed = true
      },
    }
  }

  async readFile(filePath: string): Promise<string> {
    if (this.readError) throw this.readError
    const content = this.files.get(filePath)
    if (content === undefined) throw fileError('ENOENT', 'missing')
    return content
  }

  async rename(sourcePath: string, destinationPath: string): Promise<void> {
    this.operations.push('rename')
    this.throwOnce('rename')
    const content = this.files.get(sourcePath)
    if (content === undefined) throw fileError('ENOENT', 'missing source')
    this.files.set(destinationPath, content)
    this.files.delete(sourcePath)
    this.renamedPayloads.push(content)
  }

  async rm(filePath: string): Promise<void> {
    this.files.delete(filePath)
  }

  private throwOnce(stage: FailureStage): void {
    if (this.failOnceAt !== stage) return
    this.failOnceAt = null
    throw fileError('EIO', `${stage} failed`)
  }
}

class ManualTimer implements ApplicationSessionPersistenceTimer {
  readonly delays: number[] = []
  readonly cleared: unknown[] = []
  private readonly callbacks = new Map<number, () => void>()
  private nextHandle = 1

  get pendingCount(): number {
    return this.callbacks.size
  }

  setTimeout(callback: () => void, delayMs: number): number {
    const handle = this.nextHandle
    this.nextHandle += 1
    this.delays.push(delayMs)
    this.callbacks.set(handle, callback)
    return handle
  }

  clearTimeout(handle: unknown): void {
    this.cleared.push(handle)
    this.callbacks.delete(handle as number)
  }

  runAll(): void {
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    for (const callback of callbacks) callback()
  }
}

const sessionPath = 'C:\\profile\\application-session.json'
const temporaryPath = `${sessionPath}.tmp`

function webTab(id: string): TabSnapshot {
  return { id, kind: 'web', url: `https://example.com/${id}`, title: id }
}

function appSession(id: string): ApplicationSessionSnapshot {
  return {
    version: 1,
    mostRecentWindowId: `window-${id}`,
    windows: [{
      id: `window-${id}`,
      bounds: { x: 100, y: 80, width: 1280, height: 800 },
      maximized: false,
      activeTabId: `tab-${id}`,
      tabs: [webTab(`tab-${id}`)],
    }],
  }
}

function serialize(snapshot: ApplicationSessionSnapshot): string {
  return `${JSON.stringify(snapshot)}\n`
}

describe('ApplicationSessionStore.load', () => {
  it('removes a stale temporary file and restores only a valid target snapshot', async () => {
    const fileSystem = new MemoryApplicationSessionFileSystem()
    const restored = appSession('restored')
    fileSystem.files.set(temporaryPath, serialize(appSession('stale')))
    fileSystem.files.set(sessionPath, serialize(restored))

    await expect(new ApplicationSessionStore(sessionPath, { fileSystem }).load()).resolves.toEqual({
      kind: 'restore',
      snapshot: restored,
    })
    expect(fileSystem.files.has(temporaryPath)).toBe(false)
  })

  it('returns fixed missing, read, and validation fallback reasons', async () => {
    const missing = new MemoryApplicationSessionFileSystem()
    await expect(new ApplicationSessionStore(sessionPath, { fileSystem: missing }).load()).resolves.toEqual({
      kind: 'fallback',
      reason: 'missing',
    })

    const unreadable = new MemoryApplicationSessionFileSystem()
    unreadable.readError = fileError('EACCES', 'private path')
    await expect(new ApplicationSessionStore(sessionPath, { fileSystem: unreadable }).load()).resolves.toEqual({
      kind: 'fallback',
      reason: 'read-failed',
    })

    const invalid = new MemoryApplicationSessionFileSystem()
    invalid.files.set(sessionPath, '{not-json')
    await expect(new ApplicationSessionStore(sessionPath, { fileSystem: invalid }).load()).resolves.toEqual({
      kind: 'fallback',
      reason: 'invalid-json',
    })
  })
})

describe('ApplicationSessionStore.save', () => {
  it('replaces an existing snapshot on the real filesystem', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'algo-application-session-'))
    const filePath = path.join(directory, 'application-session.json')
    try {
      const store = new ApplicationSessionStore(filePath)
      await store.save(appSession('first'))
      await store.save(appSession('replacement'))

      expect(await fs.readFile(filePath, 'utf8')).toBe(serialize(appSession('replacement')))
      await expect(fs.stat(`${filePath}.tmp`)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it('writes, fsyncs, closes, then renames while coalescing rapid writes to the newest snapshot', async () => {
    const fileSystem = new MemoryApplicationSessionFileSystem()
    fileSystem.syncGate = deferred()
    fileSystem.syncStarted = deferred()
    const store = new ApplicationSessionStore(sessionPath, { fileSystem })

    const firstSave = store.save(appSession('first'))
    await fileSystem.syncStarted.promise
    const middleSave = store.save(appSession('middle'))
    const newestSave = store.save(appSession('newest'))

    expect(middleSave).toBe(firstSave)
    expect(newestSave).toBe(firstSave)
    fileSystem.syncGate.resolve()
    await firstSave

    expect(fileSystem.renamedPayloads).toEqual([
      serialize(appSession('first')),
      serialize(appSession('newest')),
    ])
    expect(fileSystem.operations).toEqual([
      'write', 'sync', 'close', 'rename',
      'write', 'sync', 'close', 'rename',
    ])
    expect(fileSystem.files.get(sessionPath)).toBe(serialize(appSession('newest')))
    expect(fileSystem.files.has(temporaryPath)).toBe(false)
  })

  it.each<FailureStage>(['write', 'sync', 'close', 'rename'])(
    'keeps the old target and removes the temporary file when %s fails',
    async (stage) => {
      const fileSystem = new MemoryApplicationSessionFileSystem()
      fileSystem.files.set(sessionPath, serialize(appSession('old')))
      fileSystem.failOnceAt = stage
      const store = new ApplicationSessionStore(sessionPath, { fileSystem })

      await expect(store.save(appSession('replacement'))).rejects.toThrow(`${stage} failed`)
      expect(fileSystem.files.get(sessionPath)).toBe(serialize(appSession('old')))
      expect(fileSystem.files.has(temporaryPath)).toBe(false)

      await expect(store.save(appSession('recovered'))).resolves.toBeUndefined()
      expect(fileSystem.files.get(sessionPath)).toBe(serialize(appSession('recovered')))
    },
  )
})

describe('ApplicationSessionPersistence', () => {
  it('debounces changes and captures only the latest full application snapshot', async () => {
    const timer = new ManualTimer()
    const saved: ApplicationSessionSnapshot[] = []
    let current = appSession('first')
    const persistence = new ApplicationSessionPersistence(
      { save: async (snapshot) => { saved.push(snapshot) } },
      () => current,
      { timer },
    )

    persistence.schedule()
    current = appSession('middle')
    persistence.schedule()
    current = appSession('newest')
    persistence.schedule()

    expect(timer.delays).toEqual([
      DEFAULT_APPLICATION_SESSION_DEBOUNCE_MS,
      DEFAULT_APPLICATION_SESSION_DEBOUNCE_MS,
      DEFAULT_APPLICATION_SESSION_DEBOUNCE_MS,
    ])
    expect(timer.pendingCount).toBe(1)
    timer.runAll()
    await persistence.flush()
    expect(saved.at(-1)).toEqual(appSession('newest'))
  })

  it('flushes on idempotent disposal and ignores later schedules', async () => {
    const timer = new ManualTimer()
    const saved: ApplicationSessionSnapshot[] = []
    let current = appSession('scheduled')
    const persistence = new ApplicationSessionPersistence(
      { save: async (snapshot) => { saved.push(snapshot) } },
      () => current,
      { timer },
    )

    persistence.schedule()
    current = appSession('final')
    const firstDispose = persistence.dispose()
    expect(persistence.dispose()).toBe(firstDispose)
    await firstDispose
    expect(saved).toEqual([appSession('final')])

    persistence.schedule()
    expect(timer.pendingCount).toBe(0)
  })

  it('reports fixed failure reasons without leaking provider or storage errors, then recovers', async () => {
    const diagnostics: ApplicationSessionPersistenceFailureReason[] = []
    const saved: ApplicationSessionSnapshot[] = []
    let providerFails = true
    let saveFails = true
    const persistence = new ApplicationSessionPersistence(
      {
        save: async (snapshot) => {
          if (saveFails) {
            saveFails = false
            throw new Error('https://example.com/?token=secret')
          }
          saved.push(snapshot)
        },
      },
      () => {
        if (providerFails) throw new Error('private window state')
        return appSession('recovered')
      },
      { onDiagnostic: (reason) => { diagnostics.push(reason) } },
    )

    await expect(persistence.flush()).resolves.toBeUndefined()
    providerFails = false
    await expect(persistence.flush()).resolves.toBeUndefined()
    await expect(persistence.flush()).resolves.toBeUndefined()

    expect(diagnostics).toEqual(['snapshot-provider-failed', 'save-failed'])
    expect(JSON.stringify(diagnostics)).not.toContain('secret')
    expect(saved).toEqual([appSession('recovered')])
  })
})
