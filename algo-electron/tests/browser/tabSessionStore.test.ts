import { describe, expect, it } from 'vitest'
import {
  TabSessionStore,
  type TabSessionFileHandle,
  type TabSessionFileSystem,
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
