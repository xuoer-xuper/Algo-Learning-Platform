import type Database from 'better-sqlite3'

// 阶段 2：Coach 干预与比赛模式审计表
// 同一张表同时承载：
// 1. 普通干预记录（source_type = local_rule / local_hint / llm）
// 2. 比赛模式审计日志（source_type = 'contest_audit'，记录"零介入"事实）
//
// 比赛模式审计字段（is_contest_mode / contest_url / contest_start / contest_end / zero_intervention）
// 对普通干预为 NULL/0，对 contest_audit 记录填充。这是合规卖点：审计日志可导出，
// 证明比赛期间"零介入"。
export const migration023 = {
  version: 23,
  name: 'coach_interventions',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS coach_interventions (
        intervention_id TEXT PRIMARY KEY,
        event_id TEXT,
        trigger_reason TEXT NOT NULL,
        intervention_level INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        message TEXT NOT NULL,
        related_tags_json TEXT,
        user_action TEXT NOT NULL,
        problem_id TEXT,
        platform TEXT,
        session_id TEXT,
        created_at TEXT NOT NULL,
        is_contest_mode INTEGER NOT NULL DEFAULT 0,
        contest_url TEXT,
        contest_start TEXT,
        contest_end TEXT,
        zero_intervention INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS coach_interventions_event_idx ON coach_interventions(event_id);
      CREATE INDEX IF NOT EXISTS coach_interventions_source_idx ON coach_interventions(source_type);
      CREATE INDEX IF NOT EXISTS coach_interventions_contest_idx ON coach_interventions(is_contest_mode, contest_url);
      CREATE INDEX IF NOT EXISTS coach_interventions_created_idx ON coach_interventions(created_at DESC);
    `)
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP INDEX IF EXISTS coach_interventions_created_idx;
      DROP INDEX IF EXISTS coach_interventions_contest_idx;
      DROP INDEX IF EXISTS coach_interventions_source_idx;
      DROP INDEX IF EXISTS coach_interventions_event_idx;
      DROP TABLE IF EXISTS coach_interventions;
    `)
  },
}
