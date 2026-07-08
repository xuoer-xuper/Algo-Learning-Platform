import type Database from 'better-sqlite3'

// 阶段 2：Coach 事件表
// 每次规则引擎产生的事件（idle_too_long / multiple_wrong / same_error / first_ac ...）
// 都落地为一条 coach_events 行，event_id 作为后续 coach_interventions.event_id 的外键来源。
// evidence 以 JSON 文本存储，便于阶段 3 HintSelector 扩展字段而无需 ALTER TABLE。
export const migration022 = {
  version: 22,
  name: 'coach_events',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS coach_events (
        event_id TEXT PRIMARY KEY,
        session_id TEXT,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        score INTEGER NOT NULL,
        problem_id TEXT,
        platform TEXT,
        evidence_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS coach_events_session_idx ON coach_events(session_id);
      CREATE INDEX IF NOT EXISTS coach_events_type_idx ON coach_events(event_type);
      CREATE INDEX IF NOT EXISTS coach_events_created_idx ON coach_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS coach_events_problem_idx ON coach_events(problem_id);
    `)
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP INDEX IF EXISTS coach_events_problem_idx;
      DROP INDEX IF EXISTS coach_events_created_idx;
      DROP INDEX IF EXISTS coach_events_type_idx;
      DROP INDEX IF EXISTS coach_events_session_idx;
      DROP TABLE IF EXISTS coach_events;
    `)
  },
}
