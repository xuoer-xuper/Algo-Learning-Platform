import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { closeDb } from '../../electron/db/connection'
import { logger } from '../../electron/shared/logger'
import {
  KNOWN_DRIZZLE_MIGRATIONS,
  type KnownDrizzleMigration,
} from '../../src/main/db/migration-resources'
import provenance from './fixtures/provenance.json'

export const baselineFolder = path.resolve('drizzle')
export const legacyIdentities = [
  ...provenance.releases[2].migrations,
  { version: 30, name: 'timestamps_to_unix_ms' },
]
export const quietLogger = { ...logger, debug() {}, info() {}, warn() {}, error() {}, fatal() {} }

const directories: string[] = []

export function migrationTestPaths() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-drizzle-a1-'))
  directories.push(directory)
  return {
    directory,
    dbPath: path.join(directory, 'data', 'test.sqlite'),
    backupDir: path.join(directory, 'backups'),
  }
}

export function cleanupMigrationTests(): void {
  closeDb()
  for (const directory of directories.splice(0)) {
    const resolved = path.resolve(directory)
    if (!resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-drizzle-a1-`)) {
      throw new Error('Unsafe migration test cleanup path')
    }
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  }
}

export function resourceFixture(directory: string, laterSql?: string) {
  const folder = path.join(directory, 'drizzle')
  fs.mkdirSync(path.join(folder, 'meta'), { recursive: true })
  fs.copyFileSync(
    path.join(baselineFolder, '0000_baseline.sql'),
    path.join(folder, '0000_baseline.sql'),
  )
  const expected: KnownDrizzleMigration[] = [...KNOWN_DRIZZLE_MIGRATIONS]
  if (laterSql !== undefined) {
    const tag = '0001_future'
    fs.writeFileSync(path.join(folder, `${tag}.sql`), laterSql)
    expected.push({
      tag,
      when: KNOWN_DRIZZLE_MIGRATIONS[0].when + 1,
      sha256: createHash('sha256').update(laterSql).digest('hex'),
    })
  }
  fs.writeFileSync(
    path.join(folder, 'meta', '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'sqlite',
      entries: expected.map(({ tag, when }, idx) => ({
        idx,
        version: '6',
        tag,
        when,
        breakpoints: true,
      })),
    }),
  )
  return { folder, expected }
}

export function backupFiles(backupDir: string): string[] {
  return fs.existsSync(backupDir)
    ? fs
        .readdirSync(backupDir)
        .filter((file) => file.endsWith('.sqlite'))
        .sort()
    : []
}

export function drizzleRows(database: Database.Database) {
  return database
    .prepare('SELECT id,hash,created_at FROM __drizzle_migrations ORDER BY created_at')
    .all()
}

export function expectedDrizzleRows(
  identities: readonly KnownDrizzleMigration[] = KNOWN_DRIZZLE_MIGRATIONS,
) {
  return identities.map(({ sha256: hash, when: created_at }) => ({ id: null, hash, created_at }))
}
