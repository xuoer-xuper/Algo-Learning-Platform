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
  MigrationRetryBlockedError,
} from '../../electron/backup/sqliteMigrationBackup'
import { applyDrizzleMigrations, inspectMigrationState } from '../../src/main/db/migrate'
import { loadMigrationResources } from '../../src/main/db/migration-resources'
import { subscribeDataChanges } from '../../electron/shared/dataEvents'
import provenance from './fixtures/provenance.json'
import {
  backupFiles,
  baselineFolder,
  cleanupMigrationTests,
  drizzleRows,
  expectedDrizzleRows,
  legacyIdentities,
  migrationTestPaths,
  quietLogger,
  resourceFixture,
} from './drizzle-migration-test-helpers'

afterEach(() => {
  vi.restoreAllMocks()
  cleanupMigrationTests()
})

function snapshot(database: Database.Database) {
  return {
    schema: database
      .prepare(
        "SELECT type,name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY name",
      )
      .all(),
    legacy: database.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),
    notes: database.prepare('SELECT * FROM notes').all(),
  }
}

function seedNote(database: Database.Database): void {
  database
    .prepare('INSERT INTO notes(id,title,file_path,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run('note', 'untouched', 'synthetic.md', 0, 0)
}

describe('safe Drizzle startup', () => {
  it.each(['fresh', 'existing30'] as const)(
    'backs up %s once, adopts baseline without replay, and reopens idempotently',
    async (kind) => {
      const { dbPath, backupDir } = migrationTestPaths()
      if (kind === 'existing30') {
        seedNote(initDbAtPath(dbPath))
        closeDb()
      }
      const options = { backupDir, drizzle: { folder: baselineFolder }, logger: quietLogger }
      const database = await initDbAtPathWithMigrationSafety(dbPath, options)
      expect(
        database.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all(),
      ).toEqual(legacyIdentities)
      expect(drizzleRows(database)).toEqual(expectedDrizzleRows())
      expect(database.pragma('foreign_keys', { simple: true })).toBe(1)
      if (kind === 'existing30')
        expect(database.prepare('SELECT title,created_at FROM notes').get()).toEqual({
          title: 'untouched',
          created_at: 0,
        })
      const backups = backupFiles(backupDir)
      expect(backups).toHaveLength(1)
      const backup = new Database(path.join(backupDir, backups[0]), { readonly: true })
      try {
        expect(
          backup.prepare("SELECT name FROM sqlite_schema WHERE name='__drizzle_migrations'").get(),
        ).toBeUndefined()
        if (kind === 'existing30')
          expect(backup.prepare('SELECT title FROM notes').get()).toEqual({ title: 'untouched' })
        else expect(backup.prepare('SELECT name FROM sqlite_schema').all()).toEqual([])
      } finally {
        backup.close()
      }
      closeDb()
      expect(drizzleRows(await initDbAtPathWithMigrationSafety(dbPath, options))).toEqual(
        expectedDrizzleRows(),
      )
      expect(backupFiles(backupDir)).toEqual(backups)
    },
  )

  it('backs up Drizzle-only work and accepts a known future schema without replaying DML on an empty database', async () => {
    const { directory, dbPath, backupDir } = migrationTestPaths()
    const initial = await initDbAtPathWithMigrationSafety(dbPath, {
      backupDir,
      logger: quietLogger,
    })
    seedNote(initial)
    closeDb()
    const drizzle = resourceFixture(
      directory,
      `CREATE TABLE future_note (title TEXT NOT NULL);
      --> statement-breakpoint
      INSERT INTO future_note SELECT title FROM notes;
      --> statement-breakpoint
      UPDATE notes SET title='future';`,
    )
    const options = { backupDir, drizzle, logger: quietLogger }
    const database = await initDbAtPathWithMigrationSafety(dbPath, options)
    expect(drizzleRows(database)).toEqual(expectedDrizzleRows(drizzle.expected))
    expect(database.prepare('SELECT title FROM future_note').all()).toEqual([
      { title: 'untouched' },
    ])
    expect(database.prepare('SELECT title FROM notes').get()).toEqual({ title: 'future' })
    expect(backupFiles(backupDir)).toHaveLength(2)
    const backup = new Database(path.join(backupDir, backupFiles(backupDir)[1]), { readonly: true })
    try {
      expect(drizzleRows(backup)).toEqual(expectedDrizzleRows())
      expect(backup.prepare('SELECT title FROM notes').get()).toEqual({ title: 'untouched' })
    } finally {
      backup.close()
    }
    closeDb()
    const reopened = await initDbAtPathWithMigrationSafety(dbPath, options)
    expect(reopened.prepare('SELECT title FROM future_note').all()).toEqual([
      { title: 'untouched' },
    ])
    expect(backupFiles(backupDir)).toHaveLength(2)
  })

  it.each(['legacy21', 'baseline'] as const)(
    'restores the complete %s attempt when a later migration fails, then blocks a repaired same-tag retry',
    async (kind) => {
      const { directory, dbPath, backupDir } = migrationTestPaths()
      if (kind === 'legacy21') {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true })
        const original = new Database(dbPath)
        original.exec(
          fs.readFileSync(
            path.resolve('tests/db/fixtures', provenance.releases[0].schemaFile),
            'utf8',
          ),
        )
        original
          .prepare('INSERT INTO notes(id,title,file_path,created_at,updated_at) VALUES (?,?,?,?,?)')
          .run('note', 'untouched', 'synthetic.md', '2026-01-01T00:00:00', '2026-01-01T00:00:00')
        original.close()
      } else {
        seedNote(await initDbAtPathWithMigrationSafety(dbPath, { backupDir, logger: quietLogger }))
        closeDb()
      }
      const original = new Database(dbPath, { readonly: true })
      const before = snapshot(original)
      const beforeDrizzle = kind === 'baseline' ? drizzleRows(original) : null
      original.close()
      const beforeBackups = backupFiles(backupDir).length
      const drizzle = resourceFixture(
        directory,
        `CREATE TABLE partial_future (value TEXT);
      --> statement-breakpoint
      UPDATE notes SET title='changed';
      --> statement-breakpoint
      INSERT INTO missing_failure_target VALUES (1);`,
      )
      await expect(
        initDbAtPathWithMigrationSafety(dbPath, { backupDir, drizzle, logger: quietLogger }),
      ).rejects.toThrow(/missing_failure_target/)
      const restored = new Database(dbPath, { readonly: true })
      try {
        expect(snapshot(restored)).toEqual(before)
        if (beforeDrizzle) expect(drizzleRows(restored)).toEqual(beforeDrizzle)
      } finally {
        restored.close()
      }
      const marker = JSON.parse(
        fs.readFileSync(getMigrationFailureMarkerPath(backupDir, dbPath), 'utf8'),
      )
      expect(marker.pendingMigrationKeys).toContain('drizzle:0001_future')
      if (kind === 'legacy21') {
        expect(marker.pendingMigrationKeys).toContain('drizzle:0000_baseline')
        expect(marker.pendingMigrations.map((entry: { version: number }) => entry.version)).toEqual(
          [22, 23, 24, 25, 26, 27, 28, 29, 30],
        )
      } else expect(marker.pendingMigrations).toEqual([])
      expect(backupFiles(backupDir)).toHaveLength(beforeBackups + 1)
      const repaired = resourceFixture(directory, 'CREATE TABLE repaired_future (value TEXT);')
      await expect(
        initDbAtPathWithMigrationSafety(dbPath, {
          backupDir,
          drizzle: repaired,
          logger: quietLogger,
        }),
      ).rejects.toBeInstanceOf(MigrationRetryBlockedError)
      expect(backupFiles(backupDir)).toHaveLength(beforeBackups + 1)
    },
  )

  it('revalidates resources after an asynchronous backup and restores if SQL changed', async () => {
    const { directory, dbPath, backupDir } = migrationTestPaths()
    initDbAtPath(dbPath)
    closeDb()
    const drizzle = resourceFixture(directory)
    const originalBackup = Database.prototype.backup
    vi.spyOn(Database.prototype, 'backup').mockImplementation(async function (
      this: Database.Database,
      destination,
      options,
    ) {
      const result = await originalBackup.call(this, destination, options)
      fs.appendFileSync(path.join(drizzle.folder, '0000_baseline.sql'), '\n-- changed')
      return result
    })
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, { backupDir, drizzle, logger: quietLogger }),
    ).rejects.toThrow(/invalid hash/)
    const restored = new Database(dbPath, { readonly: true })
    try {
      expect(
        restored.prepare("SELECT name FROM sqlite_schema WHERE name='__drizzle_migrations'").get(),
      ).toBeUndefined()
    } finally {
      restored.close()
    }
  })

  it('preserves the original migration error and a separate restoration error in the retry marker', async () => {
    const { directory, dbPath, backupDir } = migrationTestPaths()
    initDbAtPath(dbPath)
    closeDb()
    const drizzle = resourceFixture(directory, 'INSERT INTO original_failure_target VALUES (1);')
    const copyFile = fs.copyFileSync
    vi.spyOn(fs, 'copyFileSync').mockImplementation((source, destination, mode) => {
      if (String(destination).startsWith(`${dbPath}.restore-`))
        throw new Error('synthetic restore failure')
      copyFile(source, destination, mode)
    })
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, { backupDir, drizzle, logger: quietLogger }),
    ).rejects.toThrow(/original_failure_target/)
    const marker = JSON.parse(
      fs.readFileSync(getMigrationFailureMarkerPath(backupDir, dbPath), 'utf8'),
    )
    expect(marker.error).toContain('original_failure_target')
    expect(marker.restoreError).toBe('synthetic restore failure')
    expect(fs.existsSync(marker.backupPath)).toBe(true)
    await expect(
      initDbAtPathWithMigrationSafety(dbPath, { backupDir, drizzle, logger: quietLogger }),
    ).rejects.toBeInstanceOf(MigrationRetryBlockedError)
    expect(backupFiles(backupDir)).toHaveLength(1)
  })

  it('keeps explicit empty migration overrides legacy-only without requiring resources', async () => {
    const { directory, dbPath, backupDir } = migrationTestPaths()
    initDbAtPath(dbPath)
    closeDb()
    const database = await initDbAtPathWithMigrationSafety(dbPath, {
      backupDir,
      migrations: [],
      drizzle: { folder: path.join(directory, 'missing') },
      logger: quietLogger,
    })
    expect(
      database.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all(),
    ).toHaveLength(25)
    expect(
      database.prepare("SELECT name FROM sqlite_schema WHERE name='__drizzle_migrations'").get(),
    ).toBeUndefined()
    expect(backupFiles(backupDir)).toEqual([])
  })

  it('refuses inspection or upstream migration in an active transaction', () => {
    const database = initDbAtPath(':memory:')
    const resources = loadMigrationResources(baselineFolder)
    database.transaction(() => {
      expect(() => inspectMigrationState(database, resources, legacyIdentities)).toThrow(
        /idle connection/,
      )
      expect(() => applyDrizzleMigrations(database, resources, legacyIdentities)).toThrow(
        /idle connection/,
      )
    })()
    expect(
      database.prepare("SELECT name FROM sqlite_schema WHERE name='__drizzle_migrations'").get(),
    ).toBeUndefined()
  })

  it('does not emit data refresh notifications for schema inspection or adoption', async () => {
    const { dbPath, backupDir } = migrationTestPaths()
    initDbAtPath(dbPath)
    closeDb()
    const notified = vi.fn()
    const unsubscribe = subscribeDataChanges(notified)
    try {
      await initDbAtPathWithMigrationSafety(dbPath, { backupDir, logger: quietLogger })
      closeDb()
      await initDbAtPathWithMigrationSafety(dbPath, { backupDir, logger: quietLogger })
      expect(notified).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })
})
