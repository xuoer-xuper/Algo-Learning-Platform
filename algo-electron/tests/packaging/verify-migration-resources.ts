import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { closeDb, initDbAtPathWithMigrationSafety } from '../../electron/db/connection'
import {
  KNOWN_DRIZZLE_MIGRATIONS,
  loadMigrationResources,
  resolveMigrationFolder,
} from '../../src/main/db/migration-resources'

function requireAbsoluteArgument(index: number, name: string): string {
  const value = process.argv[index]
  assert.ok(value && path.isAbsolute(value), `${name} must be an absolute path`)
  return value
}

function checkPackagedResources(resourcesPath: string, scratchRoot: string): string {
  const folder = resolveMigrationFolder({
    packaged: true,
    appRoot: path.join(scratchRoot, 'nonexistent-app-root'),
    resourcesPath,
  })
  assert.equal(folder, path.join(resourcesPath, 'drizzle'))
  assert.ok(fs.lstatSync(folder).isDirectory(), 'Packaged migrations must be a real directory')
  const resources = loadMigrationResources(folder)
  const sqlFiles = resources.migrations.map(({ tag }) => `${tag}.sql`)
  assert.deepEqual(
    fs.readdirSync(folder).sort(),
    [...sqlFiles, 'meta'].sort(),
    'Packaged migration resources must exclude snapshots, documentation and unrelated files',
  )
  for (const file of sqlFiles) {
    assert.ok(fs.lstatSync(path.join(folder, file)).isFile(), `${file} must be a regular file`)
  }
  const metaFolder = path.join(folder, 'meta')
  assert.ok(fs.lstatSync(metaFolder).isDirectory(), 'Migration meta must be a real directory')
  assert.deepEqual(fs.readdirSync(metaFolder), ['_journal.json'])
  assert.ok(fs.lstatSync(path.join(metaFolder, '_journal.json')).isFile())
  return folder
}

function checkStartupDatabase(databasePath: string): void {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    assert.deepEqual(
      database
        .prepare<[], { version: number }>('SELECT version FROM schema_migrations ORDER BY version')
        .all()
        .map(({ version }) => version),
      Array.from({ length: 30 }, (_, index) => index + 1),
      'The packaged app must finish every legacy migration before baseline adoption',
    )
    assert.deepEqual(
      database
        .prepare<[], { hash: string; created_at: number }>(
          'SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at',
        )
        .all(),
      KNOWN_DRIZZLE_MIGRATIONS.map(({ sha256, when }) => ({ hash: sha256, created_at: when })),
      'The packaged app must record exactly the compiled Drizzle history',
    )
    assert.deepEqual(database.pragma('foreign_key_check'), [])
    assert.deepEqual(database.pragma('integrity_check'), [{ integrity_check: 'ok' }])
  } finally {
    database.close()
  }
}

async function checkRejectedResourceCopies(folder: string, scratchRoot: string): Promise<void> {
  const baseline = KNOWN_DRIZZLE_MIGRATIONS[0]
  assert.ok(baseline, 'The compiled baseline identity must exist')
  const cases = [
    {
      name: 'missing-journal',
      mutate: (copy: string): void => fs.unlinkSync(path.join(copy, 'meta', '_journal.json')),
      error: /Migration journal is missing or unreadable/,
    },
    {
      name: 'invalid-journal',
      mutate: (copy: string): void =>
        fs.writeFileSync(path.join(copy, 'meta', '_journal.json'), '{invalid-json'),
      error: /Migration journal is missing or unreadable/,
    },
    {
      name: 'missing-sql',
      mutate: (copy: string): void => fs.unlinkSync(path.join(copy, `${baseline.tag}.sql`)),
      error: /Migration SQL resource set does not match the compiled history/,
    },
    {
      name: 'tampered-journal',
      mutate: (copy: string): void => {
        const journalPath = path.join(copy, 'meta', '_journal.json')
        const journal = fs.readFileSync(journalPath, 'utf8')
        assert.ok(journal.includes(String(baseline.when)))
        fs.writeFileSync(
          journalPath,
          journal.replace(String(baseline.when), String(baseline.when + 1)),
        )
      },
      error: /Migration journal order or identity mismatch/,
    },
    {
      name: 'tampered-sql',
      mutate: (copy: string): void =>
        fs.appendFileSync(path.join(copy, `${baseline.tag}.sql`), '\n-- untrusted mutation\n'),
      error: /Migration SQL is missing or has an invalid hash/,
    },
  ]
  for (const testCase of cases) {
    const caseRoot = path.join(scratchRoot, testCase.name)
    const copiedFolder = path.join(caseRoot, 'resources', 'drizzle')
    const dataDir = path.join(caseRoot, 'user-data', 'data')
    const databasePath = path.join(dataDir, 'rejected.sqlite')
    const backupDir = path.join(caseRoot, 'user-data', 'backups')
    fs.cpSync(folder, copiedFolder, { recursive: true, errorOnExist: true, force: false })
    testCase.mutate(copiedFolder)
    await assert.rejects(async () => {
      try {
        await initDbAtPathWithMigrationSafety(databasePath, {
          backupDir,
          drizzle: { folder: copiedFolder },
        })
      } finally {
        closeDb()
      }
    }, testCase.error)
    assert.equal(fs.existsSync(databasePath), false, `${testCase.name} created a database file`)
    assert.equal(fs.existsSync(dataDir), false, `${testCase.name} opened the target database`)
    assert.equal(fs.existsSync(backupDir), false, `${testCase.name} created a backup directory`)
  }
}

const resourcesPath = requireAbsoluteArgument(2, 'resourcesPath')
const databasePath = requireAbsoluteArgument(3, 'databasePath')
const scratchRoot = requireAbsoluteArgument(4, 'scratchRoot')
assert.equal(fs.existsSync(scratchRoot), false, 'Resource mutation fixtures must be new')
const folder = checkPackagedResources(resourcesPath, scratchRoot)
checkStartupDatabase(databasePath)
console.log(
  '[PASS] Packaged SQL/journal match the compiled history; post-exit startup ledger is complete',
)
await checkRejectedResourceCopies(folder, scratchRoot)
checkPackagedResources(resourcesPath, scratchRoot)
console.log(
  '[PASS] Copied-resource loader/initializer checks reject missing/tampered resources before creating a database; packaged originals remain intact',
)
