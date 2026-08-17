import assert from 'node:assert/strict'
import { test } from 'vitest'
import { runMigrations } from '../../electron/db/migrate.ts'
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

function createDatabase(appliedVersions: number[] = []) {
  const inserted: number[] = []
  return {
    inserted,
    exec: () => undefined,
    prepare: (sql: string) => {
      if (sql.startsWith('SELECT version')) {
        return { all: () => appliedVersions.map((version) => ({ version })) }
      }
      return { run: (version: number) => { inserted.push(version) } }
    },
    transaction: (callback: () => void) => () => callback(),
  }
}

test('migration runner logs start, success, and failure while preserving transaction errors', () => {
  const database = createDatabase([1])
  const logger = new MemoryLogger()
  const migrations = [
    { version: 1, name: 'already-applied', up: () => undefined },
    { version: 2, name: 'successful', up: () => undefined },
    { version: 3, name: 'broken', up: () => { throw new Error('migration failed') } },
  ]

  assert.throws(() => runMigrations(database as never, migrations, logger), /migration failed/)
  assert.deepStrictEqual(database.inserted, [2])
  assert.deepStrictEqual(logger.messages, [
    'db.migration-started',
    'db.migration-completed',
    'db.migration-started',
    'db.migration-failed',
  ])
})
