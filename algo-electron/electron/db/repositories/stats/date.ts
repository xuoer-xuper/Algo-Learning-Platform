export function localDateDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return formatLocalDate(date)
}

export function formatLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function nextLocalDay(localDay: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDay)
  if (!match) throw new Error(`Invalid local day: ${localDay}`)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    throw new Error(`Invalid local day: ${localDay}`)
  }

  date.setDate(date.getDate() + 1)
  return formatLocalDate(date)
}

export function localDayFromTimestamp(timestamp: string): string | null {
  const localDay = timestamp.slice(0, 10)
  try {
    nextLocalDay(localDay)
    return localDay
  } catch {
    return null
  }
}

export function dayDiff(laterLocalDay: string, earlierLocalDay: string): number {
  const later = new Date(`${laterLocalDay}T00:00:00`).getTime()
  const earlier = new Date(`${earlierLocalDay}T00:00:00`).getTime()
  return Math.round((later - earlier) / 86400000)
}
