import Database from 'better-sqlite3'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import * as schema from './schema'

interface SchemaColumn {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
  hidden: number
}

interface SchemaIndex {
  name: string
  unique: number
  origin: string
  partial: number
}

interface SchemaIndexColumn {
  name: string | null
  desc: number
  coll: string
  key: number
}

interface TableLayout {
  schema: string
  name: string
  type: string
  ncol: number
  wr: number
  strict: number
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function normalizeExpression(value: string): string {
  const tokens =
    value.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|\s+|[^'"`[\s]+/g) ?? []
  return tokens
    .map((token) => {
      if (token.startsWith("'")) return token
      if (/^\s+$/.test(token)) return ' '
      if (token.startsWith('"') || token.startsWith('`') || token.startsWith('[')) {
        return token
          .slice(1, -1)
          .split(token[0] + token[0])
          .join(token[0])
      }
      return token
    })
    .join('')
    .trim()
}

function sorted(values: unknown[]): string[] {
  return values.map((value) => JSON.stringify(value)).sort()
}

function assertSame(actual: unknown, expected: unknown, description: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Post-030 schema mismatch: ${description}`)
  }
}

/** Preserve offsets while hiding comments and quoted text from DDL keyword searches. */
function schemaSqlParts(sql: string): { uncommented: string; keywords: string } {
  let uncommented = ''
  let keywords = ''
  let position = 0
  while (position < sql.length) {
    const start = position
    const character = sql[position]
    if (sql.startsWith('--', position) || sql.startsWith('/*', position)) {
      const lineComment = sql.startsWith('--', position)
      const end = sql.indexOf(lineComment ? '\n' : '*/', position + 2)
      position = end === -1 ? sql.length : end + (lineComment ? 1 : 2)
      const blank = ' '.repeat(position - start)
      uncommented += blank
      keywords += blank
    } else if (character === "'" || character === '"' || character === '`' || character === '[') {
      const closing = character === '[' ? ']' : character
      position += 1
      while (position < sql.length) {
        if (sql[position++] !== closing) continue
        if (character !== '[' && sql[position] === closing) position += 1
        else break
      }
      uncommented += sql.slice(start, position)
      keywords += ' '.repeat(position - start)
    } else {
      uncommented += character
      keywords += character
      position += 1
    }
  }
  return { uncommented, keywords }
}

function readChecks(uncommented: string, keywords: string): string[] {
  const checks: string[] = []
  const pattern = /\bCHECK\s*\(/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(keywords))) {
    const start = match.index + match[0].length
    let position = start
    let depth = 1
    while (depth > 0 && position < keywords.length) {
      const character = keywords[position]
      if (character === '(') depth += 1
      else if (character === ')') depth -= 1
      position += 1
    }
    if (depth !== 0) throw new Error('Malformed schema CHECK expression')
    checks.push(normalizeExpression(uncommented.slice(start, position - 1)))
    pattern.lastIndex = position
  }
  return checks.sort()
}

function readTableSchema(database: Database.Database, name: string) {
  const layout = (database.pragma('table_list') as TableLayout[]).find(
    (table) => table.schema === 'main' && table.name === name,
  )
  const columns = (database.pragma(`table_xinfo(${quoteIdentifier(name)})`) as SchemaColumn[]).map(
    (column) => ({ ...column, type: column.type.toUpperCase() }),
  )
  const indexes = (database.pragma(`index_list(${quoteIdentifier(name)})`) as SchemaIndex[]).map(
    (entry) => {
      const sql = database
        .prepare<[string], { sql: string | null }>('SELECT sql FROM sqlite_schema WHERE name=?')
        .get(entry.name)?.sql
      return {
        name: entry.name,
        origin: entry.origin,
        primary: entry.origin === 'pk',
        unique: entry.unique,
        partial: entry.partial,
        where:
          sql && /\bWHERE\b/i.test(sql) ? normalizeExpression(sql.split(/\bWHERE\b/i)[1]) : null,
        columns: (
          database.pragma(`index_xinfo(${quoteIdentifier(entry.name)})`) as SchemaIndexColumn[]
        )
          .filter(({ key }) => key === 1)
          .map(({ name: column, desc, coll }) => ({ name: column, desc, coll })),
      }
    },
  )
  const foreignKeys = (
    database.pragma(`foreign_key_list(${quoteIdentifier(name)})`) as Record<string, unknown>[]
  ).map(({ id: _id, ...entry }) => entry)
  const definition =
    database
      .prepare<[string], { sql: string }>('SELECT sql FROM sqlite_schema WHERE name=?')
      .get(name)?.sql ?? ''
  const { uncommented, keywords } = schemaSqlParts(definition)
  // PRAGMAs omit these semantics; none occur in the supported baseline or ledgers.
  if (/\b(?:COLLATE|DEFERRABLE|INITIALLY|AUTOINCREMENT)\b|\bON\s+CONFLICT\b/i.test(keywords)) {
    throw new Error(`Unsupported schema clause: ${name}`)
  }
  return {
    layout,
    columns,
    indexes,
    foreignKeys: sorted(foreignKeys),
    checks: readChecks(uncommented, keywords),
  }
}

/** SQLite hides generated columns from table_info; validate all physical ledger metadata. */
export function assertMigrationLedgerSchema(
  database: Database.Database,
  table: string,
  definition: string,
): void {
  const expected = new Database(':memory:')
  try {
    expected.exec(definition)
    const actualSchema = readTableSchema(database, table)
    const expectedSchema = readTableSchema(expected, table)
    if (JSON.stringify(actualSchema) !== JSON.stringify(expectedSchema)) {
      throw new Error(`Malformed migration ledger: ${table}`)
    }
    const trigger = database
      .prepare<[string], { name: string }>(
        "SELECT name FROM sqlite_schema WHERE type='trigger' AND tbl_name=? LIMIT 1",
      )
      .get(table)
    if (trigger) throw new Error(`Malformed migration ledger: ${table} trigger`)
  } finally {
    expected.close()
  }
}

function tables(database: Database.Database): string[] {
  const objects = database
    .prepare<[], { type: string; name: string }>(
      "SELECT type,name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' AND type IN ('table','view','trigger') ORDER BY name",
    )
    .all()
  if (objects.some(({ type }) => type !== 'table'))
    throw new Error('Post-030 schema contains unsupported views or triggers')
  return objects.filter(({ name }) => name !== '__drizzle_migrations').map(({ name }) => name)
}

export function assertDatabaseIntegrity(database: Database.Database): void {
  if ((database.pragma('foreign_key_check') as unknown[]).length !== 0)
    throw new Error('Database foreign key validation failed')
  if (database.pragma('integrity_check', { simple: true }) !== 'ok')
    throw new Error('Database integrity validation failed')
}

/** Adoption compares schema, not user records, against the already hash-verified baseline. */
export function assertPost030Schema(database: Database.Database, baselineSql: string): void {
  const expected = new Database(':memory:')
  try {
    expected.pragma('foreign_keys = ON')
    expected.exec(baselineSql)
    const tableNames = tables(expected)
    assertSame(tables(database), tableNames, 'table set')
    const implicitUniqueNames = new Set(
      Object.values(schema).flatMap((table) =>
        getTableConfig(table).uniqueConstraints.map((constraint) => constraint.getName()),
      ),
    )
    for (const table of tableNames) {
      const actualTable = readTableSchema(database, table)
      const expectedTable = readTableSchema(expected, table)
      assertSame(actualTable.layout, expectedTable.layout, `${table} layout`)
      assertSame(actualTable.columns, expectedTable.columns, `${table} columns`)
      assertSame(actualTable.foreignKeys, expectedTable.foreignKeys, `${table} foreign keys`)
      assertSame(actualTable.checks, expectedTable.checks, `${table} CHECK constraints`)
      const semanticIndex = ({
        name: _name,
        origin: _origin,
        ...index
      }: (typeof actualTable.indexes)[number]) => index
      const semantics = (indexes: typeof actualTable.indexes) => sorted(indexes.map(semanticIndex))
      assertSame(
        semantics(actualTable.indexes),
        semantics(expectedTable.indexes),
        `${table} indexes`,
      )
      // Only Kit's names for former inline UNIQUE constraints may differ from autoindexes.
      for (const index of expectedTable.indexes) {
        if (index.name.startsWith('sqlite_autoindex_')) continue
        if (implicitUniqueNames.has(index.name)) {
          const equivalent = actualTable.indexes.find(
            (candidate) =>
              (candidate.name === index.name ||
                (candidate.origin === 'u' && candidate.name.startsWith('sqlite_autoindex_'))) &&
              JSON.stringify(semanticIndex(candidate)) === JSON.stringify(semanticIndex(index)),
          )
          if (!equivalent) throw new Error(`Post-030 schema mismatch: ${table}.${index.name}`)
          continue
        }
        assertSame(
          actualTable.indexes.find(({ name }) => name === index.name),
          index,
          `${table}.${index.name}`,
        )
      }
    }
    assertDatabaseIntegrity(database)
  } finally {
    expected.close()
  }
}
