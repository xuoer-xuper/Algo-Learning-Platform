import type Database from 'better-sqlite3'

export const migration006 = {
  version: 6,
  name: 'add_rating_tables',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS platform_accounts (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        handle TEXT NOT NULL,
        display_name TEXT,
        current_rating INTEGER,
        peak_rating INTEGER,
        last_synced_at TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_accounts_handle
        ON platform_accounts(platform, handle);

      CREATE TABLE IF NOT EXISTS rating_history (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        contest_id TEXT,
        contest_name TEXT,
        rank INTEGER,
        rating_before INTEGER,
        rating_after INTEGER,
        delta INTEGER,
        contest_at TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_rating_history_account_time
        ON rating_history(account_id, contest_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_rating_history_unique
        ON rating_history(platform, account_id, contest_id);

      CREATE TABLE IF NOT EXISTS contest_results (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        contest_id TEXT NOT NULL,
        contest_name TEXT,
        account_id TEXT,
        rank INTEGER,
        solved_count INTEGER,
        penalty INTEGER,
        rating_delta INTEGER,
        contest_at TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_contest_results_account_time
        ON contest_results(account_id, contest_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_contest_results_unique
        ON contest_results(platform, contest_id, account_id);
    `)
  },
}
