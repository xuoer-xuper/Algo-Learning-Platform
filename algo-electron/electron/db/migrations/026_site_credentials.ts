import type Database from 'better-sqlite3'

export const migration026 = {
  version: 26,
  name: 'site_credentials',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS site_credentials (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        username TEXT NOT NULL,
        secret_envelope TEXT,
        last_used_at TEXT,
        sync_excluded INTEGER NOT NULL DEFAULT 1 CHECK (sync_excluded = 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        UNIQUE(site_id, username),
        FOREIGN KEY(site_id) REFERENCES site_configs(id) ON DELETE CASCADE,
        CHECK (
          (deleted_at IS NULL AND secret_envelope IS NOT NULL
            AND json_valid(secret_envelope) = 1
            AND json_extract(secret_envelope, '$.version') = 1
            AND json_extract(secret_envelope, '$.provider') = 'electron-safe-storage')
          OR
          (deleted_at IS NOT NULL AND secret_envelope IS NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS site_credentials_active_site_idx
        ON site_credentials(site_id, deleted_at);
      CREATE INDEX IF NOT EXISTS site_credentials_last_used_idx
        ON site_credentials(last_used_at DESC);
    `)
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP INDEX IF EXISTS site_credentials_last_used_idx;
      DROP INDEX IF EXISTS site_credentials_active_site_idx;
      DROP TABLE IF EXISTS site_credentials;
    `)
  },
}
