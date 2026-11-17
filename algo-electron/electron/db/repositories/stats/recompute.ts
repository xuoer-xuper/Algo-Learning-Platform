import { getDb } from '../../connection'
import { nowMillis, toLocalDay } from '../../../shared/time'
import { emitDataChanged } from '../../../shared/dataEvents'
import { recomputeDailyStatsAt, recomputeAllDailyStatsAt } from './recompute-core'

export function recomputeDailyStats(date?: string): void {
  recomputeDailyStatsAt(getDb(), date ?? toLocalDay(nowMillis()), nowMillis())
  emitDataChanged(['stats'])
}

export function recomputeDailyStatsForDates(dates: Iterable<string>): number {
  const uniqueDates = [...new Set(dates)].sort()
  for (const date of uniqueDates) recomputeDailyStats(date)
  return uniqueDates.length
}

export function recomputeAllDailyStats(): number {
  const count = recomputeAllDailyStatsAt(getDb(), nowMillis())
  if (count > 0) emitDataChanged(['stats'])
  return count
}
