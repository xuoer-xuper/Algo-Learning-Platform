import type Database from 'better-sqlite3'

// Frozen pre-A4a functions. Keep SQL and return logic independent of production builders/types.
interface OriginalPlatformDistribution {
  platform: string
  count: number
}

interface OriginalProblemVisitStat {
  total_visits: number
  total_duration: number
  total_active: number
  avg_duration: number
}

export function getOriginalStatsPlatformDistribution(
  db: Database.Database,
): OriginalPlatformDistribution[] {
  return db
    .prepare<[], OriginalPlatformDistribution>(
      `
    SELECT platform, COUNT(*) as count
    FROM problems WHERE deleted_at IS NULL
    GROUP BY platform ORDER BY count DESC
  `,
    )
    .all()
}

export function getOriginalStatsProblemVisits(
  db: Database.Database,
  problemId: string,
): OriginalProblemVisitStat {
  const row = db
    .prepare<[string], OriginalProblemVisitStat>(
      `
    SELECT
      COUNT(*) as total_visits,
      COALESCE(SUM(duration_seconds), 0) as total_duration,
      COALESCE(SUM(active_seconds), 0) as total_active,
      COALESCE(AVG(duration_seconds), 0) as avg_duration
    FROM problem_visits
    WHERE problem_id = ?
  `,
    )
    .get(problemId)
  if (row === undefined) throw new Error('Original visit aggregate returned no row')
  return row
}

export function getOriginalStatsLastActive(db: Database.Database): number | null {
  const row = db
    .prepare<[], { occurred_at: number }>(
      `
    SELECT occurred_at FROM activity_events
    ORDER BY occurred_at DESC LIMIT 1
  `,
    )
    .get()
  return row?.occurred_at ?? null
}
