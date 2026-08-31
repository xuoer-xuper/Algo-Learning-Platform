import assert from 'node:assert/strict'
import type fs from 'node:fs'
import { test } from 'vitest'
import { UserScriptFileWatcher } from '../../electron/scripts/UserScriptFileWatcher.ts'

/**
 * 三个用例都要同一套替身：截获 fs.watch 的监听器、截获 debounce 定时器、数刷新次数。
 *
 * 截获的东西收进数组，而不是 `let onEvent … | null`。后者过不了类型检查，失败方式还
 * 很反直觉：赋值发生在 watch/setTimeout 替身的闭包里，TS 的控制流分析看不见，于是认定
 * 调用点它仍是 `null`，一经 `onEvent?.()` 就收窄成 `never`——报的是 "This expression is
 * not callable"，跟"可能为 null"完全不像。数组下标没有这个问题，而且顺带把"注册了几个
 * 监听器""排了几次定时器"变成可断言的事实。
 */
function createWatcherHarness(options: { getGeneration?: () => number } = {}) {
  const watchListeners: Array<fs.WatchListener<string>> = []
  const timerCallbacks: Array<() => void> = []
  const state = { closed: false, refreshes: 0 }

  const watcher = new UserScriptFileWatcher({
    directory: 'C:/managed-userscripts',
    mkdir: () => undefined,
    watch: ((_directory: fs.PathLike, _options: unknown, listener: fs.WatchListener<string>) => {
      watchListeners.push(listener)
      const fake = { on: () => fake, close: () => { state.closed = true } }
      return fake
    }) as unknown as typeof fs.watch,
    setTimeout: ((handler: () => void) => {
      timerCallbacks.push(handler)
      return timerCallbacks.length as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout,
    clearTimeout: (() => undefined) as typeof clearTimeout,
    getGeneration: options.getGeneration,
    onChanged: () => { state.refreshes += 1 },
  })

  return {
    watcher,
    state,
    timerCallbacks,
    /** 把一次文件系统事件交给 start() 注册的那个监听器 */
    emit(event: fs.WatchEventType, filename: string): void {
      assert.strictEqual(watchListeners.length, 1, 'start() 应恰好注册一个 watch 监听器')
      watchListeners[0](event, filename)
    },
    /**
     * 触发当前挂着的那个定时器。取最后一个而不是第一个：debounce 每次都
     * clearTimeout 旧的再排一个新的，待触发的永远是最新那个。
     */
    firePendingTimer(): void {
      const pending = timerCallbacks.at(-1)
      assert.ok(pending, '应有一个待触发的 debounce 定时器')
      pending()
    },
  }
}

test('managed userscript watcher debounces js changes and ignores unrelated files', () => {
  const harness = createWatcherHarness()

  harness.watcher.start()
  harness.emit('change', 'notes.txt')
  assert.strictEqual(harness.timerCallbacks.length, 0, '无关文件不应排定时器')
  harness.emit('change', 'helper.user.js')
  harness.firePendingTimer()
  assert.strictEqual(harness.state.refreshes, 1)
  harness.watcher.stop()
  assert.strictEqual(harness.state.closed, true)
})

test('watcher forwards a valid js event through one debounced callback', () => {
  const harness = createWatcherHarness()

  harness.watcher.start()
  harness.emit('change', 'helper.user.js')
  harness.emit('change', 'helper.user.js')
  assert.strictEqual(harness.state.refreshes, 0)
  harness.firePendingTimer()
  assert.strictEqual(harness.state.refreshes, 1)
  harness.watcher.stop()
})

test('watcher skips its own echo when an in-app write already refreshed the runtime', () => {
  let generation = 7
  const harness = createWatcherHarness({ getGeneration: () => generation })

  harness.watcher.start()
  harness.emit('rename', 'installed--0123456789ab--ba9876543210.user.js')
  // The install path refreshes the runtime itself while the debounce is pending.
  generation = 8
  harness.firePendingTimer()
  assert.strictEqual(harness.state.refreshes, 0, 'An in-app write must not trigger a second runtime refresh')

  // An external edit leaves the generation untouched and must still refresh.
  harness.emit('change', 'installed--0123456789ab--ba9876543210.user.js')
  harness.firePendingTimer()
  assert.strictEqual(harness.state.refreshes, 1, 'An external edit must still invalidate the runtime')
  harness.watcher.stop()
})
