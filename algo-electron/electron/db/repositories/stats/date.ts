import { localDayBounds, nowMillis, shiftLocalDay, toLocalDay } from '../../../../src/shared/time'

export function localDateDaysAgo(days: number): string {
  return shiftLocalDay(toLocalDay(nowMillis()), -days)
}

export function formatLocalDate(date: Date): string {
  return toLocalDay(date.getTime())
}

export function nextLocalDay(day: string): string {
  return shiftLocalDay(day, 1)
}

export function localDayFromTimestamp(timestamp: number): string | null {
  try {
    return toLocalDay(timestamp)
  } catch {
    return null
  }
}

export function dayDiff(laterDay: string, earlierDay: string): number {
  // Calendar ordinals avoid 23/25-hour DST days changing a streak.
  localDayBounds(laterDay)
  localDayBounds(earlierDay)
  return (Date.parse(`${laterDay}T00:00:00Z`) - Date.parse(`${earlierDay}T00:00:00Z`)) / 86_400_000
}
