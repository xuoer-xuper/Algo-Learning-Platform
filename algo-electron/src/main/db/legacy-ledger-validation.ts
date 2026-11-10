import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'

export const legacyLedgerEntrySchema = z
  .object({
    version: z.number().int().positive().safe(),
    name: z.string().min(1),
  })
  .strict()
export const legacyLedgerSchema = z.array(legacyLedgerEntrySchema).superRefine((rows, context) => {
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1].version >= rows[index].version) {
      context.addIssue({ code: 'custom', message: 'Migration ledger must be strictly ordered' })
    }
  }
})
export type LegacyLedger = z.infer<typeof legacyLedgerSchema>

export const databaseStateSchema = z
  .object({
    ledger: legacyLedgerSchema,
    schemaHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export type DatabaseState = z.infer<typeof databaseStateSchema>

export function readLegacyLedger(database: Database.Database): LegacyLedger {
  const table = database
    .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'schema_migrations'")
    .get()
  if (!table) return []
  return legacyLedgerSchema.parse(
    database.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all(),
  )
}

export function validateLegacyLedger(
  database: Database.Database,
  knownMigrations: ReadonlyArray<{ version: number; name: string }>,
): LegacyLedger {
  const ledger = readLegacyLedger(database)
  const objects = database
    .prepare(
      "SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'",
    )
    .all()
  if (ledger.length === 0 && objects.length > 0) {
    throw new Error('Populated database has no migration history')
  }
  for (const [index, entry] of ledger.entries()) {
    const expected = knownMigrations[index]
    if (!expected || entry.version !== expected.version || entry.name !== expected.name) {
      throw new Error('Database migration history is not a known continuous prefix')
    }
  }
  return ledger
}

export function assertDatabaseIntegrity(database: Database.Database): void {
  const integrity = database.pragma('integrity_check')
  if (
    !Array.isArray(integrity) ||
    integrity.length !== 1 ||
    z.object({ integrity_check: z.literal('ok') }).safeParse(integrity[0]).success !== true
  ) {
    throw new Error('Database integrity verification failed')
  }
  const foreignKeys = database.pragma('foreign_key_check')
  if (!Array.isArray(foreignKeys) || foreignKeys.length !== 0) {
    throw new Error('Database foreign key verification failed')
  }
}

export function readDatabaseState(database: Database.Database): DatabaseState {
  // Hash the exact source schema, including optional user views/triggers, without storing SQL.
  const schema: unknown = database
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )
    .all()
  return {
    ledger: readLegacyLedger(database),
    schemaHash: createHash('sha256').update(JSON.stringify(schema)).digest('hex'),
  }
}

export function assertLegacyLedgerEquals(actual: LegacyLedger, expected: LegacyLedger): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Database migration history does not match the recovery checkpoint')
  }
}

export function validateDatabaseState(database: Database.Database, expected: DatabaseState): void {
  assertDatabaseIntegrity(database)
  const actual = readDatabaseState(database)
  assertLegacyLedgerEquals(actual.ledger, expected.ledger)
  if (actual.schemaHash !== expected.schemaHash) {
    throw new Error('Database schema does not match the recovery checkpoint')
  }
}
