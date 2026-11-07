import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initDbAtPathWithMigrationSafety } from '../../electron/db/connection'
import {
  KNOWN_DRIZZLE_MIGRATIONS,
  loadMigrationResources,
  resolveMigrationFolder,
} from '../../src/main/db/migration-resources'
import {
  cleanupMigrationTests,
  migrationTestPaths,
  quietLogger,
  resourceFixture,
} from './drizzle-migration-test-helpers'

afterEach(() => {
  vi.restoreAllMocks()
  cleanupMigrationTests()
})

interface Journal {
  version: string
  dialect: string
  entries: Array<{ idx: number; version: string; tag: string; when: number; breakpoints: boolean }>
}

describe('trusted Drizzle migration resources', () => {
  it('resolves development and packaged roots independently from cwd', () => {
    const appRoot = path.resolve('some-app')
    const resourcesPath = path.resolve('some-resources')
    expect(resolveMigrationFolder({ packaged: false, appRoot, resourcesPath })).toBe(
      path.join(appRoot, 'drizzle'),
    )
    expect(resolveMigrationFolder({ packaged: true, appRoot, resourcesPath })).toBe(
      path.join(resourcesPath, 'drizzle'),
    )
    expect(() =>
      resolveMigrationFolder({ packaged: false, appRoot: 'relative', resourcesPath }),
    ).toThrow(/absolute/)
    expect(() => loadMigrationResources('relative')).toThrow(/absolute/)
  })

  it.each([
    'missing journal',
    'malformed JSON',
    'wrong dialect',
    'wrong version',
    'empty entries',
    'gap idx',
    'wrong entry version',
    'wrong tag',
    'traversal tag',
    'absolute tag',
    'wrong timestamp',
    'unsafe timestamp',
    'missing SQL',
    'changed SQL',
    'unknown SQL',
    'unknown uppercase SQL',
    'SQL directory',
  ] as const)(
    'rejects %s before opening the target database or creating its directory',
    async (kind) => {
      const { directory, dbPath, backupDir } = migrationTestPaths()
      const drizzle = resourceFixture(directory)
      const journalPath = path.join(drizzle.folder, 'meta', '_journal.json')
      const journal: Journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
      if (kind === 'wrong dialect') journal.dialect = 'postgresql'
      if (kind === 'wrong version') journal.version = '6'
      if (kind === 'empty entries') journal.entries = []
      if (kind === 'gap idx') journal.entries[0].idx = 1
      if (kind === 'wrong entry version') journal.entries[0].version = '7'
      if (kind === 'wrong tag') journal.entries[0].tag = '0000_other'
      if (kind === 'traversal tag') journal.entries[0].tag = '../outside'
      if (kind === 'absolute tag') journal.entries[0].tag = path.resolve('outside')
      if (kind === 'wrong timestamp') journal.entries[0].when += 1
      if (kind === 'unsafe timestamp') journal.entries[0].when = Number.MAX_SAFE_INTEGER + 1
      fs.writeFileSync(journalPath, JSON.stringify(journal))
      if (kind === 'missing journal') fs.rmSync(journalPath)
      if (kind === 'malformed JSON') fs.writeFileSync(journalPath, '{invalid')
      if (kind === 'missing SQL') fs.rmSync(path.join(drizzle.folder, '0000_baseline.sql'))
      if (kind === 'changed SQL')
        fs.appendFileSync(path.join(drizzle.folder, '0000_baseline.sql'), '\n-- changed bytes')
      if (kind === 'unknown SQL')
        fs.writeFileSync(path.join(drizzle.folder, '0001_unknown.sql'), 'SELECT 1')
      if (kind === 'unknown uppercase SQL')
        fs.writeFileSync(path.join(drizzle.folder, '0001_unknown.SQL'), 'SELECT 1')
      if (kind === 'SQL directory') fs.mkdirSync(path.join(drizzle.folder, '0001_directory.sql'))
      const pragma = vi.spyOn(Database.prototype, 'pragma')
      await expect(
        initDbAtPathWithMigrationSafety(dbPath, { backupDir, drizzle, logger: quietLogger }),
      ).rejects.toThrow(/Migration/)
      expect(pragma).not.toHaveBeenCalled()
      expect(fs.existsSync(path.dirname(dbPath))).toBe(false)
      expect(fs.existsSync(backupDir)).toBe(false)
    },
  )

  it.each([
    'duplicate timestamp',
    'reversed timestamp',
    'duplicate tag',
    'unknown journal entry',
  ] as const)('rejects %s instead of delegating timestamp decisions to upstream', (kind) => {
    const { directory } = migrationTestPaths()
    const drizzle = resourceFixture(directory, 'SELECT 1;')
    if (kind === 'duplicate timestamp')
      drizzle.expected[1] = { ...drizzle.expected[1], when: drizzle.expected[0].when }
    if (kind === 'reversed timestamp')
      drizzle.expected[1] = { ...drizzle.expected[1], when: drizzle.expected[0].when - 1 }
    if (kind === 'duplicate tag')
      drizzle.expected[1] = { ...drizzle.expected[1], tag: drizzle.expected[0].tag }
    if (kind === 'unknown journal entry') drizzle.expected.pop()
    expect(() => loadMigrationResources(drizzle.folder, drizzle.expected)).toThrow(
      /Compiled|compiled/,
    )
  })

  it('pins immutable baseline bytes and freezes the loaded identities', () => {
    const { directory } = migrationTestPaths()
    const drizzle = resourceFixture(directory)
    const resources = loadMigrationResources(drizzle.folder)
    expect(resources.migrations[0]).toMatchObject(KNOWN_DRIZZLE_MIGRATIONS[0])
    expect(Object.isFrozen(resources)).toBe(true)
    expect(Object.isFrozen(resources.migrations)).toBe(true)
    expect(Object.isFrozen(resources.migrations[0])).toBe(true)
    expect(() => loadMigrationResources(drizzle.folder, [])).toThrow(/compiled/)
    expect(() =>
      loadMigrationResources(drizzle.folder, [{ ...drizzle.expected[0], tag: '../outside' }]),
    ).toThrow(/compiled/)
  })
})
