import type Database from 'better-sqlite3'
import { z } from 'zod'
import { assertMigrationLedgerSchema } from './schema-validation'
import type { KnownDrizzleMigration } from './migration-resources'

export const drizzleIdentitySchema = z
  .object({
    tag: z.string().regex(/^\d{4}_[a-zA-Z0-9_-]+$/),
    when: z.number().int().positive().safe(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export const drizzleLedgerSchema = z.array(drizzleIdentitySchema).superRefine((rows, context) => {
  if (
    new Set(rows.map(({ tag }) => tag)).size !== rows.length ||
    rows.some((row, index) => index > 0 && row.when <= rows[index - 1].when)
  ) {
    context.addIssue({ code: 'custom', message: 'Drizzle history must be ordered and unique' })
  }
})
export type DrizzleLedger = z.infer<typeof drizzleLedgerSchema>

export const CREATE_DRIZZLE_LEDGER = `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash TEXT NOT NULL,
  created_at NUMERIC
)`

export function drizzleIdentities(known: readonly KnownDrizzleMigration[]): DrizzleLedger {
  return known.map(({ tag, when, sha256 }) => ({ tag, when, sha256 }))
}

export function assertDrizzlePrefix(
  prefix: readonly KnownDrizzleMigration[],
  known: readonly KnownDrizzleMigration[],
): void {
  if (
    prefix.length > known.length ||
    prefix.some(
      (row, index) =>
        row.tag !== known[index].tag ||
        row.when !== known[index].when ||
        row.sha256 !== known[index].sha256,
    )
  ) {
    throw new Error('Drizzle migration history is not a known contiguous prefix')
  }
}

export function readDrizzleLedger(
  database: Database.Database,
  known: readonly KnownDrizzleMigration[],
): DrizzleLedger | null {
  if (
    !database
      .prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='__drizzle_migrations'")
      .get()
  )
    return null
  assertMigrationLedgerSchema(database, '__drizzle_migrations', CREATE_DRIZZLE_LEDGER)
  const rows = database
    .prepare<[], { hash: unknown; created_at: unknown }>(
      'SELECT hash,created_at FROM __drizzle_migrations ORDER BY created_at',
    )
    .all()
  if (
    rows.length > known.length ||
    rows.some(
      (row, index) => row.hash !== known[index].sha256 || row.created_at !== known[index].when,
    )
  ) {
    throw new Error('Drizzle migration history is not a known contiguous prefix')
  }
  return drizzleIdentities(known.slice(0, rows.length))
}

export function assertDrizzleLedgerEquals(
  actual: DrizzleLedger | null,
  expected: DrizzleLedger | null,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Drizzle migration history does not match the recovery checkpoint')
  }
}
