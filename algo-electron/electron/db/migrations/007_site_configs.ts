import type Database from 'better-sqlite3'

export const migration007 = {
  version: 7,
  name: 'add_site_configs',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS site_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domains_json TEXT NOT NULL,
        home_url TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        problem_url_patterns_json TEXT,
        submit_url_patterns_json TEXT,
        cookie_policy TEXT,
        adapter TEXT,
        is_builtin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_site_configs_enabled ON site_configs(enabled);
    `)
  },
}
