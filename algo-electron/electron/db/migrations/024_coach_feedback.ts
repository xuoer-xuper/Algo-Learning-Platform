import type Database from 'better-sqlite3'

// 阶段 2：Coach 用户反馈表
// 持久化用户对每次提示的反馈（helpful / not_helpful / dismiss / never_today），
// 影响后续同类型提示频率与"今天别提醒"临时屏蔽。
// 阶段 1 仅 console.log；阶段 2 落库供规则引擎读取。
export const migration024 = {
  version: 24,
  name: 'coach_feedback',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS coach_feedback (
        feedback_id TEXT PRIMARY KEY,
        intervention_id TEXT,
        bubble_id TEXT,
        feedback_type TEXT NOT NULL,
        event_type TEXT,
        problem_id TEXT,
        local_day TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS coach_feedback_intervention_idx ON coach_feedback(intervention_id);
      CREATE INDEX IF NOT EXISTS coach_feedback_type_idx ON coach_feedback(feedback_type);
      CREATE INDEX IF NOT EXISTS coach_feedback_day_idx ON coach_feedback(local_day);
    `)
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP INDEX IF EXISTS coach_feedback_day_idx;
      DROP INDEX IF EXISTS coach_feedback_type_idx;
      DROP INDEX IF EXISTS coach_feedback_intervention_idx;
      DROP TABLE IF EXISTS coach_feedback;
    `)
  },
}
