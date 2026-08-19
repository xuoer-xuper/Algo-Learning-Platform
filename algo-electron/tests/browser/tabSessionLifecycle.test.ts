import { describe, expect, it, vi } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from 'electron'
import { installWindowSessionFlush } from '../../electron/browser/tabSessionLifecycle'

interface Deferred {
  promise: Promise<void>
  resolve(): void
  reject(error: Error): void
}

function deferred(): Deferred {
  let resolve = (): void => {}
  let reject = (_error: Error): void => {}
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('window tab session flush', () => {
  it('holds repeated close requests until one flush completes', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    const gate = deferred()
    const flush = vi.fn(() => gate.promise)
    const closed = vi.fn()
    window.on('closed', closed)
    let shouldFlush = true
    installWindowSessionFlush(window as never, {
      shouldFlush: () => shouldFlush,
      flush,
    })

    window.close()
    shouldFlush = false
    window.close()

    expect(flush).toHaveBeenCalledOnce()
    expect(window.isDestroyed()).toBe(false)
    expect(closed).not.toHaveBeenCalled()

    gate.resolve()
    await gate.promise
    await Promise.resolve()

    expect(window.isDestroyed()).toBe(true)
    expect(closed).toHaveBeenCalledOnce()
  })

  it('closes immediately when persistence is unavailable', () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    const flush = vi.fn(async () => {})
    installWindowSessionFlush(window as never, {
      shouldFlush: () => false,
      flush,
    })

    window.close()

    expect(window.isDestroyed()).toBe(true)
    expect(flush).not.toHaveBeenCalled()
  })

  it('reports a fixed failure and still allows the window to close', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    const gate = deferred()
    const onFailure = vi.fn()
    installWindowSessionFlush(window as never, {
      shouldFlush: () => true,
      flush: () => gate.promise,
      onFailure,
    })

    window.close()
    gate.reject(new Error('failed https://example.com/?token=secret'))
    await expect(gate.promise).rejects.toThrow('failed')
    await Promise.resolve()

    expect(onFailure).toHaveBeenCalledOnce()
    expect(window.isDestroyed()).toBe(true)
  })

  it('contains synchronous flush and diagnostic failures', async () => {
    resetElectronMock()
    const window = new MockBrowserWindow()
    installWindowSessionFlush(window as never, {
      shouldFlush: () => true,
      flush: () => { throw new Error('synchronous flush failure') },
      onFailure: () => { throw new Error('diagnostic failure') },
    })

    window.close()
    await Promise.resolve()
    await Promise.resolve()

    expect(window.isDestroyed()).toBe(true)
  })
})
