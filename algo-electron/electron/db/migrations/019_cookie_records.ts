import type Database from 'better-sqlite3'

// P1-015: Cookie 本地保存策略
// 只保存 Cookie 元数据，完整 Cookie 值仍由 Electron 持久 session 持有。
export const migration019 = {
  version: 19,
  name: 'cookie_records',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cookie_records (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        name TEXT NOT NULL,
        value_encrypted TEXT,
        expires_at TEXT,
        http_only INTEGER NOT NULL DEFAULT 0,
        secure INTEGER NOT NULL DEFAULT 0,
        same_site TEXT,
        last_seen_at TEXT NOT NULL,
        purpose TEXT,
        sync_excluded INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(site_id, domain, name)
      );
      CREATE INDEX IF NOT EXISTS cookie_records_site_idx ON cookie_records(site_id);
      CREATE INDEX IF NOT EXISTS cookie_records_domain_idx ON cookie_records(domain);
      CREATE INDEX IF NOT EXISTS cookie_records_expires_at_idx ON cookie_records(expires_at);
    `)
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP INDEX IF EXISTS cookie_records_expires_at_idx;
      DROP INDEX IF EXISTS cookie_records_domain_idx;
      DROP INDEX IF EXISTS cookie_records_site_idx;
      DROP TABLE IF EXISTS cookie_records;
    `)
  },
}
