import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { z } from 'zod'
import {
  createPreMigrationBackup,
  getMigrationFailureMarkerPath,
  readMigrationFailureMarker,
  verifyMigrationBackup,
  writeMigrationFailureMarker,
  type MigrationFailureMarker,
} from '../../../electron/backup/sqliteMigrationBackup'
import { getKnownMigrations } from '../../../electron/db/connection'
import { runMigrations } from '../../../electron/db/migrate'
import { closeOrphanProblemVisits } from '../../../electron/tracking/orphanProblemVisits'
import {
  assertNoPathLinks,
  canonicalPath,
  readMigrationCheckpoint,
  recoverySetSchema,
  sha256File,
  writeDurableJson,
  writeMigrationCheckpoint,
  type MigrationCheckpoint,
} from '../services/backup/lib/migration-checkpoint'
import {
  upgradeMaintenanceRequestSchema,
  upgradeResolutionInstructions,
  type UpgradeMaintenanceRequest,
} from '../services/backup/lib/upgrade-maintenance-command'
import {
  assertFailureMarkerMatchesCheckpoint,
  legacyAssociationPath,
  legacyAttemptId,
  legacyAuditPath,
  readRecoveryJson,
  readRegularRecoveryFile,
  readVerifiedResolutionAudit,
  resolutionAuditSchema,
  verifyLegacyFailureAudit,
} from '../services/backup/lib/upgrade-resolution-audit'
import {
  assertDatabaseIntegrity,
  assertLegacyLedgerEquals,
  readDatabaseState,
  validateDatabaseState,
  validateLegacyLedger,
  type DatabaseState,
} from './legacy-ledger-validation'
import { retainMigrationDiagnostic } from './migration-diagnostics'

export class UpgradeResolutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'UpgradeResolutionError'
  }
}

function refuse(code: string, message: string): never {
  throw new UpgradeResolutionError(code, message)
}

function profilePaths(userData: string) {
  if (!path.isAbsolute(userData))
    refuse('PROFILE_PATH', 'The current application profile must be an absolute path.')
  assertNoPathLinks(userData)
  const profile = canonicalPath(userData)
  return {
    databasePath: path.join(profile, 'data', 'algo-learning.sqlite'),
    backupDirectory: path.join(profile, 'backups'),
  }
}

function knownLedger() {
  return getKnownMigrations().map(({ version, name }) => ({ version, name }))
}

function withDatabase<T>(
  filePath: string,
  readonly: boolean,
  callback: (database: Database.Database) => T,
): T {
  assertNoPathLinks(filePath)
  const database = new Database(filePath, { readonly, fileMustExist: true })
  let result: { success: true; value: T } | { success: false; error: unknown }
  try {
    result = { success: true, value: callback(database) }
  } catch (error) {
    result = { success: false, error }
  }
  try {
    database.close()
  } catch (error) {
    if (result.success) result = { success: false, error }
    else retainMigrationDiagnostic(result.error, 'db.resolution-close-failed', error)
  }
  if (!result.success) throw result.error
  return result.value
}

function verifyKnownSource(
  backupPath: string,
  expected?: DatabaseState,
  hash?: string,
): DatabaseState {
  const source = verifyMigrationBackup(backupPath, expected, hash)
  withDatabase(backupPath, true, (database) => validateLegacyLedger(database, getKnownMigrations()))
  if (source.ledger.length >= getKnownMigrations().length) {
    refuse(
      'SOURCE_HISTORY',
      'The recovery point is not a known earlier upgrade source. Preserve it for local support review; no resolution was authorized.',
    )
  }
  return source
}

interface RecoveryContext {
  checkpoint: MigrationCheckpoint
  legacy?: { marker: MigrationFailureMarker; bytes: Buffer; markerHash: string }
}

function inspectRecovery(userData: string): RecoveryContext {
  const { databasePath, backupDirectory } = profilePaths(userData)
  const checkpoint = readMigrationCheckpoint(databasePath, backupDirectory)
  const failure = readMigrationFailureMarker(backupDirectory, databasePath, checkpoint)
  if (checkpoint && failure) assertFailureMarkerMatchesCheckpoint(failure, checkpoint)
  if (failure && !failure.attemptId) {
    const bytes = readRegularRecoveryFile(
      getMigrationFailureMarkerPath(backupDirectory, databasePath),
    )
    const markerHash = createHash('sha256').update(bytes).digest('hex')
    const attemptId = legacyAttemptId(databasePath, markerHash)
    const source = verifyKnownSource(failure.backupPath)
    const targetLedger = [...source.ledger, ...failure.pendingMigrations]
    if (failure.pendingMigrations.length === 0)
      refuse('TARGET_HISTORY', 'The legacy failure does not identify a pending upgrade.')
    assertLegacyLedgerEquals(targetLedger, knownLedger().slice(0, targetLedger.length))
    const associated: MigrationCheckpoint = {
      formatVersion: 1,
      attemptId,
      databasePath: canonicalPath(databasePath),
      backupDirectory: canonicalPath(backupDirectory),
      backupBasename: path.basename(failure.backupPath),
      backupSha256: sha256File(failure.backupPath),
      source,
      targetLedger,
      state: 'prepared',
      createdAt: Date.parse(failure.failedAt),
      updatedAt: Date.parse(failure.failedAt),
    }
    if (
      checkpoint &&
      (checkpoint.attemptId !== attemptId ||
        checkpoint.backupSha256 !== associated.backupSha256 ||
        JSON.stringify(checkpoint.source) !== JSON.stringify(source))
    ) {
      refuse(
        'LEGACY_ASSOCIATION',
        'The legacy marker cannot be associated with the current attempt. Preserve all evidence for local review.',
      )
    }
    return { checkpoint: checkpoint ?? associated, legacy: { marker: failure, bytes, markerHash } }
  }
  if (!checkpoint)
    refuse(
      'MISSING_ATTEMPT',
      'No verifiable upgrade attempt exists in this profile. Do not create or delete a marker to bypass startup checks.',
    )
  verifyLegacyFailureAudit(checkpoint, failure)
  return { checkpoint }
}

export function inspectUpgradeRecovery(userData: string): string {
  const { checkpoint } = inspectRecovery(userData)
  return upgradeResolutionInstructions(checkpoint.attemptId)
}

function associateLegacy(context: RecoveryContext): void {
  if (!context.legacy) return
  const { checkpoint, legacy } = context
  const auditPath = legacyAuditPath(checkpoint.backupDirectory, legacy.markerHash)
  if (fs.existsSync(auditPath)) {
    if (!readRegularRecoveryFile(auditPath).equals(legacy.bytes))
      refuse('LEGACY_AUDIT', 'Original legacy marker audit does not match.')
  } else {
    // Keep exact original bytes, including historical diagnostics, local and unmodified.
    const temporary = `${auditPath}.partial-${randomUUID()}`
    const descriptor = fs.openSync(temporary, 'wx', 0o600)
    let failure: { error: unknown } | null = null
    try {
      fs.writeFileSync(descriptor, legacy.bytes)
      fs.fsyncSync(descriptor)
    } catch (error) {
      failure = { error }
    }
    try {
      fs.closeSync(descriptor)
    } catch (error) {
      if (!failure) failure = { error }
      else retainMigrationDiagnostic(failure.error, 'db.legacy-audit-close-failed', error)
    }
    if (failure) throw failure.error
    if (!readRegularRecoveryFile(temporary).equals(legacy.bytes))
      refuse('LEGACY_AUDIT', 'Original marker backup could not be verified.')
    fs.renameSync(temporary, auditPath)
  }
  writeDurableJson(legacyAssociationPath(checkpoint.backupDirectory, checkpoint.attemptId), {
    formatVersion: 1,
    attemptId: checkpoint.attemptId,
    markerSha256: legacy.markerHash,
  })
  writeMigrationCheckpoint(checkpoint.databasePath, checkpoint.backupDirectory, checkpoint)
  writeMigrationFailureMarker(checkpoint.backupDirectory, checkpoint.databasePath, {
    ...legacy.marker,
    attemptId: checkpoint.attemptId,
  })
}

function verifyRecoverySet(checkpoint: MigrationCheckpoint): void {
  if (!checkpoint.recovery) return
  const directory = path.join(
    path.dirname(checkpoint.databasePath),
    checkpoint.recovery.directoryBasename,
  )
  assertNoPathLinks(directory)
  const intent = z
    .object({ databasePath: z.string(), backupSha256: z.string(), recovery: recoverySetSchema })
    .strict()
    .parse(readRecoveryJson(path.join(directory, 'intent.json')))
  if (
    intent.databasePath !== checkpoint.databasePath ||
    intent.backupSha256 !== checkpoint.backupSha256 ||
    JSON.stringify(intent.recovery) !== JSON.stringify(checkpoint.recovery)
  ) {
    refuse(
      'RECOVERY_SET',
      'The recorded recovery set is inconsistent. Preserve current and displaced files for local support review.',
    )
  }
  const names = { main: 'main.sqlite', wal: 'main.sqlite-wal', shm: 'main.sqlite-shm' }
  for (const file of checkpoint.recovery.files) {
    readRegularRecoveryFile(path.join(directory, names[file]))
  }
}

function expectedTarget(checkpoint: MigrationCheckpoint): DatabaseState {
  const backupPath = path.join(checkpoint.backupDirectory, checkpoint.backupBasename)
  const temporaryDirectory = path.join(
    checkpoint.backupDirectory,
    // One exclusive UUID keeps SQLite's journal paths below Windows' common path limit.
    `.upgrade-validation-${randomUUID()}`,
  )
  fs.mkdirSync(temporaryDirectory, { mode: 0o700 })
  const candidate = path.join(temporaryDirectory, 'candidate.sqlite')
  fs.copyFileSync(backupPath, candidate, fs.constants.COPYFILE_EXCL)
  verifyMigrationBackup(candidate, checkpoint.source, checkpoint.backupSha256)
  const state = withDatabase(candidate, false, (database) => {
    database.pragma('foreign_keys = ON')
    runMigrations(
      database,
      getKnownMigrations().slice(checkpoint.source.ledger.length, checkpoint.targetLedger.length),
    )
    assertDatabaseIntegrity(database)
    const target = readDatabaseState(database)
    assertLegacyLedgerEquals(target.ledger, checkpoint.targetLedger)
    return target
  })
  // Delete only this successfully verified disposable reconstruction, never failure evidence.
  if (
    path.dirname(temporaryDirectory) !== checkpoint.backupDirectory ||
    !path.basename(temporaryDirectory).startsWith('.upgrade-validation-')
  ) {
    refuse('VALIDATION_PATH', 'Unexpected temporary validation path.')
  }
  assertNoPathLinks(temporaryDirectory)
  fs.rmSync(temporaryDirectory, { recursive: true })
  return state
}

function resolutionDirectory(checkpoint: MigrationCheckpoint): string {
  return path.join(checkpoint.backupDirectory, 'resolutions')
}

export async function resolveUpgrade(
  userData: string,
  input: UpgradeMaintenanceRequest,
): Promise<string> {
  const request = upgradeMaintenanceRequestSchema.parse(input)
  const context = inspectRecovery(userData)
  const checkpoint = context.checkpoint
  if (request.attemptId !== checkpoint.attemptId) {
    refuse(
      'ATTEMPT_ID',
      `The requested attempt is not this profile's current attempt.\n${upgradeResolutionInstructions(checkpoint.attemptId)}`,
    )
  }
  if (checkpoint.state === 'completed')
    refuse(
      'COMPLETED',
      'This upgrade already completed normally. Start the application without maintenance arguments.',
    )
  const resolvedState =
    request.resolution === 'keep-current' ? 'resolved-keep-current' : 'resolved-retry-source'
  if (checkpoint.state.startsWith('resolved-') && checkpoint.state !== resolvedState) {
    refuse(
      'RESOLUTION_CONFLICT',
      'This attempt already has a different verified resolution. Do not change its audit history.',
    )
  }
  if (checkpoint.targetLedger.length <= checkpoint.source.ledger.length)
    refuse('TARGET_HISTORY', 'The recorded target must extend its verified source history.')
  assertLegacyLedgerEquals(
    checkpoint.targetLedger,
    knownLedger().slice(0, checkpoint.targetLedger.length),
  )
  const backupPath = path.join(checkpoint.backupDirectory, checkpoint.backupBasename)
  verifyKnownSource(backupPath, checkpoint.source, checkpoint.backupSha256)
  verifyRecoverySet(checkpoint)
  const expected =
    request.resolution === 'keep-current' ? expectedTarget(checkpoint) : checkpoint.source
  withDatabase(checkpoint.databasePath, true, (database) =>
    validateDatabaseState(database, expected),
  )
  const directory = resolutionDirectory(checkpoint)
  const auditPath = path.join(directory, `${checkpoint.attemptId}.${request.resolution}.json`)
  if (checkpoint.state === resolvedState) {
    const audit = readVerifiedResolutionAudit(checkpoint)
    if (JSON.stringify(audit.source) !== JSON.stringify(expected)) {
      refuse(
        'RESOLUTION_AUDIT',
        'The resolution audit is missing or inconsistent. Preserve all current files.',
      )
    }
    verifyMigrationBackup(
      path.join(directory, audit.backupBasename),
      audit.source,
      audit.backupSha256,
    )
    return 'This resolution is already verified. Current data was rechecked and not changed. Restart the application normally.'
  }
  associateLegacy(context)
  assertNoPathLinks(directory)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const database = new Database(checkpoint.databasePath, { fileMustExist: true })
  let failure: { error: unknown } | null = null
  let verifiedAudit: z.infer<typeof resolutionAuditSchema> | null = null
  try {
    validateDatabaseState(database, expected)
    const currentBackup = await createPreMigrationBackup(
      database,
      checkpoint.databasePath,
      directory,
      new Date(),
      expected,
    )
    const audit = resolutionAuditSchema.parse({
      formatVersion: 1,
      attemptId: checkpoint.attemptId,
      resolution: request.resolution,
      state: 'prepared',
      databasePath: checkpoint.databasePath,
      backupBasename: path.basename(currentBackup),
      backupSha256: sha256File(currentBackup),
      source: expected,
    })
    writeDurableJson(auditPath, audit)
    // Historical targets still contain TEXT timestamps (or lack later columns). Leave
    // current-version business cleanup to the next protected normal initialization.
    if (
      request.resolution === 'keep-current' &&
      checkpoint.targetLedger.length === getKnownMigrations().length
    )
      database.transaction(() => closeOrphanProblemVisits(database))()
    validateDatabaseState(database, expected)
    verifiedAudit = { ...audit, state: 'verified' }
  } catch (error) {
    failure = { error }
  }
  try {
    database.close()
  } catch (error) {
    if (!failure) failure = { error }
    else retainMigrationDiagnostic(failure.error, 'db.resolution-close-failed', error)
  }
  if (failure) throw failure.error
  if (!verifiedAudit)
    refuse(
      'RESOLUTION_AUDIT',
      'The current-state protection was not verified; startup remains blocked.',
    )
  withDatabase(checkpoint.databasePath, true, (database) =>
    validateDatabaseState(database, expected),
  )
  writeDurableJson(auditPath, verifiedAudit)
  writeMigrationCheckpoint(checkpoint.databasePath, checkpoint.backupDirectory, {
    ...checkpoint,
    state: resolvedState,
    updatedAt: Date.now(),
  })
  return request.resolution === 'keep-current'
    ? 'The completed upgrade was verified. Current data was protected and retained. Restart the application normally.'
    : 'The restored source was verified and protected. The command did not run migrations. After correcting the original failure, restart normally to create a new protected upgrade attempt.'
}
