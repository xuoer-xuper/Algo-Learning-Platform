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

/** Imports can replace or move an AC, unlike the append-only submission writer. */
export function recomputeProblemSubmissionState(problemIds: Iterable<string>): string[] {
  const db = getDb()
  const now = nowBeijing()
  const findProblem = db.prepare('SELECT status, first_solved_at FROM problems WHERE id = ?')
  const aggregate = db.prepare(`
    SELECT COUNT(*) AS total,
      MIN(CASE WHEN verdict = 'AC' THEN submitted_at END) AS first_ac
    FROM submissions WHERE problem_id = ?
  `)
  const update = db.prepare(`
    UPDATE problems SET status = ?, first_solved_at = ?, updated_at = ?
    WHERE id = ? AND (status IS NOT ? OR first_solved_at IS NOT ?)
  `)
  const affectedDates = new Set<string>()

  for (const problemId of new Set(problemIds)) {
    const existing = findProblem.get(problemId) as {
      status: string; first_solved_at: string | null
    } | undefined
    if (!existing) continue
    const submissions = aggregate.get(problemId) as { total: number; first_ac: string | null }
    const status = submissions.first_ac ? 'solved'
      : submissions.total > 0 ? 'attempted'
        : existing.status === 'unknown' ? 'unknown' : 'visited'
    update.run(status, submissions.first_ac, now, problemId, status, submissions.first_ac)
    for (const timestamp of [existing.first_solved_at, submissions.first_ac]) {
      const date = timestamp ? localDayFromTimestamp(timestamp) : null
      if (date) affectedDates.add(date)
    }
  }
  return [...affectedDates]
}
