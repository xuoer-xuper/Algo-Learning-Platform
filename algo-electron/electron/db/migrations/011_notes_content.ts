import { Database } from 'better-sqlite3'

export const migration011 = {
  version: 11,
  name: 'notes_add_content_cache',
  up: (db: Database) => {
    try {
      // 缓存 Markdown 正文，用于快速预览和搜索，避免每次读文件
      db.exec(`ALTER TABLE notes ADD COLUMN content TEXT NOT NULL DEFAULT '';`)
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) throw e
    }
    try {
      db.exec(`ALTER TABLE notes ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0;`)
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) throw e
    }
    db.exec(`CREATE INDEX IF NOT EXISTS notes_updated_at ON notes(updated_at);`)
  },
  down: (_db: Database) => {
    // SQLite 旧版不支持 DROP COLUMN，保留字段
  }
}
