import type Database from 'better-sqlite3'
import { nowBeijing } from '../../shared/time'

/** 将误存为 /contest/ 的 CF 链接改为 problemset（兼容 gym 与 API 导入） */
export const migration003 = {
  version: 3,
  name: 'fix_codeforces_canonical_urls',
  up: (db: Database.Database) => {
    const now = nowBeijing()
    db.prepare(`
      UPDATE problems
      SET canonical_url = 'https://codeforces.com/problemset/problem/' || contest_id || '/' || problem_index,
          updated_at = ?
      WHERE platform = 'codeforces'
        AND contest_id IS NOT NULL
        AND problem_index IS NOT NULL
        AND canonical_url LIKE 'https://codeforces.com/contest/%'
    `).run(now)
  },
}
