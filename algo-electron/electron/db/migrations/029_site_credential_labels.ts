import type Database from 'better-sqlite3'

export const migration029 = {
  version: 29,
  name: 'site_credential_labels',
  up: (db: Database.Database) => {
    addColumnIfMissing(db, 'site_credentials', 'display_name', 'TEXT')
  },
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (columns.some(entry => entry.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}
