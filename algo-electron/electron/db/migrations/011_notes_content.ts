import { Database } from 'better-sqlite3'
import { errorMessage } from '../../shared/errors'

/** 同 009：只吞"列已存在"，其余抛出。见 `009_user_scripts_file.ts` 里的完整说明。 */
function ignoreDuplicateColumn(error: unknown): void {
  if (!errorMessage(error).includes('duplicate column name')) throw error
}

export const migration011 = {
  version: 11,
  name: 'notes_add_content_cache',
  up: (db: Database) => {
    try {
      // 缓存 Markdown 正文，用于快速预览和搜索，避免每次读文件
      db.exec(`ALTER TABLE notes ADD COLUMN content TEXT NOT NULL DEFAULT '';`)
    } catch (error: unknown) {
      ignoreDuplicateColumn(error)
    }
    try {
      db.exec(`ALTER TABLE notes ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0;`)
    } catch (error: unknown) {
      ignoreDuplicateColumn(error)
    }
    db.exec(`CREATE INDEX IF NOT EXISTS notes_updated_at ON notes(updated_at);`)
  },
  down: (_db: Database) => {
    // SQLite 旧版不支持 DROP COLUMN，保留字段
  }
}
