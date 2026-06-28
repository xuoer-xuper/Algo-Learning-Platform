import type Database from 'better-sqlite3'

// P6-004 扩展：每日 AI 上下文快照
// 应用启动时（首次当日打开）自动生成一份快照存库，供 AI 模块按需消费
// 避免每次调用都重新聚合统计，同时沉淀历史轨迹供阶段总结使用
export const migration014 = {
  version: 14,
  name: 'ai_context_snapshots',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_context_snapshots (
        id TEXT PRIMARY KEY,
        snapshot_date TEXT NOT NULL UNIQUE,
        context_json TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS snapshots_date_unique ON ai_context_snapshots(snapshot_date);
    `)
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP INDEX IF EXISTS snapshots_date_unique;
      DROP TABLE IF EXISTS ai_context_snapshots;
    `)
  },
}
