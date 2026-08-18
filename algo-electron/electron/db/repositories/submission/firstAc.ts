import { getDb } from '../../connection'
import { nowBeijing } from '../../../shared/time'
import type { FirstAcRow } from './types'
import { localDayFromTimestamp } from '../stats/date'

export function updateFirstAc(problemId: string): string[] {
  const db = getDb()
  const now = nowBeijing()
  const existing = db.prepare(`
    SELECT first_solved_at FROM problems WHERE id = ?
  `).get(problemId) as { first_solved_at: string | null } | undefined

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

  const affectedDays = new Set<string>()
  const previousDay = existing?.first_solved_at
    ? localDayFromTimestamp(existing.first_solved_at)
    : null
  const nextDay = firstAc ? localDayFromTimestamp(firstAc.submitted_at) : null
  if (previousDay) affectedDays.add(previousDay)
  if (nextDay) affectedDays.add(nextDay)
  return Array.from(affectedDays)
}
