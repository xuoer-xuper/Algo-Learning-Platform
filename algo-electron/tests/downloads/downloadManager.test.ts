import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DownloadManager,
  type DownloadSessionLike,
  type DownloadWillStartEvent,
  type ManagedDownloadItem,
  type NativeDownloadState,
  type WillDownloadListener,
} from '../../electron/downloads/DownloadManager'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function createTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-download-manager-'))
  temporaryDirectories.push(directory)
  return directory
}

class MockDownloadSession implements DownloadSessionLike {
  listener: WillDownloadListener | null = null

  on(_event: 'will-download', listener: WillDownloadListener): void {
    this.listener = listener
  }

  removeListener(_event: 'will-download', listener: WillDownloadListener): void {
    if (this.listener === listener) this.listener = null
  }

  start(item: MockDownloadItem): DownloadWillStartEvent & { prevented: boolean } {
    const event = {
      prevented: false,
      preventDefault() { this.prevented = true },
    }
    this.listener?.(event, item)
    return event
  }
}

class MockDownloadItem implements ManagedDownloadItem {
  savePath = ''
  private doneListener: ((event: unknown, state: NativeDownloadState) => void) | null = null

  constructor(
    private readonly fileName: string,
    private readonly receivedBytes = 0,
    private readonly totalBytes = 0,
    private readonly sourceUrl = '',
  ) {}

  getFilename(): string { return this.fileName }
  getURL(): string { return this.sourceUrl }
  setSavePath(filePath: string): void { this.savePath = filePath }
  once(_event: 'done', listener: (event: unknown, state: NativeDownloadState) => void): void {
    this.doneListener = listener
  }
  getReceivedBytes(): number { return this.receivedBytes }
  getTotalBytes(): number { return this.totalBytes }
  finish(state: NativeDownloadState): void { this.doneListener?.({}, state) }
}

describe('DownloadManager', () => {
  it('forces managed paths, reserves concurrent names, and emits completion metadata', () => {
    const downloadDirectory = createTemporaryDirectory()
    const manager = new DownloadManager({
      downloadDirectory,
      clock: () => Date.parse('2026-08-18T12:00:00.000Z'),
      idFactory: () => 'download-1',
    })
    const session = new MockDownloadSession()
    manager.attachSession(session)
    const results: unknown[] = []
    manager.addResultListener((result) => results.push(result))

    const first = new MockDownloadItem('../report.pdf', 10, 10)
    const second = new MockDownloadItem('report.pdf')
    expect(session.start(first).prevented).toBe(false)
    expect(session.start(second).prevented).toBe(false)
    expect(first.savePath).toBe(path.join(downloadDirectory, 'report.pdf'))
    expect(second.savePath).toBe(path.join(downloadDirectory, 'report (1).pdf'))

    first.finish('completed')
    expect(results).toEqual([{
      downloadId: 'download-1',
      fileName: 'report.pdf',
      savePath: first.savePath,
      state: 'completed',
      receivedBytes: 10,
      totalBytes: 10,
      finishedAt: '2026-08-18T12:00:00.000Z',
    }])
  })

  it('cancels setup failures and emits a stable failure code without an escaped path', () => {
    const manager = new DownloadManager({
      downloadDirectory: path.resolve('managed-downloads'),
      idFactory: () => 'download-failed',
      clock: () => 0,
      fileSystem: {
        mkdirSync: () => { throw new Error('read only') },
        existsSync: () => false,
      },
    })
    const session = new MockDownloadSession()
    manager.attachSession(session)
    const listener = vi.fn()
    manager.addResultListener(listener)

    const event = session.start(new MockDownloadItem('../../secret.txt'))

    expect(event.prevented).toBe(true)
    expect(listener).toHaveBeenCalledWith({
      downloadId: 'download-failed',
      fileName: 'secret.txt',
      savePath: null,
      state: 'interrupted',
      receivedBytes: 0,
      totalBytes: 0,
      finishedAt: '1970-01-01T00:00:00.000Z',
      errorCode: 'path-setup-failed',
    })
  })

  it('detaches session listeners and ignores observer failures', () => {
    const manager = new DownloadManager({ downloadDirectory: createTemporaryDirectory() })
    const session = new MockDownloadSession()
    const detach = manager.attachSession(session)
    manager.addResultListener(() => { throw new Error('observer failed') })
    const listener = vi.fn()
    manager.addResultListener(listener)
    const item = new MockDownloadItem('answer.txt')
    session.start(item)
    expect(() => item.finish('cancelled')).not.toThrow()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ state: 'cancelled' }))

    detach()
    expect(session.listener).toBeNull()
    manager.destroy()
    expect(() => manager.attachSession(session)).toThrow('destroyed')
  })

  it('allows a navigation interceptor to cancel userscripts before path allocation', () => {
    const manager = new DownloadManager({
      downloadDirectory: createTemporaryDirectory(),
      interceptDownload: ({ sourceUrl, fileName }) => (
        sourceUrl.endsWith('.user.js') && fileName === 'helper.user.js'
      ),
    })
    const session = new MockDownloadSession()
    manager.attachSession(session)
    const item = new MockDownloadItem('helper.user.js', 0, 0, 'https://example.com/helper.user.js')

    const event = session.start(item)

    expect(event.prevented).toBe(true)
    expect(item.savePath).toBe('')
  })
})
