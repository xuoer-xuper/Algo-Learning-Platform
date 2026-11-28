import type Database from 'better-sqlite3'
import { localDayBounds, nowMillis, toLocalDay } from '../../src/shared/time'

// Frozen pre-A4b2 helper, independent of the production nullable narrowing.
export function originalDayDiff(laterDay: string, earlierDay: string): number {
  // Calendar ordinals avoid 23/25-hour DST days changing a streak.
  localDayBounds(laterDay)
  localDayBounds(earlierDay)
  return (Date.parse(`${laterDay}T00:00:00Z`) - Date.parse(`${earlierDay}T00:00:00Z`)) / 86_400_000
}

// Exercise baseline runtime NULLs without widening the frozen helper signature.
export function invokeOriginalDayDiff(laterDay: string | null, earlierDay: string | null): number {
  const result: unknown = Reflect.apply(originalDayDiff, undefined, [laterDay, earlierDay])
  if (typeof result !== 'number') throw new Error('Original dayDiff did not return a number')
  return result
}

const dayDiff = invokeOriginalDayDiff

// Frozen SQL and loops; only DB injection and truthful local row typing differ.
export function getOriginalStreakDays(db: Database.Database): { current: number; longest: number } {
  const rows = db
    .prepare<[], { local_day: string | null }>(
      `
    SELECT local_day FROM user_daily_stats
    WHERE active_seconds >= 300 OR submission_count > 0 OR solved_problem_count > 0
    ORDER BY local_day DESC
  `,
    )
    .all()

  if (rows.length === 0) return { current: 0, longest: 0 }

  let longest = 1
  let streak = 1
  for (let i = 1; i < rows.length; i++) {
    if (dayDiff(rows[i - 1].local_day, rows[i].local_day) === 1) {
      streak++
    } else {
      if (streak > longest) longest = streak
      streak = 1
    }
  }
  if (streak > longest) longest = streak

  if (rows[0].local_day !== toLocalDay(nowMillis())) {
    return { current: 0, longest }
  }

  let current = 1
  for (let i = 1; i < rows.length; i++) {
    if (dayDiff(rows[i - 1].local_day, rows[i].local_day) === 1) {
      current++
    } else {
      break
    }
  }

  return { current, longest }
}
