import { and, count, countDistinct, desc, gte, isNull, lt } from 'drizzle-orm'
import { getDb } from '../../connection'
import { nowMillis, toLocalDay, localDayBounds } from '../../../shared/time'
import { createDrizzleClient } from '../../../../src/main/db/client'
import { activityEvents, problems, problemVisits } from '../../../../src/main/db/schema'
import type { OverviewStats, PlatformDistributionRow } from '../../../../src/shared/types/stats'

export function getProblemCount(): number {
  const db = createDrizzleClient(getDb())
  const row = db.select({ count: count() }).from(problems).where(isNull(problems.deleted_at)).get()
  return row?.count ?? 0
}

export function getPlatformDistribution(): PlatformDistributionRow[] {
  const db = createDrizzleClient(getDb())
  return db
    .select({ platform: problems.platform, count: count() })
    .from(problems)
    .where(isNull(problems.deleted_at))
    .groupBy(problems.platform)
    .orderBy(desc(count()))
    .all()
}

export function getTodayVisitedCount(): number {
  const db = createDrizzleClient(getDb())
  const today = toLocalDay(nowMillis())
  const { start, end } = localDayBounds(today)
  const row = db
    .select({ count: countDistinct(problemVisits.problem_id) })
    .from(problemVisits)
    .where(
      and(
        gte(problemVisits.entered_at, new Date(start)),
        lt(problemVisits.entered_at, new Date(end)),
      ),
    )
    .get()
  return row?.count ?? 0
}

export function getLastActiveTime(): number | null {
  const db = createDrizzleClient(getDb())
  const row = db
    .select({ occurred_at: activityEvents.occurred_at })
    .from(activityEvents)
    .orderBy(desc(activityEvents.occurred_at))
    .limit(1)
    .get()
  return row?.occurred_at.getTime() ?? null
}

export function getOverviewStats(): OverviewStats {
  return {
    totalProblems: getProblemCount(),
    todayVisited: getTodayVisitedCount(),
    platformDistribution: getPlatformDistribution(),
    lastActiveTime: getLastActiveTime(),
  }
}
