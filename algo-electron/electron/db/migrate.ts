import type Database from 'better-sqlite3'
import { nowBeijing } from '../shared/time'
import { logger as baseLogger, type Logger } from '../shared/logger'

/** `schema_migrations` 只查 version 一列时的行形状。 */
interface AppliedVersionRow {
  version: number
}

export interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
  requiresForeignKeysDisabled?: boolean
}

export function getPendingMigrations(
  db: Database.Database,
  migrations: readonly Migration[],
): Migration[] {
  const migrationTable = db
    .prepare(
      `
    SELECT 1 as present
    FROM sqlite_master
    WHERE type = 'table' AND name = 'schema_migrations'
  `,
    )
    .get() as { present: number } | undefined
  if (!migrationTable) return [...migrations]

  const applied = new Set(
    db
      .prepare<[], AppliedVersionRow>('SELECT version FROM schema_migrations')
      .all()
      .map((row) => row.version),
  )
  return migrations.filter((migration) => !applied.has(migration.version))
}

export function runMigrations(
  db: Database.Database,
  migrations: readonly Migration[],
  logger: Logger = baseLogger,
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)

  const applied = new Set(
    db
      .prepare<[], AppliedVersionRow>('SELECT version FROM schema_migrations')
      .all()
      .map((row) => row.version),
  )

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue

    logger.info('db.migration-started', { version: migration.version, name: migration.name })
    const foreignKeys = db.pragma('foreign_keys', { simple: true }) as number
    const disableForeignKeys = migration.requiresForeignKeysDisabled === true
    if (disableForeignKeys && db.inTransaction) {
      throw new Error('Cannot disable foreign keys inside an existing transaction')
    }
    let failure: { error: unknown } | null = null
    try {
      if (disableForeignKeys) {
        db.pragma('foreign_keys = OFF')
        if (db.pragma('foreign_keys', { simple: true }) !== 0)
          throw new Error('Unable to disable foreign keys for migration')
      }
      db.transaction(() => {
        migration.up(db)
        // The migration may have rebuilt the ledger; prepare only after up has completed.
        const columns = db.pragma('table_info(schema_migrations)') as {
          name: string
          type: string
        }[]
        const numericLedger =
          columns.find((column) => column.name === 'applied_at')?.type.toUpperCase() === 'INTEGER'
        db.prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        ).run(migration.version, migration.name, numericLedger ? Date.now() : nowBeijing())
        if (disableForeignKeys) {
          if ((db.pragma('foreign_key_check') as unknown[]).length > 0)
            throw new Error('Foreign key verification failed after migration')
          if (db.pragma('integrity_check', { simple: true }) !== 'ok')
            throw new Error('Integrity verification failed after migration')
        }
      })()
    } catch (error) {
      failure = { error }
    }
    if (disableForeignKeys) {
      try {
        db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`)
        if (db.pragma('foreign_keys', { simple: true }) !== foreignKeys)
          throw new Error('Unable to restore foreign key enforcement')
      } catch (error) {
        // Preserve the migration failure if restoring the connection state also fails.
        if (failure) {
          logger.error('db.migration-foreign-keys-restore-failed', {
            version: migration.version,
            error,
          })
        } else {
          failure = { error }
        }
      }
    }
    if (failure) {
      logger.error('db.migration-failed', {
        version: migration.version,
        name: migration.name,
        error: failure.error,
      })
      throw failure.error
    }
    logger.info('db.migration-completed', { version: migration.version, name: migration.name })
  }
}
