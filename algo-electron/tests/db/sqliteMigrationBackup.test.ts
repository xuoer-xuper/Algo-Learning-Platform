import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { afterEach, expect, it, vi } from 'vitest'
import {
  assertMigrationRetryAllowed,
  clearMigrationFailureMarker,
  createPreMigrationBackup,
  getMigrationFailureMarkerPath,
  MigrationRetryBlockedError,
  restoreDatabaseFromBackup,
  retainNewestMigrationBackups,
  verifyMigrationBackup,
  writeMigrationFailureMarker,
} from '../../electron/backup/sqliteMigrationBackup'
import { readDatabaseState } from '../../src/main/db/legacy-ledger-validation'
import {
  canonicalPath,
  readMigrationCheckpoint,
  sha256File,
  writeMigrationCheckpoint,
  type MigrationCheckpoint,
  type RecoverySet,
} from '../../src/main/services/backup/lib/migration-checkpoint'

const root = path.resolve('tmp/release-db-backups')
fs.mkdirSync(root, { recursive: true })
const directories: string[] = []
const handles: Database.Database[] = []

function paths() {
  const directory = fs.mkdtempSync(path.join(root, 'case-'))
  directories.push(directory)
  const dbPath = path.join(directory, 'data.sqlite')
  const database = new Database(dbPath)
  handles.push(database)
  database.exec(`
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT);
    INSERT INTO schema_migrations VALUES (1,'initial','2026-01-01');
    CREATE TABLE sentinel(value BLOB);
    INSERT INTO sentinel VALUES (x'0080ff');
  `)
  return { directory, dbPath, backupDir: path.join(directory, 'backups'), database }
}

function open(filePath: string) {
  const database = new Database(filePath, { readonly: true, fileMustExist: true })
  handles.push(database)
  return database
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const database of handles.splice(0)) if (database.open) database.close()
  for (const directory of directories.splice(0)) {
    expect(path.resolve(directory).startsWith(`${root}${path.sep}`)).toBe(true)
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 })
  }
})

it('verifies actual SQLite backups independently and prunes only after explicit success', async () => {
  const { dbPath, backupDir, database } = paths()
  const backups: string[] = []
  for (let index = 0; index < 4; index += 1) {
    backups.push(
      await createPreMigrationBackup(database, dbPath, backupDir, new Date(1000 * index)),
    )
    fs.utimesSync(backups[index], new Date(index * 1000), new Date(index * 1000))
  }
  expect(backups.every((file) => fs.existsSync(file))).toBe(true)
  expect(retainNewestMigrationBackups(backupDir, dbPath)).toHaveLength(3)
  expect(fs.existsSync(backups[0])).toBe(false)
  const snapshot = open(backups[3])
  expect(snapshot.prepare('SELECT value FROM sentinel').get()).toEqual({
    value: Buffer.from([0, 128, 255]),
  })
  expect(verifyMigrationBackup(backups[3], readDatabaseState(database))).toEqual(
    readDatabaseState(database),
  )
  expect(() => retainNewestMigrationBackups(backupDir, dbPath, 0)).toThrow('At least one')
})

it('leaves old snapshots intact when backup produces a partial, corrupt, or wrong-ledger snapshot', async () => {
  const { dbPath, backupDir, database } = paths()
  const backupPath = await createPreMigrationBackup(database, dbPath, backupDir)
  const hash = sha256File(backupPath)
  vi.spyOn(database, 'backup').mockImplementation(async (destination) => {
    fs.writeFileSync(destination, 'incomplete')
    throw new Error('ENOSPC')
  })
  await expect(createPreMigrationBackup(database, dbPath, backupDir)).rejects.toThrow('ENOSPC')
  vi.spyOn(database, 'backup').mockImplementation(async (destination) => {
    fs.writeFileSync(destination, 'not sqlite')
    return { totalPages: 1, remainingPages: 0 }
  })
  await expect(createPreMigrationBackup(database, dbPath, backupDir)).rejects.toThrow()
  vi.spyOn(database, 'backup').mockImplementation(async (destination) => {
    const wrong = new Database(destination)
    wrong.exec('CREATE TABLE wrong(id INTEGER)')
    wrong.close()
    return { totalPages: 1, remainingPages: 0 }
  })
  await expect(createPreMigrationBackup(database, dbPath, backupDir)).rejects.toThrow(/history/)
  expect(sha256File(backupPath)).toBe(hash)
  expect(fs.readdirSync(backupDir).filter((file) => file.endsWith('.sqlite'))).toHaveLength(1)
  expect(fs.readdirSync(backupDir).filter((file) => file.endsWith('.partial'))).toHaveLength(3)
})

it('pins active recovery points even when a caller asks to prune', async () => {
  const { dbPath, backupDir, database } = paths()
  const source = readDatabaseState(database)
  const first = await createPreMigrationBackup(database, dbPath, backupDir)
  const checkpoint: MigrationCheckpoint = {
    formatVersion: 1,
    attemptId: randomUUID(),
    databasePath: canonicalPath(dbPath),
    backupDirectory: canonicalPath(backupDir),
    backupBasename: path.basename(first),
    backupSha256: sha256File(first),
    source,
    targetLedger: [...source.ledger, { version: 2, name: 'next' }],
    state: 'prepared',
    createdAt: 1,
    updatedAt: 1,
  }
  writeMigrationCheckpoint(dbPath, backupDir, checkpoint)
  for (let index = 0; index < 4; index += 1)
    await createPreMigrationBackup(database, dbPath, backupDir)
  retainNewestMigrationBackups(backupDir, dbPath, 1)
  expect(fs.existsSync(first)).toBe(true)
  expect(fs.readdirSync(backupDir).filter((file) => file.endsWith('.sqlite'))).toHaveLength(5)
})

it('keeps the newest validated backup when pruning fails and never prunes corrupt metadata evidence', async () => {
  const { dbPath, backupDir, database } = paths()
  const backups: string[] = []
  for (let index = 0; index < 4; index += 1) {
    backups.push(await createPreMigrationBackup(database, dbPath, backupDir))
    fs.utimesSync(backups[index], new Date(index * 1000), new Date(index * 1000))
  }
  vi.spyOn(fs, 'rmSync').mockImplementation(() => {
    throw new Error('permission denied')
  })
  expect(() => retainNewestMigrationBackups(backupDir, dbPath)).toThrow('permission denied')
  expect(backups.every((file) => fs.existsSync(file))).toBe(true)
  vi.restoreAllMocks()
  fs.writeFileSync(`${backups[0]}.verified.json`, '{}')
  expect(() => retainNewestMigrationBackups(backupDir, dbPath)).toThrow()
  expect(backups.every((file) => fs.existsSync(file))).toBe(true)
})

it('rejects corrupt restoration candidates before touching the original database', async () => {
  const { dbPath, backupDir, database } = paths()
  const backupPath = await createPreMigrationBackup(database, dbPath, backupDir)
  database.close()
  const original = sha256File(dbPath)
  fs.writeFileSync(backupPath, 'corrupt')
  expect(() => restoreDatabaseFromBackup(backupPath, dbPath)).toThrow()
  expect(sha256File(dbPath)).toBe(original)
})

it('refuses a source snapshot with foreign-key violations even when SQLite integrity_check passes', async () => {
  const { dbPath, backupDir, database } = paths()
  database.pragma('foreign_keys = OFF')
  database.exec(
    'CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id REFERENCES parent(id)); INSERT INTO child VALUES(7)',
  )
  expect(database.pragma('integrity_check', { simple: true })).toBe('ok')
  await expect(createPreMigrationBackup(database, dbPath, backupDir)).rejects.toThrow('foreign key')
  expect(fs.readdirSync(backupDir).filter((file) => file.endsWith('.sqlite'))).toEqual([])
})

it('preserves the closed main/WAL/SHM set together and records intent before displacement', async () => {
  const { dbPath, backupDir, database, directory } = paths()
  const source = readDatabaseState(database)
  const backupPath = await createPreMigrationBackup(database, dbPath, backupDir)
  database.exec("INSERT INTO sentinel VALUES (x'ff')")
  database.close()
  // Opaque sidecars test preservation, not SQLite recovery validity. Main/backup are real SQLite.
  fs.writeFileSync(`${dbPath}-wal`, 'closed-wal-evidence')
  fs.writeFileSync(`${dbPath}-shm`, 'closed-shm-evidence')
  const originalHash = sha256File(dbPath)
  const attemptId = randomUUID()
  const beforeDisplace = vi.fn((recovery: RecoverySet) => {
    expect(fs.existsSync(dbPath)).toBe(true)
    expect(fs.existsSync(`${dbPath}-wal`)).toBe(true)
    expect(fs.existsSync(path.join(directory, recovery.directoryBasename, 'intent.json'))).toBe(
      true,
    )
  })
  restoreDatabaseFromBackup(backupPath, dbPath, {
    attemptId,
    expectedSource: source,
    expectedSha256: sha256File(backupPath),
    beforeDisplace,
  })
  expect(beforeDisplace).toHaveBeenCalledTimes(1)
  const preserved = path.join(directory, `${path.basename(dbPath)}.recovery-${attemptId}`)
  expect(sha256File(path.join(preserved, 'main.sqlite'))).toBe(originalHash)
  expect(fs.readFileSync(path.join(preserved, 'main.sqlite-wal'), 'utf8')).toBe(
    'closed-wal-evidence',
  )
  expect(fs.readFileSync(path.join(preserved, 'main.sqlite-shm'), 'utf8')).toBe(
    'closed-shm-evidence',
  )
  expect(open(dbPath).prepare('SELECT count(*) AS count FROM sentinel').get()).toEqual({ count: 1 })
})

for (const stage of ['intent', 'main', 'wal', 'shm', 'install', 'verify']) {
  it(`retains all evidence when restoration fails at ${stage}`, async () => {
    const { dbPath, backupDir, database, directory } = paths()
    const backupPath = await createPreMigrationBackup(database, dbPath, backupDir)
    database.close()
    fs.writeFileSync(`${dbPath}-wal`, 'wal')
    fs.writeFileSync(`${dbPath}-shm`, 'shm')
    const originalHash = sha256File(dbPath)
    const backupHash = sha256File(backupPath)
    const attemptId = randomUUID()
    const preserved = path.join(directory, `${path.basename(dbPath)}.recovery-${attemptId}`)
    const rename = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      const target = String(to)
      const fail =
        (stage === 'main' && target === path.join(preserved, 'main.sqlite')) ||
        (stage === 'wal' && target === path.join(preserved, 'main.sqlite-wal')) ||
        (stage === 'shm' && target === path.join(preserved, 'main.sqlite-shm')) ||
        (stage === 'install' && target === dbPath)
      if (fail) throw new Error(stage)
      rename(from, to)
      if (stage === 'verify' && target === dbPath)
        fs.writeFileSync(dbPath, 'injected invalid install')
    })
    expect(() =>
      restoreDatabaseFromBackup(backupPath, dbPath, {
        attemptId,
        expectedSha256: backupHash,
        beforeDisplace: () => {
          if (stage === 'intent') throw new Error(stage)
        },
      }),
    ).toThrow()
    const main = fs.existsSync(path.join(preserved, 'main.sqlite'))
      ? path.join(preserved, 'main.sqlite')
      : dbPath
    expect(sha256File(main)).toBe(originalHash)
    for (const suffix of ['wal', 'shm']) {
      const file = fs.existsSync(`${dbPath}-${suffix}`)
        ? `${dbPath}-${suffix}`
        : path.join(preserved, `main.sqlite-${suffix}`)
      expect(fs.readFileSync(file, 'utf8')).toBe(suffix)
    }
    expect(sha256File(backupPath)).toBe(backupHash)
  })
}

it('fails closed for legacy failure records regardless of pending overlap, and never deletes them to unblock', () => {
  const { dbPath, backupDir } = paths()
  const markerPath = writeMigrationFailureMarker(backupDir, dbPath, {
    databasePath: dbPath,
    backupPath: path.join(backupDir, 'old.sqlite'),
    failedAt: new Date().toISOString(),
    pendingMigrations: [{ version: 25, name: 'failed' }],
    error: 'failed',
    restoreError: 'restore failed',
  })
  expect(markerPath).toBe(getMigrationFailureMarkerPath(backupDir, dbPath))
  expect(() => assertMigrationRetryAllowed(backupDir, dbPath, [])).toThrow(
    MigrationRetryBlockedError,
  )
  expect(() =>
    assertMigrationRetryAllowed(backupDir, dbPath, [{ version: 26, name: 'new' }]),
  ).toThrow(MigrationRetryBlockedError)
  expect(() => clearMigrationFailureMarker(backupDir, dbPath)).toThrow(MigrationRetryBlockedError)
  expect(fs.existsSync(markerPath)).toBe(true)
  fs.writeFileSync(markerPath, '{invalid')
  expect(() => assertMigrationRetryAllowed(backupDir, dbPath, [])).toThrow(
    MigrationRetryBlockedError,
  )
  expect(readMigrationCheckpoint(dbPath, backupDir)).toBeNull()
})
