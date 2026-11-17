import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { z } from 'zod'
import {
  assertDatabaseIntegrity,
  databaseStateSchema,
  readDatabaseState,
  validateDatabaseState,
  type DatabaseState,
} from '../../src/main/db/legacy-ledger-validation'
import { retainMigrationDiagnostic } from '../../src/main/db/migration-diagnostics'
import {
  assertNoPathLinks,
  assertNoUnresolvedMigrationCheckpoint,
  canonicalPath,
  isMigrationCheckpointResolved,
  MigrationRetryBlockedError,
  readMigrationCheckpoint,
  sha256File,
  writeDurableJson,
  type MigrationCheckpoint,
  type RecoverySet,
} from '../../src/main/services/backup/lib/migration-checkpoint'
import {
  assertFailureMarkerMatchesCheckpoint,
  migrationFailureMarkerSchema,
  readRecoveryJson,
  readVerifiedResolutionAudit,
  verifyLegacyFailureAudit,
  type MigrationFailureMarker,
} from '../../src/main/services/backup/lib/upgrade-resolution-audit'

export { MigrationRetryBlockedError }
export { migrationFailureMarkerSchema, type MigrationFailureMarker }

const verifiedBackupSchema = z
  .object({
    formatVersion: z.literal(1),
    databasePath: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    source: databaseStateSchema,
  })
  .strict()

export function getMigrationFailureMarkerPath(backupDir: string, databasePath: string): string {
  return path.join(backupDir, `${path.basename(databasePath)}.migration-failure.json`)
}

export function readMigrationFailureMarker(
  backupDir: string,
  databasePath: string,
  checkpoint: MigrationCheckpoint | null = null,
): MigrationFailureMarker | null {
  const markerPath = getMigrationFailureMarkerPath(backupDir, databasePath)
  assertNoPathLinks(markerPath)
  const archivedPath =
    checkpoint &&
    (checkpoint.state === 'resolved-keep-current' || checkpoint.state === 'resolved-retry-source')
      ? `${markerPath}.resolved-${checkpoint.attemptId}.json`
      : null
  // Archiving the failure audit and replacing the checkpoint are separate durable writes.
  const filePath = fs.existsSync(markerPath)
    ? markerPath
    : archivedPath && fs.existsSync(archivedPath)
      ? archivedPath
      : null
  if (!filePath) return null
  const marker = migrationFailureMarkerSchema.parse(readRecoveryJson(filePath))
  if (
    canonicalPath(marker.databasePath) !== canonicalPath(databasePath) ||
    path.dirname(canonicalPath(marker.backupPath)) !== canonicalPath(backupDir)
  ) {
    throw new Error('Failure marker identity mismatch')
  }
  return marker
}

export function assertMigrationRetryAllowed(
  backupDir: string,
  databasePath: string,
  _pendingMigrations: ReadonlyArray<{ version: number; name: string }> = [],
): void {
  assertNoUnresolvedMigrationCheckpoint(databasePath, backupDir)
  const markerPath = getMigrationFailureMarkerPath(backupDir, databasePath)
  try {
    const checkpoint = readMigrationCheckpoint(databasePath, backupDir)
    const marker = readMigrationFailureMarker(backupDir, databasePath, checkpoint)
    if (
      checkpoint &&
      (checkpoint.state === 'resolved-keep-current' || checkpoint.state === 'resolved-retry-source')
    ) {
      const audit = readVerifiedResolutionAudit(checkpoint)
      verifyMigrationBackup(
        path.join(checkpoint.backupDirectory, 'resolutions', audit.backupBasename),
        audit.source,
        audit.backupSha256,
      )
      verifyLegacyFailureAudit(checkpoint, marker)
    }
    if (!marker) return
    // Only a verified, explicitly linked resolution supersedes a failure marker.
    if (
      checkpoint &&
      marker.attemptId === checkpoint.attemptId &&
      (checkpoint.state === 'resolved-keep-current' || checkpoint.state === 'resolved-retry-source')
    ) {
      assertFailureMarkerMatchesCheckpoint(marker, checkpoint)
      return
    }
  } catch {
    throw new MigrationRetryBlockedError(markerPath)
  }
  throw new MigrationRetryBlockedError(markerPath)
}

export function clearMigrationFailureMarker(backupDir: string, databasePath: string): void {
  // Keep historical failures as audit evidence. This compatibility helper never unblocks by deletion.
  assertMigrationRetryAllowed(backupDir, databasePath)
}

export function archiveResolvedMigrationFailureMarker(
  backupDir: string,
  databasePath: string,
): void {
  assertMigrationRetryAllowed(backupDir, databasePath)
  const markerPath = getMigrationFailureMarkerPath(backupDir, databasePath)
  if (!fs.existsSync(markerPath)) return
  const checkpoint = readMigrationCheckpoint(databasePath, backupDir)
  if (!checkpoint) throw new MigrationRetryBlockedError(markerPath)
  fs.renameSync(markerPath, `${markerPath}.resolved-${checkpoint.attemptId}.json`)
}

export function verifyMigrationBackup(
  backupPath: string,
  expected?: DatabaseState,
  expectedSha256?: string,
): DatabaseState {
  assertNoPathLinks(backupPath)
  assertNoPathLinks(`${backupPath}-wal`)
  assertNoPathLinks(`${backupPath}-shm`)
  if (!fs.lstatSync(backupPath).isFile()) throw new Error('Recovery point is not a regular file')
  if (fs.existsSync(`${backupPath}-wal`) && fs.statSync(`${backupPath}-wal`).size > 0) {
    throw new Error('Recovery point must be a standalone SQLite snapshot, not a WAL-dependent file')
  }
  if (expectedSha256 !== undefined && sha256File(backupPath) !== expectedSha256) {
    throw new Error('Recovery point checksum mismatch')
  }
  const database = new Database(backupPath, { readonly: true, fileMustExist: true })
  let result: { success: true; state: DatabaseState } | { success: false; error: unknown }
  try {
    if (expected) validateDatabaseState(database, expected)
    else assertDatabaseIntegrity(database)
    result = { success: true, state: readDatabaseState(database) }
  } catch (error) {
    result = { success: false, error }
  }
  try {
    database.close()
  } catch (error) {
    if (result.success === true) result = { success: false, error }
    else retainMigrationDiagnostic(result.error, 'db.backup-validation-close-failed', error)
  }
  if (result.success === false) throw result.error
  return result.state
}

export async function createPreMigrationBackup(
  database: Database.Database,
  databasePath: string,
  backupDir: string,
  now: Date = new Date(),
  expectedSource: DatabaseState = readDatabaseState(database),
): Promise<string> {
  assertNoPathLinks(backupDir)
  fs.mkdirSync(backupDir, { recursive: true })
  const timestamp = now.toISOString().replace(/[-:TZ.]/g, '')
  const backupPath = path.join(
    backupDir,
    `${migrationBackupPrefix(databasePath)}${timestamp}-${randomUUID()}.sqlite`,
  )
  const partialPath = `${backupPath}.partial`
  await database.backup(partialPath)
  verifyMigrationBackup(partialPath, expectedSource)
  syncFile(partialPath)
  fs.renameSync(partialPath, backupPath)
  writeDurableJson(`${backupPath}.verified.json`, {
    formatVersion: 1,
    databasePath: canonicalPath(databasePath),
    sha256: sha256File(backupPath),
    source: expectedSource,
  })
  // Retention belongs after the entire startup attempt succeeds, not after backup creation.
  return backupPath
}

export function retainNewestMigrationBackups(
  backupDir: string,
  databasePath: string,
  retention = 3,
): string[] {
  assertNoPathLinks(backupDir)
  if (!Number.isSafeInteger(retention) || retention < 1) {
    throw new Error('At least one verified migration backup must be retained')
  }
  if (!fs.existsSync(backupDir)) return []
  const checkpoint = readMigrationCheckpoint(databasePath, backupDir)
  // An unresolved attempt pins all evidence, including snapshots without manifests.
  if (checkpoint && !isMigrationCheckpointResolved(checkpoint)) return []
  const backups = fs
    .readdirSync(backupDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith(migrationBackupPrefix(databasePath)) &&
        entry.name.endsWith('.sqlite') &&
        fs.existsSync(path.join(backupDir, `${entry.name}.verified.json`)),
    )
    .map((entry) => path.join(backupDir, entry.name))
    .sort(
      (left, right) =>
        fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs || right.localeCompare(left),
    )
  // Validate the entire candidate set before deleting anything. Partial/corrupt/untracked files stay.
  for (const backupPath of backups) {
    assertNoPathLinks(`${backupPath}.verified.json`)
    const metadata = verifiedBackupSchema.parse(
      JSON.parse(fs.readFileSync(`${backupPath}.verified.json`, 'utf8')),
    )
    if (metadata.databasePath !== canonicalPath(databasePath))
      throw new Error('Backup identity mismatch')
    verifyMigrationBackup(backupPath, metadata.source, metadata.sha256)
  }
  const pinnedPath = checkpoint ? path.join(backupDir, checkpoint.backupBasename) : null
  const keep = new Set(backups.slice(0, retention))
  if (pinnedPath) keep.add(pinnedPath)
  for (const stalePath of backups) {
    if (keep.has(stalePath)) continue
    fs.rmSync(stalePath)
    fs.rmSync(`${stalePath}.verified.json`)
  }
  return backups.filter((backupPath) => keep.has(backupPath))
}

export interface RestoreDatabaseOptions {
  attemptId?: string
  expectedSource?: DatabaseState
  expectedSha256?: string
  beforeDisplace?: (recovery: RecoverySet) => void
}

export function restoreDatabaseFromBackup(
  backupPath: string,
  databasePath: string,
  options: RestoreDatabaseOptions = {},
): void {
  assertNoPathLinks(databasePath)
  const expected = verifyMigrationBackup(backupPath, options.expectedSource, options.expectedSha256)
  const attemptId = z.uuid().parse(options.attemptId ?? randomUUID())
  const directoryBasename = `${path.basename(databasePath)}.recovery-${attemptId}`
  const recoveryDirectory = path.join(path.dirname(databasePath), directoryBasename)
  // A pre-existing set means an earlier restoration was interrupted. Never overwrite or guess.
  fs.mkdirSync(recoveryDirectory)
  const candidate = path.join(recoveryDirectory, 'candidate.sqlite')
  fs.copyFileSync(backupPath, candidate, fs.constants.COPYFILE_EXCL)
  syncFile(candidate)
  verifyMigrationBackup(candidate, expected, options.expectedSha256)
  const sources = [
    { key: 'main', source: databasePath, target: 'main.sqlite' },
    { key: 'wal', source: `${databasePath}-wal`, target: 'main.sqlite-wal' },
    { key: 'shm', source: `${databasePath}-shm`, target: 'main.sqlite-shm' },
  ] as const
  const present = sources.filter(({ source }) => fs.existsSync(source))
  for (const { source } of present) {
    if (!fs.lstatSync(source).isFile()) throw new Error('Recovery source is not a regular file')
  }
  const recovery: RecoverySet = { directoryBasename, files: present.map(({ key }) => key) }
  writeDurableJson(path.join(recoveryDirectory, 'intent.json'), {
    databasePath: canonicalPath(databasePath),
    backupSha256: sha256File(backupPath),
    recovery,
  })
  options.beforeDisplace?.(recovery)
  // Keep the closed main/WAL/SHM set permanently. Multi-file renames are not crash atomic.
  for (const { source, target } of present)
    fs.renameSync(source, path.join(recoveryDirectory, target))
  fs.renameSync(candidate, databasePath)
  verifyMigrationBackup(databasePath, expected, options.expectedSha256)
}

export function writeMigrationFailureMarker(
  backupDir: string,
  databasePath: string,
  marker: MigrationFailureMarker,
): string {
  const validated = migrationFailureMarkerSchema.parse(marker)
  if (
    canonicalPath(validated.databasePath) !== canonicalPath(databasePath) ||
    path.dirname(canonicalPath(validated.backupPath)) !== canonicalPath(backupDir)
  ) {
    throw new Error('Failure marker identity mismatch')
  }
  const markerPath = getMigrationFailureMarkerPath(backupDir, databasePath)
  writeDurableJson(markerPath, validated)
  return markerPath
}

function migrationBackupPrefix(databasePath: string): string {
  return `${path.basename(databasePath, path.extname(databasePath))}-pre-migration-`
}

function syncFile(filePath: string): void {
  const descriptor = fs.openSync(filePath, 'r+')
  let failure: { error: unknown } | undefined
  try {
    fs.fsyncSync(descriptor)
  } catch (error) {
    failure = { error }
  }
  try {
    fs.closeSync(descriptor)
  } catch (error) {
    if (!failure) failure = { error }
    else retainMigrationDiagnostic(failure.error, 'db.backup-sync-close-failed', error)
  }
  if (failure) throw failure.error
}
