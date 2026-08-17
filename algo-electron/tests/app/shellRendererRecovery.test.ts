import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'vitest'
import { installShellRendererRecovery } from '../../electron/app/shellRendererRecovery.ts'
import type { Logger } from '../../electron/shared/logger.ts'

class MemoryLogger implements Logger {
  readonly messages: string[] = []
  debug(message: string): void { this.messages.push(message) }
  info(message: string): void { this.messages.push(message) }
  warn(message: string): void { this.messages.push(message) }
  error(message: string): void { this.messages.push(message) }
  fatal(message: string): void { this.messages.push(message) }
  getLogFilePath(): null { return null }
}

class FakeWebContents extends EventEmitter {
  destroyed = false
  reloadCount = 0
  isDestroyed(): boolean { return this.destroyed }
  reload(): void { this.reloadCount += 1 }
}

test('shell renderer crash is logged and reloads the live shell', () => {
  const contents = new FakeWebContents()
  const logger = new MemoryLogger()
  const uninstall = installShellRendererRecovery(contents as never, {
    logger,
    schedule: (callback) => callback(),
  })

  contents.emit('unresponsive')
  contents.emit('responsive')
  contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 139 })

  assert.strictEqual(contents.reloadCount, 1)
  assert.deepStrictEqual(logger.messages, [
    'shell.renderer-unresponsive',
    'shell.renderer-responsive',
    'shell.renderer-gone',
    'shell.renderer-reload-requested',
  ])

  uninstall()
  contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 139 })
  assert.strictEqual(contents.reloadCount, 1)
})

test('clean exit, app shutdown, and destroyed contents do not reload', () => {
  const contents = new FakeWebContents()
  const logger = new MemoryLogger()
  let allowReload = true
  installShellRendererRecovery(contents as never, {
    logger,
    shouldReload: () => allowReload,
    schedule: (callback) => callback(),
  })

  contents.emit('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 })
  allowReload = false
  contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
  allowReload = true
  contents.destroyed = true
  contents.emit('render-process-gone', {}, { reason: 'oom', exitCode: 1 })

  assert.strictEqual(contents.reloadCount, 0)
})
