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

export function dayDiff(laterLocalDay: string, earlierLocalDay: string): number {
  const later = new Date(`${laterLocalDay}T00:00:00`).getTime()
  const earlier = new Date(`${earlierLocalDay}T00:00:00`).getTime()
  return Math.round((later - earlier) / 86400000)
}
