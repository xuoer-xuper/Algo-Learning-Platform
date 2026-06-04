import { Database } from 'better-sqlite3'

export const migration008 = {
  version: 8,
  name: 'add_user_scripts',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_scripts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        version TEXT,
        match_urls_json TEXT NOT NULL,
        code TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  },
  down: (db: Database) => {
    db.exec(`
      DROP TABLE IF EXISTS user_scripts;
    `)
  }
}
