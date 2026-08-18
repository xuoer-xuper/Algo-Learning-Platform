import type Database from 'better-sqlite3'
import { nowBeijing } from '../shared/time'
import { appLogger, type Logger } from '../shared/logger'

export interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

export function getPendingMigrations(
  db: Database.Database,
  migrations: readonly Migration[],
): Migration[] {
  const migrationTable = db.prepare(`
    SELECT 1 as present
    FROM sqlite_master
    WHERE type = 'table' AND name = 'schema_migrations'
  `).get() as { present: number } | undefined
  if (!migrationTable) return [...migrations]

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row: any) => row.version),
  )
  return migrations.filter(migration => !applied.has(migration.version))
}

export function runMigrations(
  db: Database.Database,
  migrations: readonly Migration[],
  logger: Logger = appLogger,
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r: any) => r.version)
  )

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  )

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue

    logger.info('db.migration-started', { version: migration.version, name: migration.name })
    try {
      db.transaction(() => {
        migration.up(db)
        insertMigration.run(migration.version, migration.name, nowBeijing())
      })()
      logger.info('db.migration-completed', { version: migration.version, name: migration.name })
    } catch (error) {
      logger.error('db.migration-failed', { version: migration.version, name: migration.name, error })
      throw error
    }
  }
}
