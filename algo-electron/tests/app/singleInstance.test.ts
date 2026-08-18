import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'vitest'
import {
  installSingleInstanceLock,
  type FocusableMainWindow,
  type SingleInstanceLogger,
} from '../../electron/app/singleInstance.ts'

class FakeApp extends EventEmitter {
  quitCount = 0

  constructor(private readonly lockGranted: boolean) {
    super()
  }

  requestSingleInstanceLock(): boolean { return this.lockGranted }
  quit(): void { this.quitCount += 1 }
}

class FakeWindow implements FocusableMainWindow {
  destroyed = false
  minimized = false
  restoreCount = 0
  showCount = 0
  focusCount = 0

  isDestroyed(): boolean { return this.destroyed }
  isMinimized(): boolean { return this.minimized }
  restore(): void { this.minimized = false; this.restoreCount += 1 }
  show(): void { this.showCount += 1 }
  focus(): void { this.focusCount += 1 }
}

class MemoryLogger implements SingleInstanceLogger {
  readonly entries: Array<{ level: 'info' | 'warn'; message: string; data: unknown[] }> = []
  info(message: string, ...data: unknown[]): void { this.entries.push({ level: 'info', message, data }) }
  warn(message: string, ...data: unknown[]): void { this.entries.push({ level: 'warn', message, data }) }
}

test('a losing instance quits without installing a second-instance listener', () => {
  const app = new FakeApp(false)
  const logger = new MemoryLogger()

  assert.strictEqual(installSingleInstanceLock(app, () => null, { logger }), false)
  assert.strictEqual(app.quitCount, 1)
  assert.strictEqual(app.listenerCount('second-instance'), 0)
  assert.deepStrictEqual(logger.entries.map((entry) => entry.message), ['app.single-instance-denied'])
})

test('a later launch restores, shows, and focuses the current main window', () => {
  const app = new FakeApp(true)
  const window = new FakeWindow()
  const logger = new MemoryLogger()
  window.minimized = true

  assert.strictEqual(installSingleInstanceLock(app, () => window, { logger }), true)
  app.emit('second-instance')

  assert.strictEqual(app.quitCount, 0)
  assert.strictEqual(window.minimized, false)
  assert.strictEqual(window.restoreCount, 1)
  assert.strictEqual(window.showCount, 1)
  assert.strictEqual(window.focusCount, 1)
  assert.deepStrictEqual(logger.entries.map((entry) => entry.message), [
    'app.single-instance-acquired',
    'app.second-instance-focused',
  ])
})

test('a later launch tolerates a missing, destroyed, or failing main window', () => {
  const app = new FakeApp(true)
  const logger = new MemoryLogger()
  let currentWindow: FakeWindow | null = null
  installSingleInstanceLock(app, () => currentWindow, { logger })

  app.emit('second-instance')
  currentWindow = new FakeWindow()
  currentWindow.destroyed = true
  app.emit('second-instance')
  currentWindow.destroyed = false
  currentWindow.show = () => { throw new Error('show failed') }
  app.emit('second-instance')

  assert.deepStrictEqual(logger.entries.map((entry) => entry.message), [
    'app.single-instance-acquired',
    'app.second-instance-no-window',
    'app.second-instance-no-window',
    'app.second-instance-focus-failed',
  ])
})
