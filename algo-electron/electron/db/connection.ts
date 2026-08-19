import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { appLogger, type Logger } from '../shared/logger'
import { closeOrphanProblemVisits } from '../tracking/orphanProblemVisits'
import {
  assertMigrationRetryAllowed,
  clearMigrationFailureMarker,
  createPreMigrationBackup,
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

let db: Database.Database | null = null
let dbFilePath: string | null = null
let dbInitialization: Promise<Database.Database> | null = null
const require = createRequire(import.meta.url)

const allMigrations = [
  migration001, migration002, migration003, migration004,
  migration005, migration006, migration007, migration008,
  migration009, migration010, migration011, migration012, migration013,
  migration014, migration015, migration016, migration017, migration018,
  migration019, migration020, migration021,
  migration022, migration023, migration024, migration025, migration026,
]

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

  const database = openDatabase(dbPath)
  try {
    runMigrations(database, allMigrations)
    closeStartupOrphans(database)
    assignDatabase(database, dbPath)
    return database
  } catch (error) {
    database.close()
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
  const logger = options.logger ?? appLogger
  const migrations = options.migrations ?? allMigrations
  const database = openDatabase(dbPath)
  let backupPath: string | null = null
  const pendingMigrations = getPendingMigrations(database, migrations)

  try {
    assertMigrationRetryAllowed(options.backupDir, dbPath, pendingMigrations)
    if (pendingMigrations.length > 0) {
      backupPath = await createPreMigrationBackup(
        database,
        dbPath,
        options.backupDir,
        options.now?.() ?? new Date(),
      )
      logger.info('db.pre-migration-backup-completed', {
        backupPath,
        pendingVersions: pendingMigrations.map(migration => migration.version),
      })
    }

    runMigrations(database, migrations, logger)
    closeStartupOrphans(database, logger)
    clearMigrationFailureMarker(options.backupDir, dbPath)
    assignDatabase(database, dbPath)
    return database
  } catch (error) {
    database.close()
    if (!backupPath) throw error

    let restoreError: unknown
    try {
      restoreDatabaseFromBackup(backupPath, dbPath)
      logger.warn('db.migration-backup-restored', { backupPath, dbPath })
    } catch (caughtRestoreError) {
      restoreError = caughtRestoreError
      logger.fatal('db.migration-backup-restore-failed', { backupPath, dbPath, error: caughtRestoreError })
    }

    const markerPath = writeMigrationFailureMarker(options.backupDir, dbPath, {
      databasePath: dbPath,
      backupPath,
      failedAt: new Date().toISOString(),
      pendingMigrations: pendingMigrations.map(({ version, name }) => ({ version, name })),
      error: errorMessage(error),
      ...(restoreError ? { restoreError: errorMessage(restoreError) } : {}),
    })
    logger.fatal('db.migration-startup-blocked', { markerPath, error, restoreError })
    throw error
  }
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    dbFilePath = null
  }
}

function openDatabase(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const database = new Database(dbPath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  return database
}

function assignDatabase(database: Database.Database, dbPath: string): void {
  db = database
  dbFilePath = dbPath
}

function closeStartupOrphans(database: Database.Database, logger: Logger = appLogger): void {
  const closedCount = closeOrphanProblemVisits(database)
  if (closedCount > 0) logger.warn('tracking.orphan-visits-closed', { count: closedCount })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
