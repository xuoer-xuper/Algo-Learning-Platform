import type Database from 'better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDrizzleClient } from './client'
import {
  loadMigrationResources,
  type LoadedDrizzleMigration,
  type MigrationResources,
} from './migration-resources'
import {
  assertDatabaseIntegrity,
  assertMigrationLedgerSchema,
  assertPost030Schema,
} from './schema-validation'

interface LegacyMigrationIdentity {
  version: number
  name: string
}

export interface DrizzleMigrationPlan {
  readonly pendingLegacy: readonly LegacyMigrationIdentity[]
  readonly needsBaseline: boolean
  readonly recordedDrizzleCount: number
  readonly pendingDrizzle: readonly LoadedDrizzleMigration[]
  readonly pendingKeys: readonly string[]
}

const DRIZZLE_LEDGER = '__drizzle_migrations'
const CREATE_DRIZZLE_LEDGER = `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash TEXT NOT NULL,
  created_at NUMERIC
)`

function hasTable(database: Database.Database, name: string): boolean {
  return Boolean(
    database.prepare('SELECT 1 FROM sqlite_schema WHERE type=? AND name=?').get('table', name),
  )
}

function legacyPrefix(
  database: Database.Database,
  known: readonly LegacyMigrationIdentity[],
): number {
  if (!hasTable(database, 'schema_migrations')) {
    const objects = database
      .prepare("SELECT 1 FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' LIMIT 1")
      .get()
    if (objects) throw new Error('Populated database is missing its legacy migration ledger')
    return 0
  }
  const columns = database.pragma('table_xinfo(schema_migrations)') as {
    name: string
    type: string
  }[]
  const appliedAtType = columns.find(({ name }) => name === 'applied_at')?.type.toUpperCase()
  if (appliedAtType !== 'TEXT' && appliedAtType !== 'INTEGER')
    throw new Error('Malformed legacy migration ledger')
  assertMigrationLedgerSchema(
    database,
    'schema_migrations',
    `CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at ${appliedAtType} NOT NULL
  )`,
  )
  const rows = database
    .prepare<[], LegacyMigrationIdentity>(
      'SELECT version,name FROM schema_migrations ORDER BY version',
    )
    .all()
  if (
    rows.length > known.length ||
    rows.some(
      (row, index) =>
        row.version !== known[index].version ||
        row.name !== known[index].name ||
        row.version !== index + 1,
    )
  ) {
    throw new Error('Legacy migration history is not a known contiguous prefix')
  }
  if (appliedAtType !== (rows.length >= 30 ? 'INTEGER' : 'TEXT')) {
    throw new Error('Legacy migration ledger timestamp type does not match its history')
  }
  if (
    rows.length === 0 &&
    database
      .prepare(
        "SELECT 1 FROM sqlite_schema WHERE name NOT IN ('schema_migrations','__drizzle_migrations') AND name NOT GLOB 'sqlite_*' LIMIT 1",
      )
      .get()
  ) {
    throw new Error('Populated database has an empty legacy migration history')
  }
  return rows.length
}

function drizzlePrefix(database: Database.Database, resources: MigrationResources): number {
  if (!hasTable(database, DRIZZLE_LEDGER)) return 0
  assertMigrationLedgerSchema(database, DRIZZLE_LEDGER, CREATE_DRIZZLE_LEDGER)
  const rows = database
    .prepare<[], { hash: unknown; created_at: unknown }>(
      'SELECT hash,created_at FROM __drizzle_migrations ORDER BY created_at',
    )
    .all()
  if (
    rows.length > resources.migrations.length ||
    rows.some(
      (row, index) =>
        row.hash !== resources.migrations[index].sha256 ||
        row.created_at !== resources.migrations[index].when,
    )
  ) {
    throw new Error('Drizzle migration history is not a known contiguous prefix')
  }
  return rows.length
}

export function inspectMigrationState(
  database: Database.Database,
  resources: MigrationResources,
  legacy: readonly LegacyMigrationIdentity[],
): DrizzleMigrationPlan {
  if (database.inTransaction) throw new Error('Migration inspection requires an idle connection')
  const recordedLegacy = legacyPrefix(database, legacy)
  const recordedDrizzleCount = drizzlePrefix(database, resources)
  if (recordedLegacy !== legacy.length && hasTable(database, DRIZZLE_LEDGER)) {
    throw new Error('Drizzle ledger exists before the legacy baseline is complete')
  }
  if (recordedLegacy === legacy.length) {
    if (recordedDrizzleCount <= 1) assertPost030Schema(database, resources.migrations[0].sql)
    else assertDatabaseIntegrity(database)
  }
  const pendingLegacy = legacy.slice(recordedLegacy)
  const pendingDrizzle = resources.migrations.slice(recordedDrizzleCount)
  return {
    pendingLegacy,
    needsBaseline: recordedDrizzleCount === 0,
    recordedDrizzleCount,
    pendingDrizzle,
    pendingKeys: [
      ...pendingLegacy.map(({ version }) => `legacy:${version}`),
      ...pendingDrizzle.map(({ tag }) => `drizzle:${tag}`),
    ],
  }
}

export function applyDrizzleMigrations(
  database: Database.Database,
  resources: MigrationResources,
  legacy: readonly LegacyMigrationIdentity[],
): void {
  if (database.inTransaction) throw new Error('Drizzle migrations require an idle connection')
  // Upstream reads files again; do not await between this validation and application.
  const verified = loadMigrationResources(resources.folder, resources.migrations)
  const plan = inspectMigrationState(database, verified, legacy)
  if (plan.pendingLegacy.length)
    throw new Error('Legacy migrations must complete before Drizzle adoption')
  const baseline = verified.migrations[0]
  if (plan.needsBaseline) {
    database.transaction(() => {
      database.exec(CREATE_DRIZZLE_LEDGER)
      database
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)')
        .run(baseline.sha256, baseline.when)
    })()
  }
  migrate(createDrizzleClient(database), { migrationsFolder: verified.folder })
  if (drizzlePrefix(database, verified) !== verified.migrations.length)
    throw new Error('Drizzle migrations did not complete')
  assertDatabaseIntegrity(database)
}
