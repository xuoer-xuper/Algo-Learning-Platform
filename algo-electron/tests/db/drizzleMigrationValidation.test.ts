import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeDb,
  initDbAtPath,
  initDbAtPathWithMigrationSafety,
} from '../../electron/db/connection'
import {
  getMigrationFailureMarkerPath,
  writeMigrationFailureMarker,
} from '../../electron/backup/sqliteMigrationBackup'
import { inspectMigrationState } from '../../src/main/db/migrate'
import {
  KNOWN_DRIZZLE_MIGRATIONS,
  loadMigrationResources,
} from '../../src/main/db/migration-resources'
import { assertPost030Schema } from '../../src/main/db/schema-validation'
import {
  backupFiles,
  baselineFolder,
  cleanupMigrationTests,
  legacyIdentities,
  migrationTestPaths,
  quietLogger,
  resourceFixture,
} from './drizzle-migration-test-helpers'

const baseline = KNOWN_DRIZZLE_MIGRATIONS[0]
const ledgerDefinition =
  'CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)'
const baselineSql = fs.readFileSync(path.join(baselineFolder, '0000_baseline.sql'), 'utf8')

afterEach(() => {
  vi.restoreAllMocks()
  cleanupMigrationTests()
})

function addBaseline(database: Database.Database): void {
  database.exec(ledgerDefinition)
  database
    .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)')
    .run(baseline.sha256, baseline.when)
}

describe('migration history validation', () => {
  it.each([
    ['gap', 'DELETE FROM schema_migrations WHERE version=12'],
    ['wrong name', "UPDATE schema_migrations SET name='wrong' WHERE version=12"],
    ['future version', "INSERT INTO schema_migrations VALUES (31,'future',0)"],
    ['missing ledger', 'DROP TABLE schema_migrations'],
    ['empty ledger', 'DELETE FROM schema_migrations'],
    [
      'generated ledger column',
      'ALTER TABLE schema_migrations ADD COLUMN hidden_value TEXT GENERATED ALWAYS AS (name) VIRTUAL',
    ],
    [
      'legacy timestamp type',
      'DROP TABLE schema_migrations; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)',
    ],
  ])(
    'rejects %s before backup, closes the handle, and retains a stale marker',
    async (_name, sql) => {
      const { dbPath, backupDir } = migrationTestPaths()
      const database = initDbAtPath(dbPath)
      database.exec(sql)
      closeDb()
      const markerPath = writeMigrationFailureMarker(backupDir, dbPath, {
        databasePath: dbPath,
        backupPath: 'old.sqlite',
        failedAt: '2026-01-01',
        pendingMigrations: [{ version: 99, name: 'unrelated' }],
        error: 'previous',
      })
      const close = vi.spyOn(Database.prototype, 'close')
      await expect(
        initDbAtPathWithMigrationSafety(dbPath, { backupDir, logger: quietLogger }),
      ).rejects.toThrow(/legacy|Legacy|migration ledger/)
      const closedTarget = close.mock.contexts.find(
        (instance): instance is Database.Database =>
          instance instanceof Database && instance.name === dbPath,
      )
      expect(closedTarget).toBeDefined()
      expect(closedTarget?.open).toBe(false)
      expect(backupFiles(backupDir)).toEqual([])
      expect(fs.existsSync(markerPath)).toBe(true)
    },
  )

  it.each([
    'CREATE TABLE sqlitex_unexpected(id INTEGER)',
    'CREATE VIEW sqlitex_unexpected AS SELECT 1',
  ])('does not misclassify a populated database as fresh: %s', async (sql) => {
    const { dbPath, backupDir } = migrationTestPaths()
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const database = new Database(dbPath)
    database.exec(sql)
    database.close()
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, { backupDir, logger: quietLogger }),
    ).rejects.toThrow(/Populated/)
    expect(backupFiles(backupDir)).toEqual([])
  })

  it('rejects a Drizzle ledger before legacy30 even when empty', () => {
    const database = initDbAtPath(':memory:')
    database.exec('DELETE FROM schema_migrations WHERE version=30')
    // Reconstruct the pre-030 ledger shape so the ordering check is the rejecting guard.
    database.exec(
      'ALTER TABLE schema_migrations RENAME TO old_ledger; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL); INSERT INTO schema_migrations SELECT version,name,CAST(applied_at AS TEXT) FROM old_ledger; DROP TABLE old_ledger;',
    )
    database.exec(ledgerDefinition)
    expect(() =>
      inspectMigrationState(database, loadMigrationResources(baselineFolder), legacyIdentities),
    ).toThrow(/before the legacy baseline/)
  })

  it.each([
    'duplicate',
    'gap',
    'unknown hash',
    'future timestamp',
    'wrong hash',
    'null timestamp',
  ] as const)('rejects %s in the complete Drizzle prefix', (kind) => {
    const { directory } = migrationTestPaths()
    const database = initDbAtPath(':memory:')
    addBaseline(database)
    const drizzle = resourceFixture(directory, 'CREATE TABLE future_test(id INTEGER);')
    const future = drizzle.expected[1]
    if (kind === 'duplicate')
      database
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)')
        .run(baseline.sha256, baseline.when)
    if (kind === 'gap')
      database
        .prepare('UPDATE __drizzle_migrations SET hash=?,created_at=?')
        .run(future.sha256, future.when)
    if (kind === 'unknown hash')
      database
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)')
        .run('0'.repeat(64), future.when)
    if (kind === 'future timestamp')
      database.prepare('UPDATE __drizzle_migrations SET created_at=?').run(future.when + 1)
    if (kind === 'wrong hash')
      database.prepare('UPDATE __drizzle_migrations SET hash=?').run('0'.repeat(64))
    if (kind === 'null timestamp') database.exec('UPDATE __drizzle_migrations SET created_at=NULL')
    expect(() =>
      inspectMigrationState(
        database,
        loadMigrationResources(drizzle.folder, drizzle.expected),
        legacyIdentities,
      ),
    ).toThrow(/Drizzle migration history/)
  })

  it.each([
    [
      'hidden generated column',
      ledgerDefinition.replace(
        'created_at NUMERIC',
        'created_at NUMERIC, hidden_value TEXT GENERATED ALWAYS AS (hash) VIRTUAL',
      ),
    ],
    ['default', ledgerDefinition.replace('created_at NUMERIC', 'created_at NUMERIC DEFAULT 0')],
    ['not null', ledgerDefinition.replace('created_at NUMERIC', 'created_at NUMERIC NOT NULL')],
    [
      'foreign key',
      ledgerDefinition.replace(
        'created_at NUMERIC',
        'created_at NUMERIC REFERENCES schema_migrations(version)',
      ),
    ],
    [
      'check',
      ledgerDefinition.replace('created_at NUMERIC', 'created_at NUMERIC CHECK(created_at > 0)'),
    ],
    ['index', `${ledgerDefinition}; CREATE INDEX rogue_ledger_index ON __drizzle_migrations(hash)`],
    ['collation', ledgerDefinition.replace('hash TEXT', 'hash TEXT COLLATE NOCASE')],
    [
      'conflict policy',
      ledgerDefinition.replace('hash TEXT NOT NULL', 'hash TEXT NOT NULL ON CONFLICT IGNORE'),
    ],
    ['without rowid', `${ledgerDefinition} WITHOUT ROWID`],
    [
      'trigger',
      `${ledgerDefinition}; CREATE TRIGGER rogue_ledger_trigger AFTER INSERT ON __drizzle_migrations BEGIN SELECT 1; END`,
    ],
  ])('rejects ledger %s even if its rows are empty', (_name, sql) => {
    const database = initDbAtPath(':memory:')
    database.exec(sql)
    expect(() =>
      inspectMigrationState(database, loadMigrationResources(baselineFolder), legacyIdentities),
    ).toThrow(/ledger|schema clause/)
  })

  it('permits null upstream SERIAL ids, but validates an empty ledger before adoption', async () => {
    const { dbPath, backupDir } = migrationTestPaths()
    const database = initDbAtPath(dbPath)
    database.exec(ledgerDefinition)
    closeDb()
    const adopted = await initDbAtPathWithMigrationSafety(dbPath, {
      backupDir,
      logger: quietLogger,
    })
    expect(adopted.prepare('SELECT id FROM __drizzle_migrations').all()).toEqual([{ id: null }])
    expect(backupFiles(backupDir)).toHaveLength(1)
  })
})

describe('post-030 physical validation', () => {
  it.each([
    ['column', 'ALTER TABLE notes ADD COLUMN unexpected TEXT'],
    [
      'generated column',
      'ALTER TABLE notes ADD COLUMN hidden_value TEXT GENERATED ALWAYS AS (title) VIRTUAL',
    ],
    ['missing index', 'DROP INDEX idx_problems_status'],
    [
      'renamed index',
      'DROP INDEX idx_problems_status; CREATE INDEX renamed_status ON problems(status)',
    ],
    ['table', 'CREATE TABLE sqlitex_unexpected(id INTEGER)'],
    ['view', 'CREATE VIEW sqlitex_unexpected AS SELECT 1'],
    ['trigger', 'CREATE TRIGGER unexpected_trigger AFTER INSERT ON notes BEGIN SELECT 1; END'],
  ])('rejects %s drift before marking baseline without silently repairing', async (_name, sql) => {
    const { dbPath, backupDir } = migrationTestPaths()
    initDbAtPath(dbPath).exec(sql)
    closeDb()
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, { backupDir, logger: quietLogger }),
    ).rejects.toThrow(/Post-030/)
    expect(backupFiles(backupDir)).toEqual([])
    const database = new Database(dbPath, { readonly: true })
    try {
      expect(
        database.prepare("SELECT name FROM sqlite_schema WHERE name='__drizzle_migrations'").get(),
      ).toBeUndefined()
    } finally {
      database.close()
    }
    expect(fs.existsSync(getMigrationFailureMarkerPath(backupDir, dbPath))).toBe(false)
  })

  it.each([
    ['default', '`url` text,', "`url` text DEFAULT '',"],
    ['nullability', '`event_type` text NOT NULL,', '`event_type` text,'],
    [
      'foreign key',
      'ON UPDATE no action ON DELETE no action',
      'ON UPDATE cascade ON DELETE no action',
    ],
    ['check', 'CHECK(sync_excluded = 1)', 'CHECK(sync_excluded = 0)'],
    [
      'commented check',
      'CONSTRAINT "site_credentials_check_1" CHECK(sync_excluded = 1),',
      '/* CHECK(sync_excluded = 1) */',
    ],
    ['collation', '`url` text,', '`url` text COLLATE NOCASE,'],
    [
      'conflict policy',
      '`event_type` text NOT NULL,',
      '`event_type` text NOT NULL ON CONFLICT IGNORE,',
    ],
    [
      'deferred FK',
      'ON UPDATE no action ON DELETE no action',
      'ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED',
    ],
    [
      'autoincrement',
      '`version` integer PRIMARY KEY,',
      '`version` integer PRIMARY KEY AUTOINCREMENT,',
    ],
  ])('detects %s semantics which ordinary table_info may miss', (_name, before, after) => {
    expect(baselineSql).toContain(before)
    const database = new Database(':memory:')
    try {
      database.exec(baselineSql.replace(before, after))
      expect(() => assertPost030Schema(database, baselineSql)).toThrow(
        /schema mismatch|schema clause/,
      )
    } finally {
      database.close()
    }
  })

  it('does not treat DDL keywords inside quotes or comments as clauses or CHECKs', () => {
    const database = new Database(':memory:')
    const sql =
      "CREATE TABLE example(value TEXT DEFAULT 'CHECK(fake) COLLATE NOCASE', CONSTRAINT `CHECK(fake)` CHECK(value != 'CHECK(fake)'));"
    try {
      database.exec(sql.replace('value TEXT', 'value /* COLLATE NOCASE CHECK(fake) */ TEXT'))
      expect(() => assertPost030Schema(database, sql)).not.toThrow()
    } finally {
      database.close()
    }
  })

  it('allows inline UNIQUE autoindexes but not arbitrary renamed explicit replacements', () => {
    const database = new Database(':memory:')
    try {
      database.exec(baselineSql)
      database.exec(
        'DROP INDEX ai_context_snapshots_snapshot_date_unique; CREATE UNIQUE INDEX arbitrary_index ON ai_context_snapshots(snapshot_date)',
      )
      expect(() => assertPost030Schema(database, baselineSql)).toThrow(
        /ai_context_snapshots_snapshot_date_unique/,
      )
    } finally {
      database.close()
    }
  })

  it('validates physical schema again when only the baseline has already been recorded', async () => {
    const { dbPath, backupDir } = migrationTestPaths()
    const database = await initDbAtPathWithMigrationSafety(dbPath, {
      backupDir,
      logger: quietLogger,
    })
    database.exec('DROP INDEX idx_problems_status')
    closeDb()
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, { backupDir, logger: quietLogger }),
    ).rejects.toThrow(/schema mismatch/)
    expect(backupFiles(backupDir)).toHaveLength(1)
  })

  it('rejects FK-invalid records before backup or baseline adoption', async () => {
    const { dbPath, backupDir } = migrationTestPaths()
    const database = initDbAtPath(dbPath)
    database.pragma('foreign_keys=OFF')
    database.exec(
      "INSERT INTO user_script_values(id,script_id,value_key,value_json,created_at,updated_at) VALUES ('value','absent','key','{}',0,0)",
    )
    closeDb()
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, { backupDir, logger: quietLogger }),
    ).rejects.toThrow(/foreign key validation/)
    expect(backupFiles(backupDir)).toEqual([])
  })
})
