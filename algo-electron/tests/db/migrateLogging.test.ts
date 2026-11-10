import assert from 'node:assert/strict'
import { test } from 'vitest'
import { runMigrations } from '../../electron/db/migrate.ts'
import type { Logger } from '../../electron/shared/logger.ts'
import { getMigrationDiagnostics } from '../../src/main/db/migration-diagnostics'

class MemoryLogger implements Logger {
  readonly messages: string[] = []
  debug(message: string): void {
    this.messages.push(message)
  }
  info(message: string): void {
    this.messages.push(message)
  }
  warn(message: string): void {
    this.messages.push(message)
  }
  error(message: string): void {
    this.messages.push(message)
  }
  fatal(message: string): void {
    this.messages.push(message)
  }
  getLogFilePath(): null {
    return null
  }
}

function createDatabase(appliedVersions: number[] = []) {
  const inserted: number[] = []
  return {
    inserted,
    exec: () => undefined,
    pragma: (name: string) =>
      name === 'table_info(schema_migrations)' ? [{ name: 'applied_at', type: 'TEXT' }] : 1,
    prepare: (sql: string) => {
      if (sql.startsWith('SELECT version')) {
        return { all: () => appliedVersions.map((version) => ({ version })) }
      }
      return {
        run: (version: number) => {
          inserted.push(version)
        },
      }
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
    {
      version: 3,
      name: 'broken',
      up: () => {
        throw new Error('migration failed')
      },
    },
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

function databaseWithFailedForeignKeyRestore() {
  const database = createDatabase()
  let foreignKeys = 1
  const restoreError = new Error('foreign key restore failed')
  return {
    restoreError,
    database: {
      ...database,
      inTransaction: false,
      pragma: (name: string) => {
        if (name === 'foreign_keys') return foreignKeys
        if (name === 'foreign_keys = OFF') {
          foreignKeys = 0
          return undefined
        }
        if (name === 'foreign_keys = ON') throw restoreError
        if (name === 'foreign_key_check') return []
        if (name === 'integrity_check') return 'ok'
        return database.pragma(name)
      },
    },
  }
}

test('should preserve the original error when migration and foreign key restoration both fail', () => {
  const { database } = databaseWithFailedForeignKeyRestore()
  const logger = new MemoryLogger()
  const original = new Error('original migration failed')
  assert.throws(
    () =>
      runMigrations(
        database as never,
        [
          {
            version: 30,
            name: 'broken',
            requiresForeignKeysDisabled: true,
            up: () => {
              throw original
            },
          },
        ],
        logger,
      ),
    (error) => error === original,
  )
  assert.deepStrictEqual(logger.messages, [
    'db.migration-started',
    'db.migration-foreign-keys-restore-failed',
    'db.migration-failed',
  ])
})

test('should reject restoration failure after a successful migration without logging completion', () => {
  const { database, restoreError } = databaseWithFailedForeignKeyRestore()
  const logger = new MemoryLogger()
  assert.throws(
    () =>
      runMigrations(
        database as never,
        [
          {
            version: 30,
            name: 'successful',
            requiresForeignKeysDisabled: true,
            up: () => undefined,
          },
        ],
        logger,
      ),
    (error) => error === restoreError,
  )
  assert.deepStrictEqual(database.inserted, [30])
  assert.deepStrictEqual(logger.messages, ['db.migration-started', 'db.migration-failed'])
})

test('should preserve transaction failure if error reporting and foreign-key restoration also throw', () => {
  const { database, restoreError } = databaseWithFailedForeignKeyRestore()
  const original = new Error('original migration failed')
  const logger = new MemoryLogger()
  logger.error = () => {
    throw new Error('logging failed')
  }
  assert.throws(
    () =>
      runMigrations(
        database as never,
        [
          {
            version: 30,
            name: 'broken',
            requiresForeignKeysDisabled: true,
            up: () => {
              throw original
            },
          },
        ],
        logger,
      ),
    (error) => error === original,
  )
  assert.ok(getMigrationDiagnostics(original).some(({ error }) => error === restoreError))
  assert.ok(
    getMigrationDiagnostics(original).some(
      ({ stage }) => stage === 'db.migration-diagnostic-log-failed',
    ),
  )
})
