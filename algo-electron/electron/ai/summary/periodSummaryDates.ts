import type { PeriodType } from './periodSummaryTypes'
import { shiftLocalDay } from '../../shared/time'

export function countInclusiveDays(start: string, end: string): number {
  // Day labels are calendar keys; UTC ordinals avoid 23/25-hour DST days.
  const startDay = shiftLocalDay(start, 0)
  const endDay = shiftLocalDay(end, 0)
  return (Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`)) / 86400000 + 1
}

export function getPreviousPeriod(
  start: string,
  end: string,
): { prevStart: string; prevEnd: string } {
  const days = countInclusiveDays(start, end)
  return {
    prevStart: shiftLocalDay(start, -days),
    prevEnd: shiftLocalDay(start, -1),
  }
}

export function getPeriodType(days: number): PeriodType {
  if (days === 7) return 'weekly'
  if (days === 30 || days === 31) return 'monthly'
  return 'custom'
}
