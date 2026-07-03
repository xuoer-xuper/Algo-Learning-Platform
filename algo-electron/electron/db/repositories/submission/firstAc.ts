import { getDb } from '../../connection'
import { nowBeijing } from '../../../shared/time'
import type { FirstAcRow } from './types'

export function updateFirstAc(problemId: string): void {
  const db = getDb()
  const now = nowBeijing()

  const firstAc = db.prepare(`
    SELECT submitted_at FROM submissions
    WHERE problem_id = ? AND verdict = 'AC'
    ORDER BY submitted_at ASC LIMIT 1
  `).get(problemId) as FirstAcRow | undefined

  if (firstAc) {
    db.prepare(`
      UPDATE problems SET status = 'solved', first_solved_at = ?, updated_at = ?
      WHERE id = ? AND (first_solved_at IS NULL OR first_solved_at > ?)
    `).run(firstAc.submitted_at, now, problemId, firstAc.submitted_at)
  }
}
