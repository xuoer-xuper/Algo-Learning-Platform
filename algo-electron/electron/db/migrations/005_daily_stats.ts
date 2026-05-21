import type Database from 'better-sqlite3'

export const migration005 = {
  version: 5,
  name: 'add_user_daily_stats',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_daily_stats (
        local_day TEXT PRIMARY KEY,
        active_seconds INTEGER NOT NULL DEFAULT 0,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        visited_problem_count INTEGER NOT NULL DEFAULT 0,
        solved_problem_count INTEGER NOT NULL DEFAULT 0,
        submission_count INTEGER NOT NULL DEFAULT 0,
        ac_submission_count INTEGER NOT NULL DEFAULT 0,
        platform_distribution_json TEXT,
        recomputed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_user_daily_stats_recomputed
        ON user_daily_stats(recomputed_at);
    `)
  },
}
