import type Database from 'better-sqlite3'
import { parseLegacyTimestamp } from '../../shared/legacyTimestamp'
import { logger } from '../../shared/logger'
import { nowMillis, toLocalDay } from '../../../src/shared/time'
import { TIMESTAMP_COLUMNS } from '../timestampColumns'
import { normalizeLegacyAIContext } from '../legacy-ai-context'
import { recomputeAllDailyStatsAt } from '../repositories/stats/recompute-core'

interface SchemaObject {
  type: string
  name: string
  tbl_name: string
  sql: string
}

interface TableColumn {
  name: string
  type: string
  notnull: number
  pk: number
  hidden: number
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** Split DDL definitions without treating commas inside CHECK expressions or strings as columns. */
function definitions(body: string): string[] {
  const parts: string[] = []
  let start = 0
  let depth = 0
  let quote = ''
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]
    if (quote) {
      if (char === quote) {
        if (body[i + 1] === quote) i += 1
        else quote = ''
      }
      continue
    }
    if (char === "'" || char === '"' || char === '`') quote = char
    else if (char === '[') quote = ']'
    else if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(body.slice(start, i))
      start = i + 1
    }
  }
  if (quote || depth !== 0) throw new Error('Unsupported timestamp table definition')
  parts.push(body.slice(start))
  return parts
}

function rebuildDdl(
  sql: string,
  table: string,
  shadow: string,
  columns: readonly string[],
): string {
  const open = sql.indexOf('(')
  const close = sql.lastIndexOf(')')
  if (
    open < 0 ||
    close < open ||
    /\b(?:VIRTUAL|WITHOUT\s+ROWID|STRICT|AUTOINCREMENT)\b/i.test(sql)
  ) {
    throw new Error(`Unsupported timestamp table layout: ${table}`)
  }
  if (
    !/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)\s*$/i.test(
      sql.slice(0, open),
    )
  ) {
    throw new Error(`Unsupported timestamp table declaration: ${table}`)
  }
  const pending = new Set(columns)
  const converted = definitions(sql.slice(open + 1, close)).map((definition) => {
    const match = /^(\s*)(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|(\w+))(\s+)(\w+)/.exec(definition)
    if (!match) return definition
    const column = match[2] ?? match[3] ?? match[4] ?? match[5]
    if (!pending.has(column)) return definition
    if (match[7].toUpperCase() !== 'TEXT')
      throw new Error(`Unexpected timestamp affinity: ${table}.${column}`)
    pending.delete(column)
    return (
      definition.slice(0, match[0].length - match[7].length) +
      'INTEGER' +
      definition.slice(match[0].length)
    )
  })
  if (pending.size) throw new Error(`Timestamp columns missing from schema: ${table}`)
  return `CREATE TABLE ${quoteIdentifier(shadow)} (${converted.join(',')})${sql.slice(close + 1)}`
}

function convertContextJson(value: unknown, rowVersion: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Invalid AI context JSON storage type')
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new TypeError('Invalid AI context JSON')
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    (parsed as Record<string, unknown>).schema_version !== rowVersion
  ) {
    throw new TypeError('AI context version does not match its row')
  }
  return JSON.stringify(normalizeLegacyAIContext(parsed))
}

export const migration030 = {
  version: 30,
  name: 'timestamps_to_unix_ms',
  requiresForeignKeysDisabled: true,
  up(db: Database.Database): void {
    if (!db.inTransaction || db.pragma('foreign_keys', { simple: true }) !== 0) {
      throw new Error('Migration 030 requires the guarded FK-disabled transaction runner')
    }
    const schema = db
      .prepare(
        `SELECT type, name, tbl_name, sql FROM sqlite_schema
      WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name`,
      )
      .all() as SchemaObject[]
    const tables = new Map(
      schema.filter((item) => item.type === 'table').map((item) => [item.name, item]),
    )
    const originalCounts = new Map<string, number>()
    const shadows = new Map<string, string>()

    for (const [table, { columns, policy }] of Object.entries(TIMESTAMP_COLUMNS)) {
      const source = tables.get(table)
      if (!source) throw new Error(`Missing timestamp table: ${table}`)
      const shadow = `__timestamps_030_${table}`
      if (tables.has(shadow)) throw new Error('Timestamp migration shadow already exists')
      const metadata = db.pragma(`table_xinfo(${quoteIdentifier(table)})`) as TableColumn[]
      if (
        metadata.some(
          (column) =>
            column.hidden !== 0 ||
            ['rowid', '_rowid_', 'oid', '__migration_rowid'].includes(column.name.toLowerCase()),
        )
      ) {
        throw new Error(`Unsupported timestamp columns: ${table}`)
      }
      const byName = new Map(metadata.map((column) => [column.name, column]))
      for (const name of columns) {
        if (byName.get(name)?.type.toUpperCase() !== 'TEXT')
          throw new Error(`Unexpected timestamp column: ${table}.${name}`)
      }
      db.exec(rebuildDdl(source.sql, table, shadow, columns))
      const integerPrimaryKey = metadata.filter((column) => column.pk > 0)
      const hasRowidAlias =
        integerPrimaryKey.length === 1 && integerPrimaryKey[0].type.toUpperCase() === 'INTEGER'
      const names = metadata.map((column) => column.name)
      const copyNames = hasRowidAlias ? names : ['rowid', ...names]
      const insert = db.prepare(
        `INSERT INTO ${quoteIdentifier(shadow)} (${copyNames.map(quoteIdentifier).join(',')}) VALUES (${copyNames.map(() => '?').join(',')})`,
      )
      let count = 0
      const rows = db
        .prepare(`SELECT rowid AS __migration_rowid, * FROM ${quoteIdentifier(table)}`)
        .all() as Record<string, unknown>[]
      for (const row of rows) {
        for (const column of columns) {
          const value = row[column]
          if (value !== null && typeof value !== 'string' && typeof value !== 'number')
            throw new TypeError(`Invalid timestamp type: ${table}.${column}`)
          if (value === null && byName.get(column)?.notnull)
            throw new TypeError(`Missing timestamp: ${table}.${column}`)
          row[column] = parseLegacyTimestamp(value, policy, { table, column })
        }
        if (table === 'ai_context_snapshots') {
          row.context_json = convertContextJson(row.context_json, row.schema_version)
          row.schema_version = 2
        }
        const values = names.map((name) => row[name])
        if (!hasRowidAlias) values.unshift(row.__migration_rowid)
        insert.run(...values)
        count += 1
      }
      const copied = db
        .prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(shadow)}`)
        .get() as { count: number }
      if (copied.count !== count) throw new Error(`Timestamp copy count mismatch: ${table}`)
      originalCounts.set(table, count)
      shadows.set(table, shadow)
    }

    const views = schema.filter((item) => item.type === 'view')
    const triggers = schema.filter((item) => item.type === 'trigger')
    for (const view of views) db.exec(`DROP VIEW ${quoteIdentifier(view.name)}`)
    for (const trigger of triggers) db.exec(`DROP TRIGGER ${quoteIdentifier(trigger.name)}`)
    for (const table of shadows.keys()) db.exec(`DROP TABLE ${quoteIdentifier(table)}`)
    for (const [table, shadow] of shadows)
      db.exec(`ALTER TABLE ${quoteIdentifier(shadow)} RENAME TO ${quoteIdentifier(table)}`)
    for (const item of schema) {
      if (item.type === 'index' && shadows.has(item.tbl_name)) db.exec(item.sql)
    }
    for (const view of views) db.exec(view.sql)

    for (const [table, column] of [
      ['activity_events', 'occurred_at'],
      ['coach_feedback', 'created_at'],
    ]) {
      const update = db.prepare(
        `UPDATE ${quoteIdentifier(table)} SET local_day = ? WHERE rowid = ?`,
      )
      const rows = db
        .prepare(
          `SELECT rowid AS id, ${quoteIdentifier(column)} AS instant FROM ${quoteIdentifier(table)}`,
        )
        .all() as { id: number; instant: number }[]
      for (const row of rows) update.run(toLocalDay(row.instant), row.id)
    }
    // The old substr(timestamp, 1, 10) aggregator could turn decimal millisecond
    // TEXT into a ten-digit cache key. Facts are authoritative, including after
    // deletion left an orphaned aggregate; the pre-migration backup retains it.
    db.prepare(
      "DELETE FROM user_daily_stats WHERE length(local_day) = 10 AND local_day NOT GLOB '*[^0-9]*'",
    ).run()
    recomputeAllDailyStatsAt(db, nowMillis())
    for (const trigger of triggers) db.exec(trigger.sql)

    for (const [table, { columns }] of Object.entries(TIMESTAMP_COLUMNS)) {
      if (table !== 'user_daily_stats') {
        const current = db
          .prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`)
          .get() as { count: number }
        if (current.count !== originalCounts.get(table))
          throw new Error(`Timestamp row count changed: ${table}`)
      }
      for (const column of columns) {
        const invalid = db
          .prepare(
            `SELECT 1 FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} IS NOT NULL AND typeof(${quoteIdentifier(column)}) != 'integer' LIMIT 1`,
          )
          .get()
        if (invalid) throw new Error(`Noninteger migrated timestamp: ${table}.${column}`)
      }
    }
    logger.info('db.timestamp-migration-prepared', {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      policyVersion: 1,
      tables: shadows.size,
      columns: Object.values(TIMESTAMP_COLUMNS).reduce((sum, item) => sum + item.columns.length, 0),
    })
  },
}
