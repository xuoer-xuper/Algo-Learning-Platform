import { getDb } from '../../connection'
import { nowMillis, toLocalDay, localDayBounds } from '../../../shared/time'
import type { OverviewStats, PlatformDistributionRow } from '../../../../src/shared/types/stats'

export function getProblemCount(): number {
  const db = getDb()
  const row = db
    .prepare('SELECT COUNT(*) as count FROM problems WHERE deleted_at IS NULL')
    .get() as { count: number }
  return row.count
}

export function getPlatformDistribution(): PlatformDistributionRow[] {
  const db = getDb()
  return db
    .prepare(
      `
    SELECT platform, COUNT(*) as count
    FROM problems WHERE deleted_at IS NULL
    GROUP BY platform ORDER BY count DESC
  `,
    )
    .all() as PlatformDistributionRow[]
}

export function getTodayVisitedCount(): number {
  const db = getDb()
  const today = toLocalDay(nowMillis())
  const { start, end } = localDayBounds(today)
  const row = db
    .prepare(
      `
    SELECT COUNT(DISTINCT problem_id) as count
    FROM problem_visits
    WHERE entered_at >= ? AND entered_at < ?
  `,
    )
    .get(start, end) as { count: number }
  return row.count
}

export function getLastActiveTime(): number | null {
  const db = getDb()
  const row = db
    .prepare(
      `
    SELECT occurred_at FROM activity_events
    ORDER BY occurred_at DESC LIMIT 1
  `,
    )
    .get() as { occurred_at: number } | undefined
  return row?.occurred_at ?? null
}

export function getOverviewStats(): OverviewStats {
  return {
    totalProblems: getProblemCount(),
    todayVisited: getTodayVisitedCount(),
    platformDistribution: getPlatformDistribution(),
    lastActiveTime: getLastActiveTime(),
  }
}
