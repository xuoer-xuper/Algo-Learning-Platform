import type Database from 'better-sqlite3'

export const migration001 = {
  version: 1,
  name: 'initial_schema',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE problems (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        platform_problem_id TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        title TEXT,
        status TEXT NOT NULL DEFAULT 'unknown',
        contest_id TEXT,
        problem_index TEXT,
        source_platform TEXT,
        source_problem_id TEXT,
        difficulty TEXT,
        tags_json TEXT,
        first_seen_at TEXT NOT NULL,
        last_visited_at TEXT,
        first_solved_at TEXT,
        extra_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE UNIQUE INDEX idx_problems_platform_id ON problems(platform, platform_problem_id);
      CREATE INDEX idx_problems_last_visited ON problems(last_visited_at);
      CREATE INDEX idx_problems_status ON problems(status);
      CREATE INDEX idx_problems_source ON problems(source_platform, source_problem_id);

      CREATE TABLE problem_visits (
        id TEXT PRIMARY KEY,
        problem_id TEXT NOT NULL,
        session_id TEXT,
        platform TEXT NOT NULL,
        url TEXT NOT NULL,
        entered_at TEXT NOT NULL,
        left_at TEXT,
        duration_seconds INTEGER,
        active_seconds INTEGER,
        leave_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (problem_id) REFERENCES problems(id)
      );

      CREATE INDEX idx_pv_problem_time ON problem_visits(problem_id, entered_at);
      CREATE INDEX idx_pv_session ON problem_visits(session_id);
      CREATE INDEX idx_pv_entered ON problem_visits(entered_at);

      CREATE TABLE activity_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        local_day TEXT NOT NULL,
        session_id TEXT,
        problem_id TEXT,
        platform TEXT,
        url TEXT,
        payload_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_ae_time ON activity_events(occurred_at);
      CREATE INDEX idx_ae_type_time ON activity_events(event_type, occurred_at);
      CREATE INDEX idx_ae_local_day ON activity_events(local_day);
      CREATE INDEX idx_ae_problem ON activity_events(problem_id);

      CREATE TABLE study_sessions (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_seconds INTEGER,
        active_seconds INTEGER,
        main_platform TEXT,
        end_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_ss_started ON study_sessions(started_at);
      CREATE INDEX idx_ss_ended ON study_sessions(ended_at);
    `)
  },
}
