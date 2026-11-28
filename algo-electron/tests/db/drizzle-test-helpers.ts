import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

export function openGeneratedDrizzleDatabase(): Database.Database {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  database.exec(fs.readFileSync(path.join(process.cwd(), 'drizzle/0000_baseline.sql'), 'utf8'))
  return database
}

export function readSchemaTables(database: Database.Database): string[] {
  return database
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => name)
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

interface ColumnMetadata {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

interface IndexMetadata {
  name: string
  unique: number
  origin: string
  partial: number
}

interface IndexColumn {
  seqno: number
  cid: number
  name: string | null
  desc: number
  coll: string
  key: number
}

function normalizeSql(value: string): string {
  // Identifier quoting may differ; quoted values and their whitespace may not.
  const tokens =
    value.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|\s+|[^'"`[\s]+/g) ?? []
  return tokens
    .map((token) => {
      if (token.startsWith("'")) return token
      if (/^\s+$/.test(token)) return ' '
      if (token.startsWith('"') || token.startsWith('`') || token.startsWith('[')) {
        const quote = token[0]
        return token.slice(1, -1).replaceAll(quote + quote, quote)
      }
      return token
    })
    .join('')
    .trim()
}

export function readColumnMetadata(database: Database.Database, table: string) {
  return (database.pragma(`table_info(${quoteIdentifier(table)})`) as ColumnMetadata[]).map(
    (column) => ({ ...column, type: column.type.toUpperCase() }),
  )
}

function indexEntries(database: Database.Database, table: string) {
  return (database.pragma(`index_list(${quoteIdentifier(table)})`) as IndexMetadata[])
    .map((entry) => {
      const sql = database
        .prepare<[string], { sql: string | null }>('SELECT sql FROM sqlite_schema WHERE name=?')
        .get(entry.name)?.sql
      return {
        name: entry.name,
        origin: entry.origin,
        primary: entry.origin === 'pk',
        unique: entry.unique,
        partial: entry.partial,
        where: sql && /\bWHERE\b/i.test(sql) ? normalizeSql(sql.split(/\bWHERE\b/i)[1]) : null,
        columns: (database.pragma(`index_xinfo(${quoteIdentifier(entry.name)})`) as IndexColumn[])
          .filter(({ key }) => key === 1)
          .map(({ name, desc, coll }) => ({ name, desc, coll })),
      }
    })
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

export function readIndexMetadata(database: Database.Database, table: string) {
  return indexEntries(database, table)
    .map(({ name: _name, origin: _origin, ...metadata }) => metadata)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

export function readNamedIndexMetadata(database: Database.Database, table: string) {
  return indexEntries(database, table)
    .filter(({ origin }) => origin === 'c')
    .map(({ origin: _origin, ...metadata }) => metadata)
}

export function readForeignKeyMetadata(database: Database.Database, table: string) {
  return (
    database.pragma(`foreign_key_list(${quoteIdentifier(table)})`) as Array<Record<string, unknown>>
  )
    .map(({ id: _id, ...entry }) => entry)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

export function readCheckExpressions(database: Database.Database, table: string): string[] {
  const source =
    database
      .prepare<[string], { sql: string }>('SELECT sql FROM sqlite_schema WHERE name=?')
      .get(table)?.sql ?? ''
  const expressions: string[] = []
  const pattern = /\bCHECK\s*\(/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    const start = match.index + match[0].length
    let cursor = start
    let depth = 1
    let quote = ''
    while (depth > 0 && cursor < source.length) {
      const character = source[cursor]
      if (quote) {
        if (character === quote) {
          if (source[cursor + 1] === quote) cursor += 1
          else quote = ''
        }
      } else if (character === "'" || character === '"') quote = character
      else if (character === '(') depth += 1
      else if (character === ')') depth -= 1
      cursor += 1
    }
    if (depth !== 0) throw new Error(`Unbalanced CHECK for ${table}`)
    expressions.push(normalizeSql(source.slice(start, cursor - 1)))
    pattern.lastIndex = cursor
  }
  return expressions.sort()
}
