import type Database from 'better-sqlite3'
import { nowMillis } from '../shared/time'
import { emitDataChanged } from '../shared/dataEvents'

export const ORPHAN_VISIT_LEAVE_REASON = 'startup_recovery'

export function closeOrphanProblemVisits(
  database: Database.Database,
  updatedAt: number = nowMillis(),
): number {
  const result = database
    .prepare(
      `
    UPDATE problem_visits
    SET left_at = entered_at,
        duration_seconds = 0,
        active_seconds = 0,
        leave_reason = ?,
        updated_at = ?
    WHERE left_at IS NULL
  `,
    )
    .run(ORPHAN_VISIT_LEAVE_REASON, updatedAt)
  if (result.changes > 0) emitDataChanged(['problems', 'stats'])
  return result.changes
}
