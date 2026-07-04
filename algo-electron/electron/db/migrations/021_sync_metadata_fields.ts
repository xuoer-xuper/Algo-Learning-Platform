import type Database from 'better-sqlite3'

// P7-002: 核心表同步字段预留
// 对历史表只追加 nullable 字段，避免改变现有业务语义。
export const migration021 = {
  version: 21,
  name: 'sync_metadata_fields',
  up: (db: Database.Database) => {
    addColumnIfMissing(db, 'submissions', 'deleted_at', 'TEXT')
    addColumnIfMissing(db, 'problem_visits', 'deleted_at', 'TEXT')
    addColumnIfMissing(db, 'activity_events', 'updated_at', 'TEXT')
    addColumnIfMissing(db, 'activity_events', 'deleted_at', 'TEXT')
    addColumnIfMissing(db, 'study_sessions', 'deleted_at', 'TEXT')
    addColumnIfMissing(db, 'user_daily_stats', 'deleted_at', 'TEXT')
    addColumnIfMissing(db, 'platform_accounts', 'deleted_at', 'TEXT')
    addColumnIfMissing(db, 'rating_history', 'updated_at', 'TEXT')
    addColumnIfMissing(db, 'rating_history', 'deleted_at', 'TEXT')
    addColumnIfMissing(db, 'contest_results', 'updated_at', 'TEXT')
    addColumnIfMissing(db, 'contest_results', 'deleted_at', 'TEXT')
    addColumnIfMissing(db, 'site_configs', 'deleted_at', 'TEXT')
    addColumnIfMissing(db, 'user_scripts', 'deleted_at', 'TEXT')
    addColumnIfMissing(db, 'notes', 'deleted_at', 'TEXT')
    addColumnIfMissing(db, 'ai_context_snapshots', 'updated_at', 'TEXT')
    addColumnIfMissing(db, 'ai_context_snapshots', 'deleted_at', 'TEXT')
    addColumnIfMissing(db, 'ai_outputs', 'deleted_at', 'TEXT')

    db.exec(`
      UPDATE activity_events SET updated_at = created_at WHERE updated_at IS NULL;
      UPDATE rating_history SET updated_at = created_at WHERE updated_at IS NULL;
      UPDATE contest_results SET updated_at = created_at WHERE updated_at IS NULL;
      UPDATE ai_context_snapshots SET updated_at = created_at WHERE updated_at IS NULL;
    `)
  },
  down: (_db: Database.Database) => {
    // SQLite drop column support depends on runtime version; keep additive fields.
  },
}

function addColumnIfMissing(
  db: Database.Database,
  tableName: string,
  columnName: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
  if (columns.some(column => column.name === columnName)) return
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`)
}
