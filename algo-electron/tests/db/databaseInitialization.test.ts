import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeDb,
  getDb,
  getKnownMigrations,
  initDbAtPath,
  initDbAtPathWithMigrationSafety,
} from '../../electron/db/connection'
import {
  getMigrationFailureMarkerPath,
  MigrationRetryBlockedError,
  writeMigrationFailureMarker,
} from '../../electron/backup/sqliteMigrationBackup'
import {
  getMigrationCheckpointPath,
  readMigrationCheckpoint,
} from '../../src/main/services/backup/lib/migration-checkpoint'
import { getMigrationDiagnostics } from '../../src/main/db/migration-diagnostics'
import type { Logger } from '../../electron/shared/logger'

const root = path.resolve('tmp/release-db-initialization')
fs.mkdirSync(root, { recursive: true })
const directories: string[] = []
const handles: Database.Database[] = []
const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
  getLogFilePath: () => null,
}

function paths() {
  const directory = fs.mkdtempSync(path.join(root, 'case-'))
  directories.push(directory)
  return {
    directory,
    dbPath: path.join(directory, 'data.sqlite'),
    backupDir: path.join(directory, 'backups'),
  }
}

function sourceDatabase(dbPath: string) {
  const database = new Database(dbPath)
  handles.push(database)
  return database
}

function seedCurrent(dbPath: string) {
  initDbAtPath(dbPath)
  getDb().exec("CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES ('preserved')")
  closeDb()
}

afterEach(() => {
  vi.restoreAllMocks()
  closeDb()
  for (const database of handles.splice(0)) if (database.open) database.close()
  for (const directory of directories.splice(0)) {
    expect(path.resolve(directory).startsWith(`${root}${path.sep}`)).toBe(true)
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 })
  }
})

describe('database startup owns every opened handle', () => {
  for (const pragma of ['journal_mode = WAL', 'foreign_keys = ON', 'busy_timeout = 5000']) {
    it(`closes on ${pragma} failure and preserves the original error through close and logging failures`, async () => {
      const { dbPath, backupDir } = paths()
      const primary = new Error('pragma failed')
      const closeError = new Error('close failed')
      const originalPragma = Database.prototype.pragma
      vi.spyOn(Database.prototype, 'pragma').mockImplementation(function (
        this: Database.Database,
        name,
        options,
      ) {
        if (name === pragma) throw primary
        return originalPragma.call(this, name, options)
      })
      const close = vi.spyOn(Database.prototype, 'close').mockImplementation(function (
        this: Database.Database,
      ) {
        handles.push(this)
        throw closeError
      })
      await expect(
        initDbAtPathWithMigrationSafety(dbPath, {
          backupDir,
          logger: {
            ...logger,
            error: () => {
              throw new Error('logger failed')
            },
          },
        }),
      ).rejects.toBe(primary)
      expect(close).toHaveBeenCalledTimes(1)
      expect(getMigrationDiagnostics(primary).map(({ stage }) => stage)).toContain(
        'db.initialization-close-failed',
      )
      expect(() => getDb()).toThrow('not initialized')
    })
  }

  it('closes on unreadable migration ledger without running backups or assigning global state', async () => {
    const { dbPath, backupDir } = paths()
    const database = sourceDatabase(dbPath)
    database.exec('CREATE TABLE schema_migrations(wrong TEXT)')
    database.close()
    const close = vi.spyOn(Database.prototype, 'close')
    const backup = vi.spyOn(Database.prototype, 'backup')
    await expect(initDbAtPathWithMigrationSafety(dbPath, { backupDir, logger })).rejects.toThrow()
    expect(close).toHaveBeenCalledTimes(1)
    expect(backup).not.toHaveBeenCalled()
    expect(() => getDb()).toThrow('not initialized')
  })
})

describe('production migration ledger validation', () => {
  for (const shape of ['future', 'gap', 'wrong-name', 'unversioned', 'empty-ledger']) {
    it(`rejects ${shape} history before migration or startup cleanup`, async () => {
      const { dbPath, backupDir } = paths()
      const database = sourceDatabase(dbPath)
      database.exec('CREATE TABLE sentinel(value TEXT)')
      if (shape !== 'unversioned') {
        database.exec(
          'CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)',
        )
        if (shape === 'future')
          database.exec("INSERT INTO schema_migrations VALUES (9001,'future','0')")
        if (shape === 'gap') {
          const migration = getKnownMigrations()[1]
          database
            .prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)')
            .run(migration.version, migration.name, '0')
        }
        if (shape === 'wrong-name')
          database.exec("INSERT INTO schema_migrations VALUES (1,'wrong','0')")
      }
      database.close()
      const backup = vi.spyOn(Database.prototype, 'backup')
      await expect(initDbAtPathWithMigrationSafety(dbPath, { backupDir, logger })).rejects.toThrow(
        /history/,
      )
      expect(backup).not.toHaveBeenCalled()
      expect(fs.existsSync(getMigrationCheckpointPath(dbPath))).toBe(false)
    })
  }
})

describe('durable migration attempt lifecycle with real SQLite', () => {
  it('creates a verified checkpoint before mutation and completes only after cleanup; reopen does not re-backup', async () => {
    const { dbPath, backupDir } = paths()
    seedCurrent(dbPath)
    await initDbAtPathWithMigrationSafety(dbPath, {
      backupDir,
      logger,
      migrations: [
        {
          version: 9001,
          name: 'success',
          up(database) {
            expect(readMigrationCheckpoint(dbPath, backupDir)?.state).toBe('prepared')
            database.exec('CREATE TABLE added(value INTEGER)')
          },
        },
      ],
    })
    expect(readMigrationCheckpoint(dbPath, backupDir)?.state).toBe('completed')
    getDb().exec("INSERT INTO sentinel VALUES ('post-upgrade')")
    closeDb()
    const backup = vi.spyOn(Database.prototype, 'backup')
    await initDbAtPathWithMigrationSafety(dbPath, { backupDir, migrations: [], logger })
    expect(backup).not.toHaveBeenCalled()
    expect(getDb().prepare('SELECT value FROM sentinel ORDER BY rowid').all()).toEqual([
      { value: 'preserved' },
      { value: 'post-upgrade' },
    ])
  })

  it('restores the whole attempt after an earlier migration commits and blocks even an explicit empty set', async () => {
    const { dbPath, backupDir } = paths()
    seedCurrent(dbPath)
    const primary = new Error('migration failed')
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, {
        backupDir,
        logger,
        migrations: [
          {
            version: 9001,
            name: 'committed',
            up: (database) => database.exec('CREATE TABLE removed(value INTEGER)'),
          },
          {
            version: 9002,
            name: 'failure',
            up: () => {
              throw primary
            },
          },
        ],
      }),
    ).rejects.toBe(primary)
    const restored = sourceDatabase(dbPath)
    expect(restored.prepare('SELECT value FROM sentinel').get()).toEqual({ value: 'preserved' })
    expect(
      restored.prepare("SELECT name FROM sqlite_schema WHERE name='removed'").get(),
    ).toBeUndefined()
    restored.close()
    const checkpoint = readMigrationCheckpoint(dbPath, backupDir)
    expect(checkpoint?.state).toBe('restored')
    expect(checkpoint?.recovery).toBeDefined()
    const open = vi.spyOn(Database.prototype, 'pragma')
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, { backupDir, migrations: [], logger }),
    ).rejects.toBeInstanceOf(MigrationRetryBlockedError)
    expect(() => initDbAtPath(dbPath)).toThrow(MigrationRetryBlockedError)
    expect(open).not.toHaveBeenCalled()
  })

  it('does not migrate when preparing the durable record fails', async () => {
    const { dbPath, backupDir } = paths()
    seedCurrent(dbPath)
    const primary = new Error('disk full')
    const rename = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to).endsWith('.migration-attempt.json')) throw primary
      rename(from, to)
    })
    const up = vi.fn()
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, {
        backupDir,
        logger,
        migrations: [{ version: 9001, name: 'blocked', up }],
      }),
    ).rejects.toBe(primary)
    expect(up).not.toHaveBeenCalled()
    expect(fs.readdirSync(backupDir).filter((file) => file.endsWith('.sqlite'))).toHaveLength(1)
  })

  it('retains the primary error when close, diagnostics, and marker updates fail, without replacing an open DB', async () => {
    const { dbPath, backupDir } = paths()
    seedCurrent(dbPath)
    const primary = new Error('primary migration failure')
    const close = Database.prototype.close
    vi.spyOn(Database.prototype, 'close').mockImplementation(function (this: Database.Database) {
      if (path.resolve(this.name) === dbPath) {
        handles.push(this)
        throw new Error('cannot close')
      }
      return close.call(this)
    })
    const rename = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to).endsWith('.migration-failure.json')) throw new Error('marker unavailable')
      rename(from, to)
    })
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, {
        backupDir,
        logger: {
          ...logger,
          error: () => {
            throw new Error('logger unavailable')
          },
        },
        migrations: [
          {
            version: 9001,
            name: 'failure',
            up: () => {
              throw primary
            },
          },
        ],
      }),
    ).rejects.toBe(primary)
    expect(readMigrationCheckpoint(dbPath, backupDir)?.state).toBe('restore-failed')
    expect(getMigrationDiagnostics(primary).map(({ stage }) => stage)).toEqual(
      expect.arrayContaining([
        'db.initialization-close-failed',
        'db.migration-marker-write-failed',
        'db.migration-diagnostic-log-failed',
      ]),
    )
    expect(fs.readdirSync(path.dirname(dbPath)).some((name) => name.includes('.recovery-'))).toBe(
      false,
    )
  })

  it('keeps a failed restoration blocked after commit even when no pending migrations remain', async () => {
    const { dbPath, backupDir } = paths()
    seedCurrent(dbPath)
    const cleanupError = new Error('cleanup failed')
    const prepare = Database.prototype.prepare
    vi.spyOn(Database.prototype, 'prepare').mockImplementation(function (
      this: Database.Database,
      sql,
    ) {
      if (sql.includes('UPDATE problem_visits')) throw cleanupError
      return prepare.call(this, sql)
    })
    vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('restore copy failed')
    })
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, {
        backupDir,
        logger,
        migrations: [
          {
            version: 9001,
            name: 'committed',
            up: (database) => database.exec('CREATE TABLE added(value INTEGER)'),
          },
        ],
      }),
    ).rejects.toBe(cleanupError)
    expect(readMigrationCheckpoint(dbPath, backupDir)?.state).toBe('restore-failed')
    vi.restoreAllMocks()
    const current = sourceDatabase(dbPath)
    expect(current.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({
      version: 9001,
    })
    current.close()
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, { backupDir, migrations: [], logger }),
    ).rejects.toBeInstanceOf(MigrationRetryBlockedError)
    expect(fs.existsSync(getMigrationFailureMarkerPath(backupDir, dbPath))).toBe(true)
  })

  it('blocks legacy restore errors and unrelated failures before opening a writable handle', async () => {
    const { dbPath, backupDir } = paths()
    writeMigrationFailureMarker(backupDir, dbPath, {
      databasePath: dbPath,
      backupPath: path.join(backupDir, 'old.sqlite'),
      failedAt: new Date().toISOString(),
      pendingMigrations: [{ version: 99, name: 'old' }],
      error: 'failed',
      restoreError: 'restore failed',
    })
    const pragma = vi.spyOn(Database.prototype, 'pragma')
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, { backupDir, migrations: [], logger }),
    ).rejects.toBeInstanceOf(MigrationRetryBlockedError)
    expect(pragma).not.toHaveBeenCalled()
    expect(fs.existsSync(dbPath)).toBe(false)
  })
})
