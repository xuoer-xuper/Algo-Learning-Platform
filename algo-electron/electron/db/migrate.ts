import type Database from 'better-sqlite3'
import { nowBeijing } from '../shared/time'

interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

export function runMigrations(db: Database.Database, migrations: Migration[]): void {
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

    db.transaction(() => {
      migration.up(db)
      insertMigration.run(migration.version, migration.name, nowBeijing())
    })()
  }
}
