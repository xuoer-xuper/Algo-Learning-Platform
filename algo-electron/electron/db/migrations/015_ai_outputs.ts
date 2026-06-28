import type Database from 'better-sqlite3'

// P6-009: AI 输出本地保存
// 保存 AI 生成的阶段总结、复习计划、复习建议等结果到 ai_outputs 表
// 保留生成时间、输入摘要和版本，便于回溯
export const migration015 = {
  version: 15,
  name: 'ai_outputs',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_outputs (
        id TEXT PRIMARY KEY,
        output_type TEXT NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        content_markdown TEXT,
        input_summary_json TEXT,
        source_refs_json TEXT,
        model_info_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ai_outputs_type_idx ON ai_outputs(output_type);
      CREATE INDEX IF NOT EXISTS ai_outputs_created_idx ON ai_outputs(created_at DESC);
    `)
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP INDEX IF EXISTS ai_outputs_created_idx;
      DROP INDEX IF EXISTS ai_outputs_type_idx;
      DROP TABLE IF EXISTS ai_outputs;
    `)
  },
}
