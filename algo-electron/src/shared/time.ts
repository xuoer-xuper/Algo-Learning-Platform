export function nowMillis(): number {
  return Date.now()
}

function dateFromMillis(milliseconds: number): Date {
  if (!Number.isSafeInteger(milliseconds))
    throw new TypeError('Timestamp must be integer milliseconds')
  const date = new Date(milliseconds)
  if (!Number.isFinite(date.getTime())) throw new RangeError('Timestamp is outside the Date range')
  return date
}

export function toLocalDay(milliseconds: number): string {
  const date = dateFromMillis(milliseconds)
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatForDisplay(
  milliseconds: number,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...options,
  }).format(dateFromMillis(milliseconds))
}

function calendarDate(day: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) throw new TypeError('Invalid local day')
  const [year, month, date] = match.slice(1).map(Number)
  const value = new Date(0)
  value.setUTCFullYear(year, month - 1, date)
  value.setUTCHours(0, 0, 0, 0)
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== date
  ) {
    throw new TypeError('Invalid local day')
  }
  return value
}

export function shiftLocalDay(day: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new TypeError('Day shift must be an integer')
  const value = calendarDate(day)
  value.setUTCDate(value.getUTCDate() + days)
  const year = value.getUTCFullYear()
  if (!Number.isFinite(value.getTime()) || year < 0 || year > 9999) {
    throw new RangeError('Local day is outside the supported calendar range')
  }
  return `${String(year).padStart(4, '0')}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

function localMidnight(day: string): number {
  const calendar = calendarDate(day)
  const local = new Date(0)
  local.setFullYear(calendar.getUTCFullYear(), calendar.getUTCMonth(), calendar.getUTCDate())
  local.setHours(0, 0, 0, 0)
  if (toLocalDay(local.getTime()) !== day) throw new RangeError('Local calendar day does not exist')
  return local.getTime()
}

export function localDayBounds(day: string): { start: number; end: number } {
  return { start: localMidnight(day), end: localMidnight(shiftLocalDay(day, 1)) }
}
