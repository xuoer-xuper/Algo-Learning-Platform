export type LegacyTimestampPolicy = 'local' | 'utc8'

interface TimestampLocation {
  table: string
  column: string
}

function invalid(reason: string, location?: TimestampLocation): never {
  const context = location
    ? ` at ${location.table.replace(/[^a-zA-Z0-9_]/g, '?')}.${location.column.replace(/[^a-zA-Z0-9_.]/g, '?')}`
    : ''
  throw new TypeError(`Invalid legacy timestamp${context}: ${reason}`)
}

export function parseLegacyTimestamp(
  value: string | number,
  policy: LegacyTimestampPolicy,
  location?: TimestampLocation,
): number
export function parseLegacyTimestamp(
  value: null,
  policy: LegacyTimestampPolicy,
  location?: TimestampLocation,
): null
export function parseLegacyTimestamp(
  value: string | number | null,
  policy: LegacyTimestampPolicy,
  location?: TimestampLocation,
): number | null
export function parseLegacyTimestamp(
  value: string | number | null,
  policy: LegacyTimestampPolicy,
  location?: TimestampLocation,
): number | null {
  if (value === null) return null
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) {
      invalid('expected finite integer milliseconds', location)
    }
    return value
  }
  if (policy !== 'local' && policy !== 'utc8') invalid('unknown timezone policy', location)
  // SQLite TEXT affinity preserves a bound JS millisecond number as decimal REAL text.
  // This is already an instant, not wall time or an implicit seconds conversion.
  if (/^-?(?:0|[1-9]\d*)\.0+$/.test(value)) {
    const milliseconds = Number(value)
    if (!Number.isSafeInteger(milliseconds) || !Number.isFinite(new Date(milliseconds).getTime())) {
      invalid('expected finite integer milliseconds', location)
    }
    return milliseconds
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/.exec(
      value,
    )
  if (!match) invalid('unsupported datetime shape', location)
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number)
  const millisecond = Number((match[7] ?? '').padEnd(3, '0'))
  const utc = new Date(0)
  utc.setUTCFullYear(year, month - 1, day)
  utc.setUTCHours(hour, minute, second, millisecond)
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day ||
    utc.getUTCHours() !== hour ||
    utc.getUTCMinutes() !== minute ||
    utc.getUTCSeconds() !== second
  )
    invalid('invalid calendar components', location)

  const suffix = match[8]
  if (suffix || policy === 'utc8') {
    let offsetMinutes = policy === 'utc8' ? 480 : 0
    if (suffix === 'Z') offsetMinutes = 0
    else if (suffix) {
      const offsetHours = Number(suffix.slice(1, 3))
      const offsetRemainder = Number(suffix.slice(4, 6))
      if (offsetHours > 23 || offsetRemainder > 59) invalid('invalid timezone offset', location)
      offsetMinutes = (suffix[0] === '-' ? -1 : 1) * (offsetHours * 60 + offsetRemainder)
    }
    return utc.getTime() - offsetMinutes * 60_000
  }

  // The earlier occurrence of a DST fold matches Date's legacy-compatible behavior.
  const local = new Date(0)
  local.setFullYear(year, month - 1, day)
  local.setHours(hour, minute, second, millisecond)
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day ||
    local.getHours() !== hour ||
    local.getMinutes() !== minute ||
    local.getSeconds() !== second ||
    local.getMilliseconds() !== millisecond
  )
    invalid('nonexistent local time', location)
  return local.getTime()
}
