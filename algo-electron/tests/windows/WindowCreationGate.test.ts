import { expect, it, vi } from 'vitest'
import { WindowCreationGate } from '../../electron/windows/WindowCreationGate.ts'

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve = (_value: T): void => {}
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

it('coalesces overlapping window creation and permits a later creation', async () => {
  const gate = new WindowCreationGate<string>()
  const firstResult = deferred<string>()
  const create = vi.fn(() => firstResult.promise)

  await expect(gate.run(create)).resolves.toBeNull()
  expect(create).not.toHaveBeenCalled()
  gate.enable()

  const first = gate.run(create)
  const overlapping = gate.run(create)
  await Promise.resolve()

  expect(overlapping).toBe(first)
  expect(gate.isRunning).toBe(true)
  expect(create).toHaveBeenCalledOnce()

  firstResult.resolve('window-1')
  await expect(first).resolves.toBe('window-1')
  await expect(gate.waitForIdle()).resolves.toBeUndefined()
  expect(gate.isRunning).toBe(false)

  const later = gate.run(async () => 'window-2')
  await expect(later).resolves.toBe('window-2')
})

it('cancels an in-flight creation before it can register a window', async () => {
  const gate = new WindowCreationGate<string>()
  const diskRead = deferred<void>()
  const registerWindow = vi.fn()
  gate.enable()

  const result = gate.run(async (isCancelled) => {
    await diskRead.promise
    if (isCancelled()) return null
    registerWindow()
    return 'window-1'
  })
  gate.stop()
  const idle = gate.waitForIdle()
  diskRead.resolve()

  await expect(result).resolves.toBeNull()
  await expect(idle).resolves.toBeUndefined()
  expect(registerWindow).not.toHaveBeenCalled()
  await expect(gate.run(async () => 'window-2')).resolves.toBeNull()
})
