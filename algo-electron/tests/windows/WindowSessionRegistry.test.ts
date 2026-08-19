import { describe, expect, it, vi } from 'vitest'
import { WindowSessionRegistry } from '../../electron/windows/WindowSessionRegistry.ts'

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve = (): void => {}
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe('WindowSessionRegistry', () => {
  it('keeps an in-flight runtime registered and reuses its dispose promise', async () => {
    const registry = new WindowSessionRegistry()
    const gate = deferred()
    const removeChangeListener = vi.fn()
    const dispose = vi.fn(() => gate.promise)
    registry.register('window-1', { removeChangeListener, persistence: { dispose } })

    const firstDispose = registry.dispose('window-1')
    const repeatedDispose = registry.dispose('window-1')
    const quitDispose = registry.disposeAll()
    await Promise.resolve()

    expect(repeatedDispose).toBe(firstDispose)
    expect(registry.has('window-1')).toBe(true)
    expect(registry.size).toBe(1)
    expect(removeChangeListener).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()

    gate.resolve()
    await Promise.all([firstDispose, quitDispose])

    expect(registry.has('window-1')).toBe(false)
    expect(registry.size).toBe(0)
  })

  it('contains one failed runtime while waiting for all remaining disposals', async () => {
    const registry = new WindowSessionRegistry()
    const gate = deferred()
    registry.register('failed-window', {
      removeChangeListener: () => undefined,
      persistence: { dispose: () => Promise.reject(new Error('save failed')) },
    })
    registry.register('slow-window', {
      removeChangeListener: () => undefined,
      persistence: { dispose: () => gate.promise },
    })

    let completed = false
    const disposeAll = registry.disposeAll().then(() => { completed = true })
    await Promise.resolve()
    await Promise.resolve()
    expect(completed).toBe(false)

    gate.resolve()
    await disposeAll

    expect(completed).toBe(true)
    expect(registry.size).toBe(0)
  })
})
