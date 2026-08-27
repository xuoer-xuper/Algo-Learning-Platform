import assert from 'node:assert/strict'
import { test } from 'vitest'
import { UserScriptFileWatcher } from '../../electron/scripts/UserScriptFileWatcher.ts'

test('managed userscript watcher debounces js changes and ignores unrelated files', () => {
  let onEvent: ((event: string, filename: string) => void) | null = null
  let closed = false
  let refreshes = 0
  let timerCallback: (() => void) | null = null
  const watcher = new UserScriptFileWatcher({
    directory: 'C:/managed-userscripts',
    mkdir: () => undefined,
    watch: ((...args: unknown[]) => {
      onEvent = args[2] as (event: string, filename: string) => void
      const fake = {
        on: () => fake,
        close: () => { closed = true },
      }
      return fake
    }) as unknown as typeof import('node:fs').watch,
    setTimeout: ((handler: () => void) => {
      timerCallback = handler
      return 1 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout,
    clearTimeout: (() => undefined) as typeof clearTimeout,
    onChanged: () => { refreshes += 1 },
  })

  watcher.start()
  onEvent?.('change', 'notes.txt')
  assert.strictEqual(timerCallback, null)
  onEvent?.('change', 'helper.user.js')
  timerCallback?.()
  assert.strictEqual(refreshes, 1)
  watcher.stop()
  assert.strictEqual(closed, true)
})

test('watcher forwards a valid js event through one debounced callback', () => {
  let onEvent: ((event: string, filename: string) => void) | null = null
  let refreshes = 0
  let timerCallback: (() => void) | null = null
  const watcher = new UserScriptFileWatcher({
    directory: 'C:/managed-userscripts',
    mkdir: () => undefined,
    watch: ((...args: unknown[]) => {
      onEvent = args[2] as (event: string, filename: string) => void
      const fake = { on: () => fake, close: () => undefined }
      return fake
    }) as unknown as typeof import('node:fs').watch,
    setTimeout: ((handler: () => void) => {
      timerCallback = handler
      return 1 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout,
    clearTimeout: (() => undefined) as typeof clearTimeout,
    onChanged: () => { refreshes += 1 },
  })

  watcher.start()
  onEvent?.('change', 'helper.user.js')
  onEvent?.('change', 'helper.user.js')
  assert.strictEqual(refreshes, 0)
  timerCallback?.()
  assert.strictEqual(refreshes, 1)
  watcher.stop()
})

test('watcher skips its own echo when an in-app write already refreshed the runtime', () => {
  let onEvent: ((event: string, filename: string) => void) | null = null
  let refreshes = 0
  let timerCallback: (() => void) | null = null
  let generation = 7
  const watcher = new UserScriptFileWatcher({
    directory: 'C:/managed-userscripts',
    mkdir: () => undefined,
    watch: ((...args: unknown[]) => {
      onEvent = args[2] as (event: string, filename: string) => void
      const fake = { on: () => fake, close: () => undefined }
      return fake
    }) as unknown as typeof import('node:fs').watch,
    setTimeout: ((handler: () => void) => {
      timerCallback = handler
      return 1 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout,
    clearTimeout: (() => undefined) as typeof clearTimeout,
    getGeneration: () => generation,
    onChanged: () => { refreshes += 1 },
  })

  watcher.start()
  onEvent?.('rename', 'installed--0123456789ab--ba9876543210.user.js')
  // The install path refreshes the runtime itself while the debounce is pending.
  generation = 8
  timerCallback?.()
  assert.strictEqual(refreshes, 0, 'An in-app write must not trigger a second runtime refresh')

  // An external edit leaves the generation untouched and must still refresh.
  onEvent?.('change', 'installed--0123456789ab--ba9876543210.user.js')
  timerCallback?.()
  assert.strictEqual(refreshes, 1, 'An external edit must still invalidate the runtime')
  watcher.stop()
})
