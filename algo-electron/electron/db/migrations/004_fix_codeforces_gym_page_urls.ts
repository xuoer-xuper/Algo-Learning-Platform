import type Database from 'better-sqlite3'
import { nowBeijing } from '../../shared/time'
import { resolveCodeforcesNavigateUrl } from '../../adapters/codeforcesUrls'

/** 修正 gym 附件页等非单题 canonical_url */
export const migration004 = {
  version: 4,
  name: 'fix_codeforces_gym_page_urls',
  up: (db: Database.Database) => {
    const now = nowBeijing()
    const rows = db.prepare(`
      SELECT id, canonical_url FROM problems
      WHERE platform = 'codeforces' AND deleted_at IS NULL
    `).all() as { id: string; canonical_url: string }[]

    const update = db.prepare(
      'UPDATE problems SET canonical_url = ?, updated_at = ? WHERE id = ?'
    )

    for (const row of rows) {
      const fixed = resolveCodeforcesNavigateUrl(row.canonical_url)
      if (fixed !== row.canonical_url) {
        update.run(fixed, now, row.id)
      }
    }
  },
}
