import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TAB_SESSION_DEBOUNCE_MS,
  TabSessionPersistence,
  TabSessionStore,
  type TabSessionFileHandle,
  type TabSessionFileSystem,
  type TabSessionPersistenceFailureReason,
  type TabSessionPersistenceTimer,
} from '../../electron/browser/tabSessionStore'
import type { TabSessionSnapshot } from '../../electron/browser/tabManagerTypes'

type FailureStage = 'write' | 'sync' | 'close' | 'rename'

interface Deferred {
  promise: Promise<void>
  resolve(): void
}

function deferred(): Deferred {
  let resolve = (): void => {}
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function fileError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

class MemoryTabSessionFileSystem implements TabSessionFileSystem {
  readonly files = new Map<string, string>()
  readonly removedPaths: string[] = []
  readonly renamedPayloads: string[] = []
  writeCount = 0
  syncCount = 0
  closeCount = 0
  failOnceAt: FailureStage | null = null
  readError: unknown = null
  syncGate: Deferred | null = null
  syncStarted: Deferred | null = null

  async mkdir(): Promise<void> {}

  async open(filePath: string): Promise<TabSessionFileHandle> {
    if (this.files.has(filePath)) throw fileError('EEXIST', 'temporary file already exists')
    this.files.set(filePath, '')
    let closed = false

    return {
      writeFile: async (data) => {
        this.writeCount += 1
        this.throwOnce('write')
        if (closed) throw fileError('EBADF', 'file handle is closed')
        this.files.set(filePath, data)
      },
      sync: async () => {
        this.syncCount += 1
        this.syncStarted?.resolve()
        if (this.syncGate) await this.syncGate.promise
        this.throwOnce('sync')
        if (closed) throw fileError('EBADF', 'file handle is closed')
      },
      close: async () => {
        this.closeCount += 1
        this.throwOnce('close')
        closed = true
      },
    }
  }

  async readFile(filePath: string): Promise<string> {
    if (this.readError) throw this.readError
    const content = this.files.get(filePath)
    if (content === undefined) throw fileError('ENOENT', 'file does not exist')
    return content
  }

  async rename(sourcePath: string, destinationPath: string): Promise<void> {
    this.throwOnce('rename')
    const content = this.files.get(sourcePath)
    if (content === undefined) throw fileError('ENOENT', 'source file does not exist')
    this.files.set(destinationPath, content)
    this.files.delete(sourcePath)
    this.renamedPayloads.push(content)
  }

  async rm(filePath: string): Promise<void> {
    this.removedPaths.push(filePath)
    this.files.delete(filePath)
  }

  private throwOnce(stage: FailureStage): void {
    if (this.failOnceAt !== stage) return
    this.failOnceAt = null
    throw fileError('EIO', `${stage} failed`)
  }
}

class ManualTabSessionTimer implements TabSessionPersistenceTimer {
  readonly delays: number[] = []
  readonly clearedHandles: unknown[] = []
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
    this.clearedHandles.push(handle)
    this.callbacks.delete(handle as number)
  }

  runAll(): void {
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    for (const callback of callbacks) callback()
  }
}

const sessionPath = 'C:\\profile\\browser-session.json'
const temporaryPath = `${sessionPath}.tmp`

function webSession(id: string, path = id): TabSessionSnapshot {
  return {
    version: 1,
    activeTabId: id,
    tabs: [{
      id,
      kind: 'web',
      url: `https://example.com/${path}`,
      title: `Tab ${id}`,
    }],
  }
}

function serialize(snapshot: TabSessionSnapshot): string {
  return `${JSON.stringify(snapshot)}\n`
}

describe('TabSessionStore.load', () => {
  it('removes a stale temporary file before reporting a missing snapshot', async () => {
    const fileSystem = new MemoryTabSessionFileSystem()
    fileSystem.files.set(temporaryPath, 'incomplete')
    const store = new TabSessionStore(sessionPath, { fileSystem })

    await expect(store.load()).resolves.toEqual({ kind: 'fallback', reason: 'missing' })
    expect(fileSystem.files.has(temporaryPath)).toBe(false)
    expect(fileSystem.removedPaths).toContain(temporaryPath)
  })

  it('ignores a stale temporary file and restores the validated target snapshot', async () => {
    const fileSystem = new MemoryTabSessionFileSystem()
    const snapshot = webSession('restored')
    fileSystem.files.set(temporaryPath, serialize(webSession('stale')))
    fileSystem.files.set(sessionPath, serialize(snapshot))
    const store = new TabSessionStore(sessionPath, { fileSystem })

    await expect(store.load()).resolves.toEqual({ kind: 'restore', snapshot })
    expect(fileSystem.files.has(temporaryPath)).toBe(false)
  })

  it('returns validation and read fallbacks without restoring untrusted content', async () => {
    const invalidFileSystem = new MemoryTabSessionFileSystem()
    invalidFileSystem.files.set(sessionPath, '{not-json')
    const invalidStore = new TabSessionStore(sessionPath, { fileSystem: invalidFileSystem })

    await expect(invalidStore.load()).resolves.toEqual({ kind: 'fallback', reason: 'invalid-json' })

    const unreadableFileSystem = new MemoryTabSessionFileSystem()
    unreadableFileSystem.readError = fileError('EACCES', 'access denied')
    const unreadableStore = new TabSessionStore(sessionPath, { fileSystem: unreadableFileSystem })

    await expect(unreadableStore.load()).resolves.toEqual({ kind: 'fallback', reason: 'read-failed' })
  })
})

describe('TabSessionStore.save', () => {
  it('serializes rapid saves and persists only the newest pending snapshot', async () => {
    const fileSystem = new MemoryTabSessionFileSystem()
    fileSystem.syncGate = deferred()
    fileSystem.syncStarted = deferred()
    const store = new TabSessionStore(sessionPath, { fileSystem })

    const firstSave = store.save(webSession('first'))
    await fileSystem.syncStarted.promise
    const secondSave = store.save(webSession('second'))
    const newestSave = store.save(webSession('newest'))

    expect(secondSave).toBe(firstSave)
    expect(newestSave).toBe(firstSave)

    fileSystem.syncGate.resolve()
    await Promise.all([firstSave, secondSave, newestSave])

    expect(fileSystem.renamedPayloads).toEqual([
      serialize(webSession('first')),
      serialize(webSession('newest')),
    ])
    expect(fileSystem.files.get(sessionPath)).toBe(serialize(webSession('newest')))
    expect(fileSystem.files.has(temporaryPath)).toBe(false)
  })

  it.each<FailureStage>(['write', 'sync', 'close', 'rename'])(
    'cleans the temporary file when %s fails',
    async (failureStage) => {
      const fileSystem = new MemoryTabSessionFileSystem()
      const oldSnapshot = webSession('old')
      fileSystem.files.set(sessionPath, serialize(oldSnapshot))
      fileSystem.failOnceAt = failureStage
      const store = new TabSessionStore(sessionPath, { fileSystem })

      await expect(store.save(webSession('replacement'))).rejects.toThrow(`${failureStage} failed`)

      expect(fileSystem.files.has(temporaryPath)).toBe(false)
      expect(fileSystem.files.get(sessionPath)).toBe(serialize(oldSnapshot))
    },
  )

  it('retains the old target on rename failure and accepts a later recovery save', async () => {
    const fileSystem = new MemoryTabSessionFileSystem()
    const oldSnapshot = webSession('old')
    const recoveredSnapshot = webSession('recovered')
    fileSystem.files.set(sessionPath, serialize(oldSnapshot))
    fileSystem.failOnceAt = 'rename'
    const store = new TabSessionStore(sessionPath, { fileSystem })

    await expect(store.save(webSession('failed'))).rejects.toThrow('rename failed')
    expect(fileSystem.files.get(sessionPath)).toBe(serialize(oldSnapshot))
    expect(fileSystem.files.has(temporaryPath)).toBe(false)

    await expect(store.save(recoveredSnapshot)).resolves.toBeUndefined()
    expect(fileSystem.files.get(sessionPath)).toBe(serialize(recoveredSnapshot))
    expect(fileSystem.files.has(temporaryPath)).toBe(false)
  })
})

describe('TabSessionPersistence', () => {
  it('debounces schedules with the default delay and captures only the latest snapshot', async () => {
    const timer = new ManualTabSessionTimer()
    const saved: TabSessionSnapshot[] = []
    let currentSnapshot = webSession('first')
    let providerCalls = 0
    const persistence = new TabSessionPersistence(
      { save: async (snapshot) => { saved.push(snapshot) } },
      () => {
        providerCalls += 1
        return currentSnapshot
      },
      { timer },
    )

    persistence.schedule()
    currentSnapshot = webSession('middle')
    persistence.schedule()
    currentSnapshot = webSession('newest')
    persistence.schedule()

    expect(timer.delays).toEqual([
      DEFAULT_TAB_SESSION_DEBOUNCE_MS,
      DEFAULT_TAB_SESSION_DEBOUNCE_MS,
      DEFAULT_TAB_SESSION_DEBOUNCE_MS,
    ])
    expect(timer.pendingCount).toBe(1)
    expect(timer.clearedHandles).toHaveLength(2)

    timer.runAll()
    await Promise.resolve()

    expect(providerCalls).toBe(1)
    expect(saved).toEqual([webSession('newest')])
  })

  it('flushes immediately, cancels the debounce timer, and waits for the write', async () => {
    const timer = new ManualTabSessionTimer()
    const saveGate = deferred()
    const saveStarted = deferred()
    const saved: TabSessionSnapshot[] = []
    let currentSnapshot = webSession('scheduled')
    const persistence = new TabSessionPersistence(
      {
        save: async (snapshot) => {
          saved.push(snapshot)
          saveStarted.resolve()
          await saveGate.promise
        },
      },
      () => currentSnapshot,
      { debounceMs: 75, timer },
    )

    persistence.schedule()
    currentSnapshot = webSession('flushed')
    let flushCompleted = false
    const flushPromise = persistence.flush().then(() => { flushCompleted = true })
    await saveStarted.promise

    expect(timer.delays).toEqual([75])
    expect(timer.pendingCount).toBe(0)
    expect(timer.clearedHandles).toHaveLength(1)
    expect(saved).toEqual([webSession('flushed')])
    expect(flushCompleted).toBe(false)

    saveGate.resolve()
    await flushPromise
    expect(flushCompleted).toBe(true)
  })

  it('coalesces snapshots queued during an in-flight write to the newest one', async () => {
    const timer = new ManualTabSessionTimer()
    const firstSaveGate = deferred()
    const firstSaveStarted = deferred()
    const saved: TabSessionSnapshot[] = []
    let currentSnapshot = webSession('first')
    const persistence = new TabSessionPersistence(
      {
        save: async (snapshot) => {
          saved.push(snapshot)
          if (saved.length === 1) {
            firstSaveStarted.resolve()
            await firstSaveGate.promise
          }
        },
      },
      () => currentSnapshot,
      { timer },
    )

    const flushPromise = persistence.flush()
    await firstSaveStarted.promise

    currentSnapshot = webSession('middle')
    persistence.schedule()
    timer.runAll()
    currentSnapshot = webSession('newest')
    persistence.schedule()
    timer.runAll()

    expect(saved).toEqual([webSession('first')])
    firstSaveGate.resolve()
    await flushPromise

    expect(saved).toEqual([webSession('first'), webSession('newest')])
  })

  it('disposes idempotently with one final flush and ignores later schedules', async () => {
    const timer = new ManualTabSessionTimer()
    const saved: TabSessionSnapshot[] = []
    let currentSnapshot = webSession('scheduled')
    const persistence = new TabSessionPersistence(
      { save: async (snapshot) => { saved.push(snapshot) } },
      () => currentSnapshot,
      { timer },
    )

    persistence.schedule()
    currentSnapshot = webSession('final')
    const firstDispose = persistence.dispose()
    const secondDispose = persistence.dispose()

    expect(secondDispose).toBe(firstDispose)
    expect(timer.pendingCount).toBe(0)
    await firstDispose
    expect(saved).toEqual([webSession('final')])

    persistence.schedule()
    expect(timer.pendingCount).toBe(0)
    expect(persistence.flush()).toBe(firstDispose)
  })

  it('reports fixed failure reasons without exposing errors and recovers later', async () => {
    const diagnostics: TabSessionPersistenceFailureReason[] = []
    const saved: TabSessionSnapshot[] = []
    let currentSnapshot = webSession('failed')
    let failNextSave = true
    const persistence = new TabSessionPersistence(
      {
        save: async (snapshot) => {
          if (failNextSave) {
            failNextSave = false
            throw new Error('failed to save https://example.com/?token=secret')
          }
          saved.push(snapshot)
        },
      },
      () => currentSnapshot,
      { onDiagnostic: (reason) => { diagnostics.push(reason) } },
    )

    await expect(persistence.flush()).resolves.toBeUndefined()
    expect(diagnostics).toEqual(['save-failed'])
    expect(JSON.stringify(diagnostics)).not.toContain('secret')

    currentSnapshot = webSession('recovered')
    await expect(persistence.flush()).resolves.toBeUndefined()
    expect(saved).toEqual([webSession('recovered')])
  })

  it('contains provider and diagnostic callback failures so a later flush can recover', async () => {
    const diagnostics: TabSessionPersistenceFailureReason[] = []
    const saved: TabSessionSnapshot[] = []
    let providerShouldFail = true
    const persistence = new TabSessionPersistence(
      { save: async (snapshot) => { saved.push(snapshot) } },
      () => {
        if (providerShouldFail) throw new Error('snapshot contained https://example.com/private')
        return webSession('recovered')
      },
      {
        onDiagnostic: (reason) => {
          diagnostics.push(reason)
          throw new Error('diagnostic sink unavailable')
        },
      },
    )

    await expect(persistence.flush()).resolves.toBeUndefined()
    expect(diagnostics).toEqual(['snapshot-provider-failed'])
    expect(saved).toEqual([])

    providerShouldFail = false
    await expect(persistence.flush()).resolves.toBeUndefined()
    expect(saved).toEqual([webSession('recovered')])
  })
})
