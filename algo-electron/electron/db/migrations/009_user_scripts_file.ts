import { Database } from 'better-sqlite3'
import { errorMessage } from '../../shared/errors'

/**
 * 只吞"列已存在"这一种错误，其余原样抛出交给迁移执行器回滚。
 *
 * 用 `errorMessage` 而不是直接读 `e.message`：抛非 `Error` 时 `e.message.includes`
 * 自己会抛 TypeError，把真正的迁移失败原因替换成"读不到 undefined 的属性"。
 *
 * 021 之后的迁移改用 `PRAGMA table_info` 预检，比匹配错误文本可靠。这里保持原机制不动
 * ——已经在用户库上执行过的迁移是历史记录，只修类型不改行为。
 */
function ignoreDuplicateColumn(error: unknown): void {
  if (!errorMessage(error).includes('duplicate column name')) throw error
}

export const migration009 = {
  version: 9,
  name: 'user_scripts_add_file_path',
  up: (db: Database) => {
    try {
      db.exec(`ALTER TABLE user_scripts ADD COLUMN file_path TEXT;`);
    } catch (error: unknown) {
      ignoreDuplicateColumn(error)
    }
    try {
      db.exec(`ALTER TABLE user_scripts ADD COLUMN site_ids_json TEXT DEFAULT '[]';`);
    } catch (error: unknown) {
      ignoreDuplicateColumn(error)
    }
  },
  down: (_db: Database) => {
    // SQLite doesn't easily drop columns before version 3.35, but it's safe to just ignore down for this simple field add in our dev stage
  }
}
