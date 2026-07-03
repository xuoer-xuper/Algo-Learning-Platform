import type { PeriodType } from './periodSummaryTypes'

export function countInclusiveDays(start: string, end: string): number {
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1
}

export function getPreviousPeriod(start: string, end: string): { prevStart: string; prevEnd: string } {
  const startDate = new Date(`${start}T00:00:00`)
  const days = countInclusiveDays(start, end)
  const prevEnd = new Date(startDate.getTime() - 86400000)
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000)
  return {
    prevStart: formatLocalDate(prevStart),
    prevEnd: formatLocalDate(prevEnd),
  }
}

export function getPeriodType(days: number): PeriodType {
  if (days === 7) return 'weekly'
  if (days === 30 || days === 31) return 'monthly'
  return 'custom'
}

function formatLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}
