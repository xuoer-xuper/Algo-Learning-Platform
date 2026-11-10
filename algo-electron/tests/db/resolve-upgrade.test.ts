import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, expect, it, vi } from 'vitest'
import {
  closeDb,
  getDb,
  getKnownMigrations,
  initDbAtPathWithMigrationSafety,
} from '../../electron/db/connection'
import { runMigrations } from '../../electron/db/migrate'
import {
  getMigrationFailureMarkerPath,
  restoreDatabaseFromBackup,
  writeMigrationFailureMarker,
} from '../../electron/backup/sqliteMigrationBackup'
import {
  getMigrationCheckpointPath,
  readMigrationCheckpoint,
  writeMigrationCheckpoint,
  type MigrationCheckpoint,
} from '../../src/main/services/backup/lib/migration-checkpoint'
import { inspectUpgradeRecovery, resolveUpgrade } from '../../src/main/db/resolve-upgrade'
import { parseUpgradeMaintenanceCommand } from '../../src/main/services/backup/lib/upgrade-maintenance-command'

const root = path.resolve('tmp/upgrade-resolution-tests')
fs.mkdirSync(root, { recursive: true })
const directories: string[] = []
const handles: Database.Database[] = []
const legacyTimestamp = '2026-11-08T10:00:00.000Z'

function open(filePath: string, readonly = false) {
  const database = new Database(filePath, { readonly, fileMustExist: true })
  handles.push(database)
  return database
}

async function preparedTarget() {
  const userData = fs.mkdtempSync(path.join(root, 'profile-'))
  directories.push(userData)
  const databasePath = path.join(userData, 'data', 'algo-learning.sqlite')
  const backupDirectory = path.join(userData, 'backups')
  fs.mkdirSync(path.dirname(databasePath))
  const source = new Database(databasePath)
  source.exec(fs.readFileSync('tests/db/fixtures/rc1.schema.sql', 'utf8'))
  source.exec(
    "CREATE TABLE custom_records (value TEXT); INSERT INTO custom_records VALUES ('source'); CREATE VIEW custom_view AS SELECT * FROM custom_records",
  )
  source.close()
  const database = await initDbAtPathWithMigrationSafety(databasePath, {
    backupDir: backupDirectory,
  })
  database.exec("INSERT INTO custom_records VALUES ('post-upgrade')")
  database.exec(`
    INSERT INTO problems(id,platform,platform_problem_id,canonical_url,first_seen_at,created_at,updated_at)
    VALUES ('maintenance-problem','codeforces','fixture','https://example.test/fixture',1,1,1);
    INSERT INTO problem_visits(id,problem_id,platform,url,entered_at,created_at,updated_at)
    VALUES ('maintenance-visit','maintenance-problem','codeforces','https://example.test/fixture',1,1,1);
  `)
  closeDb()
  const completed = readMigrationCheckpoint(databasePath, backupDirectory)
  if (!completed) throw new Error('Test fixture did not produce a checkpoint')
  const checkpoint: MigrationCheckpoint = { ...completed, state: 'prepared' }
  writeMigrationCheckpoint(databasePath, backupDirectory, checkpoint)
  return { userData, databasePath, backupDirectory, checkpoint }
}

async function shippedLegacyAttempt(completeTarget: boolean) {
  const userData = fs.mkdtempSync(path.join(root, 'shipped-legacy-'))
  directories.push(userData)
  const databasePath = path.join(userData, 'data', 'algo-learning.sqlite')
  const backupDirectory = path.join(userData, 'backups')
  fs.mkdirSync(path.dirname(databasePath))
  fs.mkdirSync(backupDirectory)
  const database = new Database(databasePath)
  handles.push(database)
  database.pragma('foreign_keys = ON')
  runMigrations(database, getKnownMigrations().slice(0, 28))
  database
    .prepare(
      `
    INSERT INTO problems(id,platform,platform_problem_id,canonical_url,first_seen_at,created_at,updated_at)
    VALUES ('legacy-problem','codeforces','legacy','https://example.test/legacy',?,?,?)
  `,
    )
    .run(legacyTimestamp, legacyTimestamp, legacyTimestamp)
  database
    .prepare(
      `
    INSERT INTO problem_visits(id,problem_id,platform,url,entered_at,created_at,updated_at)
    VALUES ('legacy-visit','legacy-problem','codeforces','https://example.test/legacy',?,?,?)
  `,
    )
    .run(legacyTimestamp, legacyTimestamp, legacyTimestamp)
  const backupPath = path.join(backupDirectory, 'algo-learning-pre-migration-20261108100000.sqlite')
  // Real shipped 2.0.0 shape: source 001-028, pending 029, no format1 checkpoint/manifest.
  await database.backup(backupPath)
  if (completeTarget) runMigrations(database, getKnownMigrations().slice(28, 29))
  database.close()
  const markerPath = writeMigrationFailureMarker(backupDirectory, databasePath, {
    databasePath,
    backupPath,
    failedAt: legacyTimestamp,
    pendingMigrations: getKnownMigrations()
      .slice(28, 29)
      .map(({ version, name }) => ({ version, name })),
    error: 'synthetic shipped 2.0.0 initialization failure',
  })
  return { userData, databasePath, backupDirectory, backupPath, markerPath }
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

for (const resolution of ['keep-current', 'retry-source'] as const) {
  it(`resolves a shipped 2.0.0 prefix28 to29 failure with ${resolution} before a fresh protected upgrade to30`, async () => {
    const { userData, databasePath, backupDirectory, backupPath, markerPath } =
      await shippedLegacyAttempt(resolution === 'keep-current')
    const original = fs.readFileSync(markerPath)
    const match = inspectUpgradeRecovery(userData).match(/Upgrade attempt: ([a-f0-9-]+)/)
    if (!match) throw new Error('Missing legacy attempt ID')
    const attemptId = match[1]
    await resolveUpgrade(userData, { attemptId, resolution })
    const resolved = readMigrationCheckpoint(databasePath, backupDirectory)
    expect(resolved?.targetLedger.at(-1)?.version).toBe(29)
    expect(resolved?.source.ledger.at(-1)?.version).toBe(28)
    expect(resolved?.state).toBe(`resolved-${resolution}`)
    const current = open(databasePath, true)
    expect(current.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({
      version: resolution === 'keep-current' ? 29 : 28,
    })
    // New orphan cleanup writes Unix milliseconds and must not touch an earlier TEXT schema.
    expect(
      current
        .prepare('SELECT left_at, updated_at FROM problem_visits WHERE id=?')
        .get('legacy-visit'),
    ).toEqual({
      left_at: null,
      updated_at: legacyTimestamp,
    })
    current.close()
    await expect(resolveUpgrade(userData, { attemptId, resolution })).resolves.toContain(
      'already verified',
    )
    const upgraded = await initDbAtPathWithMigrationSafety(databasePath, {
      backupDir: backupDirectory,
    })
    expect(upgraded.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual(
      { version: 30 },
    )
    expect(
      upgraded
        .prepare('SELECT left_at, leave_reason FROM problem_visits WHERE id=?')
        .get('legacy-visit'),
    ).toEqual({
      left_at: Date.parse(legacyTimestamp),
      leave_reason: 'startup_recovery',
    })
    const next = readMigrationCheckpoint(databasePath, backupDirectory)
    expect(next?.state).toBe('completed')
    expect(next?.attemptId).not.toBe(attemptId)
    expect(next?.source.ledger.at(-1)?.version).toBe(resolution === 'keep-current' ? 29 : 28)
    expect(
      open(backupPath, true).prepare('SELECT MAX(version) AS version FROM schema_migrations').get(),
    ).toEqual({ version: 28 })
    const originalAudit = fs
      .readdirSync(backupDirectory)
      .find((name) => name.startsWith('algo-learning.sqlite.legacy-marker-'))
    if (!originalAudit) throw new Error('Missing original legacy marker audit')
    expect(fs.readFileSync(path.join(backupDirectory, originalAudit))).toEqual(original)
  })
}

for (const mismatch of ['empty', 'gap', 'wrong-name', 'future'] as const) {
  it(`refuses a shipped legacy marker with ${mismatch} pending history`, async () => {
    const { userData, databasePath, backupDirectory, backupPath } = await shippedLegacyAttempt(true)
    const pending = getKnownMigrations()
      .slice(mismatch === 'gap' ? 29 : 28, mismatch === 'gap' ? 30 : 29)
      .map(({ version, name }) => ({ version, name }))
    const marker = {
      databasePath,
      backupPath,
      failedAt: legacyTimestamp,
      error: 'synthetic historical mismatch',
      pendingMigrations:
        mismatch === 'empty'
          ? []
          : mismatch === 'wrong-name'
            ? [{ version: 29, name: 'incorrect' }]
            : mismatch === 'future'
              ? [...pending, { version: 999, name: 'future' }]
              : pending,
    }
    writeMigrationFailureMarker(backupDirectory, databasePath, marker)
    expect(() => inspectUpgradeRecovery(userData)).toThrow()
    expect(fs.existsSync(getMigrationCheckpointPath(databasePath))).toBe(false)
    await expect(
      initDbAtPathWithMigrationSafety(databasePath, { backupDir: backupDirectory }),
    ).rejects.toThrow('verified recovery')
    expect(() => getDb()).toThrow('not initialized')
  })
}

it('keeps a fully committed current database, preserves post-upgrade data/custom objects and allows restart', async () => {
  const { userData, databasePath, backupDirectory, checkpoint } = await preparedTarget()
  await expect(
    initDbAtPathWithMigrationSafety(databasePath, { backupDir: backupDirectory }),
  ).rejects.toThrow('verified recovery')
  await expect(
    resolveUpgrade(userData, { attemptId: checkpoint.attemptId, resolution: 'keep-current' }),
  ).resolves.toContain('retained')
  expect(readMigrationCheckpoint(databasePath, backupDirectory)?.state).toBe(
    'resolved-keep-current',
  )
  expect(open(databasePath, true).prepare('SELECT * FROM custom_view').all()).toEqual([
    { value: 'source' },
    { value: 'post-upgrade' },
  ])
  expect(
    open(databasePath, true)
      .prepare('SELECT left_at, leave_reason FROM problem_visits WHERE id=?')
      .get('maintenance-visit'),
  ).toEqual({
    left_at: 1,
    leave_reason: 'startup_recovery',
  })
  await expect(
    resolveUpgrade(userData, { attemptId: checkpoint.attemptId, resolution: 'keep-current' }),
  ).resolves.toContain('already verified')
  const reopened = await initDbAtPathWithMigrationSafety(databasePath, {
    backupDir: backupDirectory,
  })
  expect(reopened.prepare('SELECT count(*) AS count FROM custom_records').get()).toEqual({
    count: 2,
  })
})

it('verifies restored source and authorizes a new protected attempt without migrating in the command', async () => {
  const { userData, databasePath, backupDirectory, checkpoint } = await preparedTarget()
  let restored = checkpoint
  restoreDatabaseFromBackup(path.join(backupDirectory, checkpoint.backupBasename), databasePath, {
    attemptId: checkpoint.attemptId,
    expectedSource: checkpoint.source,
    expectedSha256: checkpoint.backupSha256,
    beforeDisplace: (recovery) => {
      restored = { ...checkpoint, recovery, state: 'restoring' }
      writeMigrationCheckpoint(databasePath, backupDirectory, restored)
    },
  })
  writeMigrationCheckpoint(databasePath, backupDirectory, { ...restored, state: 'restored' })
  await expect(
    resolveUpgrade(userData, { attemptId: checkpoint.attemptId, resolution: 'retry-source' }),
  ).resolves.toContain('did not run migrations')
  const source = open(databasePath, true)
  expect(source.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({
    version: 29,
  })
  source.close()
  await expect(
    resolveUpgrade(userData, { attemptId: checkpoint.attemptId, resolution: 'retry-source' }),
  ).resolves.toContain('already verified')
  await initDbAtPathWithMigrationSafety(databasePath, { backupDir: backupDirectory })
  expect(readMigrationCheckpoint(databasePath, backupDirectory)?.attemptId).not.toBe(
    checkpoint.attemptId,
  )
})

for (const failure of [
  'wrong-id',
  'partial-schema',
  'future-ledger',
  'checkpoint-write',
  'backup',
  'source-tamper',
  'close',
]) {
  it(`keeps startup blocked on ${failure}`, async () => {
    const { userData, databasePath, backupDirectory, checkpoint } = await preparedTarget()
    if (failure === 'partial-schema')
      open(databasePath).exec('ALTER TABLE problems ADD COLUMN unexpected INTEGER')
    if (failure === 'future-ledger')
      open(databasePath).exec("INSERT INTO schema_migrations VALUES (999,'future',0)")
    if (failure === 'checkpoint-write') {
      const rename = fs.renameSync
      vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        if (String(to) === getMigrationCheckpointPath(databasePath))
          throw new Error('checkpoint write failed')
        rename(from, to)
      })
    }
    if (failure === 'backup')
      vi.spyOn(Database.prototype, 'backup').mockRejectedValue(new Error('backup failed'))
    if (failure === 'source-tamper')
      fs.appendFileSync(path.join(backupDirectory, checkpoint.backupBasename), Buffer.from([1]))
    if (failure === 'close') {
      const close = Database.prototype.close
      vi.spyOn(Database.prototype, 'close').mockImplementation(function (
        this: Database.Database,
      ): Database.Database {
        if (path.resolve(this.name) === databasePath) {
          close.call(this)
          throw new Error('current close failed')
        }
        return close.call(this)
      })
    }
    await expect(
      resolveUpgrade(userData, {
        attemptId:
          failure === 'wrong-id' ? '12345678-1234-4123-8123-123456789abc' : checkpoint.attemptId,
        resolution: 'keep-current',
      }),
    ).rejects.toThrow()
    expect(readMigrationCheckpoint(databasePath, backupDirectory)?.state).toBe('prepared')
    await expect(
      initDbAtPathWithMigrationSafety(databasePath, { backupDir: backupDirectory }),
    ).rejects.toThrow('verified recovery')
  })
}

it('refuses retry-source for upgraded data and refuses a missing recorded recovery set', async () => {
  const { userData, databasePath, backupDirectory, checkpoint } = await preparedTarget()
  await expect(
    resolveUpgrade(userData, { attemptId: checkpoint.attemptId, resolution: 'retry-source' }),
  ).rejects.toThrow()
  writeMigrationCheckpoint(databasePath, backupDirectory, {
    ...checkpoint,
    state: 'restored',
    recovery: {
      directoryBasename: `algo-learning.sqlite.recovery-${checkpoint.attemptId}`,
      files: ['main'],
    },
  })
  await expect(
    resolveUpgrade(userData, { attemptId: checkpoint.attemptId, resolution: 'keep-current' }),
  ).rejects.toThrow()
  expect(readMigrationCheckpoint(databasePath, backupDirectory)?.state).toBe('restored')
})

for (const mismatch of ['backup', 'pending']) {
  it(`refuses a same-ID failure marker with a different ${mismatch}`, async () => {
    const { userData, databasePath, backupDirectory, checkpoint } = await preparedTarget()
    const marker = {
      databasePath,
      backupPath: path.join(backupDirectory, checkpoint.backupBasename),
      attemptId: checkpoint.attemptId,
      failedAt: new Date().toISOString(),
      pendingMigrations: checkpoint.targetLedger.slice(checkpoint.source.ledger.length),
      error: 'synthetic failure',
    }
    const mismatched = {
      ...marker,
      backupPath:
        mismatch === 'backup' ? path.join(backupDirectory, 'different.sqlite') : marker.backupPath,
      pendingMigrations: mismatch === 'pending' ? [] : marker.pendingMigrations,
    }
    writeMigrationFailureMarker(backupDirectory, databasePath, mismatched)
    await expect(
      resolveUpgrade(userData, { attemptId: checkpoint.attemptId, resolution: 'keep-current' }),
    ).rejects.toThrow()
    expect(readMigrationCheckpoint(databasePath, backupDirectory)?.state).toBe('prepared')
    writeMigrationFailureMarker(backupDirectory, databasePath, marker)
    await resolveUpgrade(userData, { attemptId: checkpoint.attemptId, resolution: 'keep-current' })
    writeMigrationFailureMarker(backupDirectory, databasePath, mismatched)
    await expect(
      initDbAtPathWithMigrationSafety(databasePath, { backupDir: backupDirectory }),
    ).rejects.toThrow('verified recovery')
    expect(() => getDb()).toThrow('not initialized')
    writeMigrationFailureMarker(backupDirectory, databasePath, marker)
    await initDbAtPathWithMigrationSafety(databasePath, { backupDir: backupDirectory })
  })
}

for (const damage of ['missing', 'corrupt', 'prepared', 'snapshot']) {
  it(`blocks normal startup when the verified resolution audit is ${damage}`, async () => {
    const { userData, databasePath, backupDirectory, checkpoint } = await preparedTarget()
    await resolveUpgrade(userData, { attemptId: checkpoint.attemptId, resolution: 'keep-current' })
    const directory = path.join(backupDirectory, 'resolutions')
    const auditPath = path.join(directory, `${checkpoint.attemptId}.keep-current.json`)
    if (damage === 'missing') fs.rmSync(auditPath)
    if (damage === 'corrupt') fs.writeFileSync(auditPath, '{invalid')
    if (damage === 'prepared')
      fs.writeFileSync(
        auditPath,
        fs.readFileSync(auditPath, 'utf8').replace('"verified"', '"prepared"'),
      )
    if (damage === 'snapshot') {
      const snapshot = fs.readdirSync(directory).find((file) => file.endsWith('.sqlite'))
      if (!snapshot) throw new Error('Missing protected current snapshot')
      fs.appendFileSync(path.join(directory, snapshot), Buffer.from([1]))
    }
    await expect(
      initDbAtPathWithMigrationSafety(databasePath, { backupDir: backupDirectory }),
    ).rejects.toThrow('verified recovery')
    expect(() => getDb()).toThrow('not initialized')
    expect(readMigrationCheckpoint(databasePath, backupDirectory)?.state).toBe(
      'resolved-keep-current',
    )
    expect(
      open(databasePath, true).prepare('SELECT count(*) AS count FROM custom_records').get(),
    ).toEqual({
      count: 2,
    })
  })
}

it('associates a valid legacy marker deterministically, preserves its exact original bytes and resolves without deletion', async () => {
  const { userData, databasePath, backupDirectory, checkpoint } = await preparedTarget()
  fs.rmSync(getMigrationCheckpointPath(databasePath))
  const markerPath = writeMigrationFailureMarker(backupDirectory, databasePath, {
    databasePath,
    backupPath: path.join(backupDirectory, checkpoint.backupBasename),
    failedAt: new Date().toISOString(),
    pendingMigrations: checkpoint.targetLedger.slice(checkpoint.source.ledger.length),
    error: 'legacy failure',
    restoreError: 'legacy restoration interrupted',
  })
  const original = fs.readFileSync(markerPath)
  const first = inspectUpgradeRecovery(userData)
  expect(inspectUpgradeRecovery(userData)).toBe(first)
  expect(fs.existsSync(getMigrationCheckpointPath(databasePath))).toBe(false)
  const match = first.match(/Upgrade attempt: ([a-f0-9-]+)/)
  if (!match) throw new Error('Expected inspected attempt UUID')
  const attemptId = match[1]
  expect(attemptId[14]).toBe('5')
  await resolveUpgrade(userData, { attemptId, resolution: 'keep-current' })
  expect(fs.existsSync(markerPath)).toBe(true)
  const auditName = fs
    .readdirSync(backupDirectory)
    .find((name) => name.startsWith('algo-learning.sqlite.legacy-marker-'))
  if (!auditName) throw new Error('Missing original marker audit')
  expect(fs.readFileSync(path.join(backupDirectory, auditName))).toEqual(original)
  await expect(
    resolveUpgrade(userData, { attemptId, resolution: 'keep-current' }),
  ).resolves.toContain('already verified')
  await initDbAtPathWithMigrationSafety(databasePath, { backupDir: backupDirectory })
})

it('resumes a verified legacy source retry when failure archival completed before checkpoint replacement failed', async () => {
  const { userData, databasePath, backupDirectory, checkpoint } = await preparedTarget()
  restoreDatabaseFromBackup(path.join(backupDirectory, checkpoint.backupBasename), databasePath, {
    attemptId: checkpoint.attemptId,
    expectedSource: checkpoint.source,
    expectedSha256: checkpoint.backupSha256,
  })
  fs.rmSync(getMigrationCheckpointPath(databasePath))
  const markerPath = writeMigrationFailureMarker(backupDirectory, databasePath, {
    databasePath,
    backupPath: path.join(backupDirectory, checkpoint.backupBasename),
    failedAt: new Date().toISOString(),
    pendingMigrations: checkpoint.targetLedger.slice(checkpoint.source.ledger.length),
    error: 'legacy failure',
  })
  const match = inspectUpgradeRecovery(userData).match(/Upgrade attempt: ([a-f0-9-]+)/)
  if (!match) throw new Error('Missing legacy attempt ID')
  const attemptId = match[1]
  await resolveUpgrade(userData, { attemptId, resolution: 'retry-source' })
  const rename = fs.renameSync
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (String(to) === getMigrationCheckpointPath(databasePath))
      throw new Error('new checkpoint replacement interrupted')
    rename(from, to)
  })
  await expect(
    initDbAtPathWithMigrationSafety(databasePath, { backupDir: backupDirectory }),
  ).rejects.toThrow('new checkpoint replacement interrupted')
  expect(() => getDb()).toThrow('not initialized')
  expect(fs.existsSync(markerPath)).toBe(false)
  expect(fs.existsSync(`${markerPath}.resolved-${attemptId}.json`)).toBe(true)
  expect(readMigrationCheckpoint(databasePath, backupDirectory)?.state).toBe(
    'resolved-retry-source',
  )
  vi.restoreAllMocks()
  await expect(
    resolveUpgrade(userData, { attemptId, resolution: 'retry-source' }),
  ).resolves.toContain('already verified')
  await initDbAtPathWithMigrationSafety(databasePath, { backupDir: backupDirectory })
  expect(readMigrationCheckpoint(databasePath, backupDirectory)?.state).toBe('completed')
  expect(readMigrationCheckpoint(databasePath, backupDirectory)?.attemptId).not.toBe(attemptId)
})

it('repeats interrupted legacy association safely and never accepts a missing original audit', async () => {
  const { userData, databasePath, backupDirectory, checkpoint } = await preparedTarget()
  fs.rmSync(getMigrationCheckpointPath(databasePath))
  const markerPath = writeMigrationFailureMarker(backupDirectory, databasePath, {
    databasePath,
    backupPath: path.join(backupDirectory, checkpoint.backupBasename),
    failedAt: new Date().toISOString(),
    pendingMigrations: checkpoint.targetLedger.slice(checkpoint.source.ledger.length),
    error: 'legacy failure',
  })
  const original = fs.readFileSync(markerPath)
  const match = inspectUpgradeRecovery(userData).match(/Upgrade attempt: ([a-f0-9-]+)/)
  if (!match) throw new Error('Missing legacy attempt ID')
  const attemptId = match[1]
  const rename = fs.renameSync
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (String(to) === markerPath) throw new Error('link update interrupted')
    rename(from, to)
  })
  await expect(resolveUpgrade(userData, { attemptId, resolution: 'keep-current' })).rejects.toThrow(
    'link update interrupted',
  )
  expect(fs.readFileSync(markerPath)).toEqual(original)
  expect(readMigrationCheckpoint(databasePath, backupDirectory)?.state).toBe('prepared')
  vi.restoreAllMocks()
  await resolveUpgrade(userData, { attemptId, resolution: 'keep-current' })
  const auditName = fs
    .readdirSync(backupDirectory)
    .find((name) => name.startsWith('algo-learning.sqlite.legacy-marker-'))
  if (!auditName) throw new Error('Missing raw marker audit')
  fs.rmSync(path.join(backupDirectory, auditName))
  await expect(
    resolveUpgrade(userData, { attemptId, resolution: 'keep-current' }),
  ).rejects.toThrow()
  await expect(
    initDbAtPathWithMigrationSafety(databasePath, { backupDir: backupDirectory }),
  ).rejects.toThrow('verified recovery')
})

it('strictly parses maintenance UUID, action, duplicates, unsupported flags and paths', () => {
  const id = '12345678-1234-4123-8123-123456789abc'
  expect(parseUpgradeMaintenanceCommand([])).toEqual({ kind: 'normal' })
  expect(
    parseUpgradeMaintenanceCommand([`--resolve-upgrade=${id}`, '--resolution=keep-current']),
  ).toEqual({
    kind: 'resolve',
    request: { attemptId: id, resolution: 'keep-current' },
  })
  for (const flags of [
    ['--resolve-upgrade=bad', '--resolution=keep-current'],
    [`--resolve-upgrade=${id}`, '--resolution=unknown'],
    [`--resolve-upgrade=${id}`, '--resolution=keep-current', '--resolution=retry-source'],
    [`--resolve-upgrade=${id}`, '--resolution=keep-current', '--db-path=elsewhere'],
    [`--resolve-upgrade=${id}`, '--resolution=keep-current', 'elsewhere.sqlite'],
    ['elsewhere.sqlite', `--resolve-upgrade=${id}`, '--resolution=keep-current'],
    ['--recover-db'],
    ['--restore-upgrade'],
    ['--migration-path=elsewhere'],
    ['--upgrade-recovery=whatever'],
    ['--resolution=keep-current'],
  ])
    expect(parseUpgradeMaintenanceCommand(flags).kind).toBe('invalid')
})
