import { parseLegacyTimestamp } from '../shared/legacyTimestamp'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid AI context: expected object')
  }
  return value as Record<string, unknown>
}

/** Convert only the versioned application-owned instant fields, never arbitrary user JSON. */
export function normalizeLegacyAIContext(value: unknown): Record<string, unknown> {
  const source = object(value)
  const version = source.schema_version
  if (version !== 1 && version !== 2) throw new TypeError('Unsupported AI context version')
  const timestamp = (input: unknown, column: string): number => {
    if (
      (version === 2 && typeof input !== 'number') ||
      (typeof input !== 'string' && typeof input !== 'number')
    ) {
      throw new TypeError(`Invalid AI context timestamp field: ${column}`)
    }
    return parseLegacyTimestamp(input, 'local', { table: 'ai_context_snapshots', column })
  }
  const output = {
    ...source,
    schema_version: 2,
    exported_at: timestamp(source.exported_at, 'exported_at'),
  }
  for (const [key, field] of [
    ['wrong_problems', 'last_attempt'],
    ['unreviewed_problems', 'last_visited_at'],
    ['recent_activity', 'occurred_at'],
  ]) {
    const values = source[key]
    if (!Array.isArray(values)) throw new TypeError(`Invalid AI context array: ${key}`)
    Object.assign(output, {
      [key]: values.map((entry: unknown) => {
        const record = object(entry)
        return { ...record, [field]: timestamp(record[field], `${key}.${field}`) }
      }),
    })
  }
  return output
}
