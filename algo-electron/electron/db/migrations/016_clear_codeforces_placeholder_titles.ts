import type Database from 'better-sqlite3'
import { isBadScrapedTitle } from '../../parsers/titleValidation'
import { nowBeijing } from '../../shared/time'

/** 清理 Codeforces 标签页误写入的占位题名，例如 "Problem - E" */
export const migration016 = {
  version: 16,
  name: 'clear_codeforces_placeholder_titles',
  up: (db: Database.Database) => {
    const rows = db.prepare(`
      SELECT id, title FROM problems
      WHERE platform = 'codeforces'
        AND title IS NOT NULL
        AND deleted_at IS NULL
    `).all() as { id: string; title: string | null }[]

    const update = db.prepare('UPDATE problems SET title = NULL, updated_at = ? WHERE id = ?')
    const now = nowBeijing()

    for (const row of rows) {
      if (isBadScrapedTitle(row.title)) {
        update.run(now, row.id)
      }
    }
  },
}
