import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { logger as baseLogger, type Logger } from '../shared/logger'
import { closeOrphanProblemVisits } from '../tracking/orphanProblemVisits'
import {
  assertMigrationRetryAllowed,
  archiveResolvedMigrationFailureMarker,
  createPreMigrationBackup,
  retainNewestMigrationBackups,
  restoreDatabaseFromBackup,
  writeMigrationFailureMarker,
} from '../backup/sqliteMigrationBackup'
import { getPendingMigrations, runMigrations, type Migration } from './migrate'
import { migration001 } from './migrations/001_initial'
import { migration002 } from './migrations/002_submissions'
import { migration003 } from './migrations/003_fix_codeforces_canonical_urls'
import { migration004 } from './migrations/004_fix_codeforces_gym_page_urls'
import { migration005 } from './migrations/005_daily_stats'
import { migration006 } from './migrations/006_rating'
import { migration007 } from './migrations/007_site_configs'
import { migration008 } from './migrations/008_user_scripts'
import { migration009 } from './migrations/009_user_scripts_file'
import { migration010 } from './migrations/010_notes'
import { migration011 } from './migrations/011_notes_content'
import { migration012 } from './migrations/012_submission_code_snippets'
import { migration013 } from './migrations/013_drop_submission_code_snippets'
import { migration014 } from './migrations/014_ai_context_snapshots'
import { migration015 } from './migrations/015_ai_outputs'
import { migration016 } from './migrations/016_clear_codeforces_placeholder_titles'
import { migration017 } from './migrations/017_backfill_problem_context'
import { migration018 } from './migrations/018_normalize_codeforces_submission_ids'
import { migration019 } from './migrations/019_cookie_records'
import { migration020 } from './migrations/020_sync_queue'
import { migration021 } from './migrations/021_sync_metadata_fields'
import { migration022 } from './migrations/022_coach_events'
import { migration023 } from './migrations/023_coach_interventions'
import { migration024 } from './migrations/024_coach_feedback'
import { migration025 } from './migrations/025_userscript_identity'
import { migration026 } from './migrations/026_site_credentials'
import { migration027 } from './migrations/027_userscript_runtime'
import { migration028 } from './migrations/028_site_login_autofill'
import { migration029 } from './migrations/029_site_credential_labels'
import { migration030 } from './migrations/030_timestamps_to_unix_ms'
import {
  assertDatabaseIntegrity,
  assertLegacyLedgerEquals,
  readDatabaseState,
  validateLegacyLedger,
} from '../../src/main/db/legacy-ledger-validation'
import { reportMigrationDiagnostic } from '../../src/main/db/migration-diagnostics'
import {
  canonicalPath,
  readMigrationCheckpoint,
  sha256File,
  writeMigrationCheckpoint,
  type MigrationCheckpoint,
} from '../../src/main/services/backup/lib/migration-checkpoint'

let db: Database.Database | null = null
let dbFilePath: string | null = null
let dbInitialization: Promise<Database.Database> | null = null
const require = createRequire(import.meta.url)

const allMigrations = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013,
  migration014,
  migration015,
  migration016,
  migration017,
  migration018,
  migration019,
  migration020,
  migration021,
  migration022,
  migration023,
  migration024,
  migration025,
  migration026,
  migration027,
  migration028,
  migration029,
  migration030,
]

export function getKnownMigrations(): readonly Migration[] {
  return allMigrations
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return db
}

export async function initDb(): Promise<Database.Database> {
  if (db) return db
  if (dbInitialization) return dbInitialization

  const electron = require('electron') as { app?: { getPath: (name: string) => string } }
  if (!electron.app) {
    throw new Error('Electron app is not available. Use initDbAtPath() in Node tests.')
  }

  const userDataDir = electron.app.getPath('userData')
  const dataDir = path.join(userDataDir, 'data')
  const dbPath = path.join(dataDir, 'algo-learning.sqlite')
  const backupDir = path.join(userDataDir, 'backups')
  const initialization = initDbAtPathWithMigrationSafety(dbPath, { backupDir })
  dbInitialization = initialization
  void initialization.then(clearDatabaseInitialization, clearDatabaseInitialization)
  return initialization
}

export function initDbAtPath(dbPath: string): Database.Database {
  if (db) return db
  if (dbInitialization) throw new Error('Database initialization is already in progress.')

  const previous = readMigrationCheckpoint(dbPath)
  assertMigrationRetryAllowed(
    previous?.backupDirectory ?? path.join(path.dirname(path.dirname(dbPath)), 'backups'),
    dbPath,
  )
  const database = openDatabase(dbPath, baseLogger)
  try {
    validateLegacyLedger(database, allMigrations)
    runMigrations(database, allMigrations)
    closeStartupOrphans(database)
    assignDatabase(database, dbPath)
    return database
  } catch (error) {
    closeAfterFailure(database, error, baseLogger)
    throw error
  }
}

export interface SafeDatabaseInitializationOptions {
  backupDir: string
  migrations?: readonly Migration[]
  logger?: Logger
  now?: () => Date
}

export async function initDbAtPathWithMigrationSafety(
  dbPath: string,
  options: SafeDatabaseInitializationOptions,
): Promise<Database.Database> {
  if (db) return db
  const logger = options.logger ?? baseLogger
  const migrations = options.migrations ?? allMigrations
  assertMigrationRetryAllowed(options.backupDir, dbPath)
  const database = openDatabase(dbPath, logger)
  let checkpoint: MigrationCheckpoint | null = null
  try {
    if (options.migrations === undefined) validateLegacyLedger(database, allMigrations)
    const source = readDatabaseState(database)
    const pendingMigrations = getPendingMigrations(database, migrations)
    if (pendingMigrations.length > 0) {
      const backupPath = await createPreMigrationBackup(
        database,
        dbPath,
        options.backupDir,
        options.now?.() ?? new Date(),
        source,
      )
      const prepared: MigrationCheckpoint = {
        formatVersion: 1,
        attemptId: randomUUID(),
        databasePath: canonicalPath(dbPath),
        backupDirectory: canonicalPath(options.backupDir),
        backupBasename: path.basename(backupPath),
        backupSha256: sha256File(backupPath),
        source,
        targetLedger: [
          ...source.ledger,
          ...pendingMigrations.map(({ version, name }) => ({ version, name })),
        ].sort((left, right) => left.version - right.version),
        state: 'prepared',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      archiveResolvedMigrationFailureMarker(options.backupDir, dbPath)
      writeMigrationCheckpoint(dbPath, options.backupDir, prepared)
      checkpoint = prepared
      logger.info('db.pre-migration-backup-completed', {
        backupPath,
        pendingVersions: pendingMigrations.map((migration) => migration.version),
      })
      runMigrations(database, migrations, logger)
      assertLegacyLedgerEquals(readDatabaseState(database).ledger, prepared.targetLedger)
    }
    closeStartupOrphans(database, logger)
    if (checkpoint) {
      assertDatabaseIntegrity(database)
      writeMigrationCheckpoint(dbPath, options.backupDir, {
        ...checkpoint,
        state: 'completed',
        updatedAt: Date.now(),
      })
    }
  } catch (error) {
    const isClosed = closeAfterFailure(database, error, logger)
    if (checkpoint)
      recoverFailedInitialization(dbPath, options.backupDir, checkpoint, isClosed, error, logger)
    throw error
  }
  // The recovery boundary is over. Cleanup/logging failures must not roll back a usable DB.
  if (checkpoint) {
    try {
      retainNewestMigrationBackups(options.backupDir, dbPath)
    } catch (error) {
      reportMigrationDiagnostic(error, 'db.migration-backup-prune-failed', error, logger)
    }
  }
  assignDatabase(database, dbPath)
  return database
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    dbFilePath = null
  }
}

function openDatabase(dbPath: string, logger: Logger): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const database = new Database(dbPath)
  try {
    database.pragma('journal_mode = WAL')
    database.pragma('foreign_keys = ON')
    database.pragma('busy_timeout = 5000')
    return database
  } catch (error) {
    closeAfterFailure(database, error, logger)
    throw error
  }
}

function closeAfterFailure(database: Database.Database, primary: unknown, logger: Logger): boolean {
  try {
    database.close()
    return true
  } catch (error) {
    reportMigrationDiagnostic(primary, 'db.initialization-close-failed', error, logger)
    return false
  }
}

function recoverFailedInitialization(
  dbPath: string,
  backupDirectory: string,
  prepared: MigrationCheckpoint,
  isClosed: boolean,
  primary: unknown,
  logger: Logger,
): void {
  let checkpoint = prepared
  let hasRestoreFailure = !isClosed
  const backupPath = path.join(backupDirectory, prepared.backupBasename)
  if (isClosed) {
    try {
      restoreDatabaseFromBackup(backupPath, dbPath, {
        attemptId: prepared.attemptId,
        expectedSource: prepared.source,
        expectedSha256: prepared.backupSha256,
        beforeDisplace: (recovery) => {
          checkpoint = { ...prepared, state: 'restoring', recovery, updatedAt: Date.now() }
          writeMigrationCheckpoint(dbPath, backupDirectory, checkpoint)
        },
      })
    } catch (error) {
      hasRestoreFailure = true
      reportMigrationDiagnostic(primary, 'db.migration-backup-restore-failed', error, logger)
    }
  }
  try {
    writeMigrationCheckpoint(dbPath, backupDirectory, {
      ...checkpoint,
      state: hasRestoreFailure ? 'restore-failed' : 'restored',
      updatedAt: Date.now(),
    })
  } catch (error) {
    reportMigrationDiagnostic(primary, 'db.migration-checkpoint-write-failed', error, logger)
  }
  try {
    writeMigrationFailureMarker(backupDirectory, dbPath, {
      databasePath: dbPath,
      backupPath,
      attemptId: prepared.attemptId,
      failedAt: new Date().toISOString(),
      pendingMigrations: prepared.targetLedger.filter(
        (entry) => !prepared.source.ledger.some((source) => source.version === entry.version),
      ),
      error: 'Database initialization failed; original error retained in startup diagnostics.',
      ...(hasRestoreFailure
        ? { restoreError: 'Recovery did not complete. Preserve all recovery files.' }
        : {}),
    })
  } catch (error) {
    reportMigrationDiagnostic(primary, 'db.migration-marker-write-failed', error, logger)
  }
  reportMigrationDiagnostic(primary, 'db.migration-startup-blocked', primary, logger)
}

function assignDatabase(database: Database.Database, dbPath: string): void {
  db = database
  dbFilePath = dbPath
}

function closeStartupOrphans(database: Database.Database, logger: Logger = baseLogger): void {
  const closedCount = closeOrphanProblemVisits(database)
  if (closedCount > 0) logger.warn('tracking.orphan-visits-closed', { count: closedCount })
}

function clearDatabaseInitialization(): void {
  dbInitialization = null
}

export function getDbPath(): string {
  if (!dbFilePath) {
    throw new Error('Database path is not available. Call initDb() or initDbAtPath() first.')
  }
  return dbFilePath
}
