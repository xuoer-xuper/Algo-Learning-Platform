import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import {
  assertNoUnresolvedMigrationCheckpoint,
  canonicalPath,
  getMigrationCheckpointPath,
  MigrationRetryBlockedError,
  readMigrationCheckpoint,
  writeDurableJson,
  writeMigrationCheckpoint,
  type MigrationCheckpoint,
} from '../../src/main/services/backup/lib/migration-checkpoint'
import { getMigrationDiagnostics } from '../../src/main/db/migration-diagnostics'

const root = path.resolve('tmp/release-db-checkpoint')
fs.mkdirSync(root, { recursive: true })
const directories: string[] = []

function setup() {
  const directory = fs.mkdtempSync(path.join(root, 'case-'))
  directories.push(directory)
  const databasePath = path.join(directory, 'data.sqlite')
  const backupDirectory = path.join(directory, 'backups')
  fs.mkdirSync(backupDirectory)
  const record: MigrationCheckpoint = {
    formatVersion: 1,
    attemptId: randomUUID(),
    databasePath: canonicalPath(databasePath),
    backupDirectory: canonicalPath(backupDirectory),
    backupBasename: 'snapshot.sqlite',
    backupSha256: '0'.repeat(64),
    source: { ledger: [], schemaHash: '0'.repeat(64) },
    targetLedger: [{ version: 1, name: 'initial' }],
    state: 'prepared',
    createdAt: 1,
    updatedAt: 1,
  }
  return { directory, databasePath, backupDirectory, record }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of directories.splice(0)) {
    expect(path.resolve(directory).startsWith(`${root}${path.sep}`)).toBe(true)
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('blocks unresolved checkpoints and archives a resolved attempt before replacing it', () => {
  const { databasePath, backupDirectory, record } = setup()
  for (const state of ['prepared', 'restoring', 'restored', 'restore-failed'] as const) {
    writeMigrationCheckpoint(databasePath, backupDirectory, {
      ...record,
      state,
      recovery: { directoryBasename: `data.sqlite.recovery-${record.attemptId}`, files: ['main'] },
    })
    expect(() => assertNoUnresolvedMigrationCheckpoint(databasePath, backupDirectory)).toThrow(
      MigrationRetryBlockedError,
    )
  }
  expect(() =>
    writeMigrationCheckpoint(databasePath, backupDirectory, { ...record, attemptId: randomUUID() }),
  ).toThrow(MigrationRetryBlockedError)
  writeMigrationCheckpoint(databasePath, backupDirectory, {
    ...record,
    state: 'resolved-retry-source',
  })
  expect(() => assertNoUnresolvedMigrationCheckpoint(databasePath, backupDirectory)).not.toThrow()
  const next = { ...record, attemptId: randomUUID() }
  writeMigrationCheckpoint(databasePath, backupDirectory, next)
  expect(readMigrationCheckpoint(databasePath, backupDirectory)).toEqual(next)
  expect(
    fs.existsSync(path.join(backupDirectory, `data.sqlite.attempt-${record.attemptId}.json`)),
  ).toBe(true)
})

it('rejects malformed, path-traversing and identity-mismatched records', () => {
  const { databasePath, backupDirectory, record } = setup()
  for (const corrupt of [
    { ...record, backupBasename: '../outside.sqlite' },
    { ...record, databasePath: path.join(path.dirname(databasePath), 'other.sqlite') },
    { ...record, backupDirectory: path.join(backupDirectory, 'other') },
    { ...record, state: 'unknown' },
    {
      ...record,
      source: { ledger: [{ version: 5, name: 'future' }], schemaHash: record.source.schemaHash },
    },
  ]) {
    fs.writeFileSync(getMigrationCheckpointPath(databasePath), JSON.stringify(corrupt))
    expect(() => readMigrationCheckpoint(databasePath, backupDirectory)).toThrow(
      MigrationRetryBlockedError,
    )
  }
})

it('retains the durable old record if replacement fails and preserves write failure over close failure', () => {
  const { databasePath, backupDirectory, record } = setup()
  writeMigrationCheckpoint(databasePath, backupDirectory, record)
  vi.spyOn(fs, 'renameSync').mockImplementation(() => {
    throw new Error('rename denied')
  })
  expect(() =>
    writeMigrationCheckpoint(databasePath, backupDirectory, { ...record, state: 'completed' }),
  ).toThrow('rename denied')
  expect(readMigrationCheckpoint(databasePath, backupDirectory)?.state).toBe('prepared')
  vi.restoreAllMocks()
  const primary = new Error('write failed')
  const close = fs.closeSync
  vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
    throw primary
  })
  vi.spyOn(fs, 'closeSync').mockImplementation((descriptor) => {
    close(descriptor)
    throw new Error('close failed')
  })
  expect(() => writeDurableJson(getMigrationCheckpointPath(databasePath), {})).toThrow(primary)
  expect(getMigrationDiagnostics(primary).map(({ stage }) => stage)).toContain(
    'db.checkpoint-close-failed',
  )
  expect(readMigrationCheckpoint(databasePath, backupDirectory)?.state).toBe('prepared')
})

it('rejects junctions rather than writing records into an unexpected directory', () => {
  const { directory } = setup()
  const destination = path.join(directory, 'destination')
  const link = path.join(directory, 'linked')
  fs.mkdirSync(destination)
  fs.symlinkSync(destination, link, 'junction')
  try {
    expect(() => writeDurableJson(path.join(link, 'record.json'), {})).toThrow('links')
    expect(fs.readdirSync(destination)).toEqual([])
  } finally {
    fs.unlinkSync(link)
  }
})
