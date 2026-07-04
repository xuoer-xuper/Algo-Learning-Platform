import type Database from 'better-sqlite3'

// P7-001: 未来同步队列
// 当前只作为本地预留，不自动上传任何数据。
export const migration020 = {
  version: 20,
  name: 'sync_queue',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payload_hash TEXT,
        created_at TEXT NOT NULL,
        synced_at TEXT,
        error_message TEXT
      );
      CREATE INDEX IF NOT EXISTS sync_queue_status_created_idx ON sync_queue(status, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS sync_queue_entity_operation_created_idx
        ON sync_queue(entity_type, entity_id, operation, created_at);
    `)
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP INDEX IF EXISTS sync_queue_entity_operation_created_idx;
      DROP INDEX IF EXISTS sync_queue_status_created_idx;
      DROP TABLE IF EXISTS sync_queue;
    `)
  },
}
