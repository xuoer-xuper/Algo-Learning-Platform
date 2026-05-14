import type Database from 'better-sqlite3'

export const migration002 = {
  version: 2,
  name: 'add_submissions_table',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE submissions (
        id TEXT PRIMARY KEY,
        problem_id TEXT,
        platform TEXT NOT NULL,
        platform_submission_id TEXT NOT NULL,
        verdict TEXT NOT NULL,
        raw_verdict TEXT,
        language TEXT,
        submitted_at TEXT NOT NULL,
        is_first_ac INTEGER NOT NULL DEFAULT 0,
        runtime_ms INTEGER,
        memory_kb INTEGER,
        source_url TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (problem_id) REFERENCES problems(id)
      );

      CREATE UNIQUE INDEX idx_submissions_platform_id ON submissions(platform, platform_submission_id);
      CREATE INDEX idx_submissions_problem_time ON submissions(problem_id, submitted_at);
      CREATE INDEX idx_submissions_verdict ON submissions(verdict);
      CREATE INDEX idx_submissions_submitted_at ON submissions(submitted_at);
    `)
  },
}
