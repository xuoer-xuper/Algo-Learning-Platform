import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'vitest'
import {
  createFatalErrorReporter,
  installMainProcessErrorHandlers,
  type FatalErrorSource,
} from '../../electron/app/mainProcessErrors.ts'
import type { Logger } from '../../electron/shared/logger.ts'

class MemoryLogger implements Logger {
  readonly entries: Array<{ level: string; message: string; data: unknown[] }> = []
  debug(message: string, ...data: unknown[]): void { this.entries.push({ level: 'debug', message, data }) }
  info(message: string, ...data: unknown[]): void { this.entries.push({ level: 'info', message, data }) }
  warn(message: string, ...data: unknown[]): void { this.entries.push({ level: 'warn', message, data }) }
  error(message: string, ...data: unknown[]): void { this.entries.push({ level: 'error', message, data }) }
  fatal(message: string, ...data: unknown[]): void { this.entries.push({ level: 'fatal', message, data }) }
  getLogFilePath(): string { return 'C:\\user-data\\logs\\main.log' }
}

test('global process errors are logged while dialog and exit run only once', () => {
  const processEvents = new EventEmitter()
  const logger = new MemoryLogger()
  const dialogs: Array<{ title: string; content: string }> = []
  const exits: number[] = []
  const report = createFatalErrorReporter({
    logger,
    showErrorBox: (title, content) => dialogs.push({ title, content }),
    exit: (code) => exits.push(code),
  })
  const uninstall = installMainProcessErrorHandlers(processEvents as never, report)

  processEvents.emit('uncaughtException', new Error('first failure'))
  processEvents.emit('unhandledRejection', 'second failure')

  assert.strictEqual(logger.entries.filter((entry) => entry.level === 'fatal').length, 2)
  assert.strictEqual(dialogs.length, 1)
  assert.ok(dialogs[0].content.includes('uncaughtException'))
  assert.ok(dialogs[0].content.includes('C:\\user-data\\logs\\main.log'))
  assert.deepStrictEqual(exits, [1])

  uninstall()
  processEvents.emit('uncaughtException', new Error('after cleanup'))
  assert.strictEqual(logger.entries.filter((entry) => entry.level === 'fatal').length, 2)
})

test('startup failure can skip the blocking dialog in smoke mode', () => {
  const logger = new MemoryLogger()
  const sources: FatalErrorSource[] = []
  const exits: number[] = []
  const report = createFatalErrorReporter({
    logger,
    showErrorBox: () => { throw new Error('dialog must stay disabled') },
    exit: (code) => exits.push(code),
    showDialog: false,
  })

  report('startup', new Error('database migration failed'))
  sources.push((logger.entries[0].data[0] as { source: FatalErrorSource }).source)

  assert.deepStrictEqual(sources, ['startup'])
  assert.deepStrictEqual(exits, [1])
  assert.strictEqual(logger.entries.some((entry) => entry.message === 'main-process.fatal-dialog-failed'), false)
})
