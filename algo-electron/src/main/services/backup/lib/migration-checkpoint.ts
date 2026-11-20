import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  compositeDatabaseStateSchema,
  assertLegacyLedgerEquals,
  databaseStateSchema,
  legacyLedgerSchema,
} from '../../../db/legacy-ledger-validation'
import { assertDrizzlePrefix, drizzleLedgerSchema } from '../../../db/drizzle-ledger'
import type { KnownDrizzleMigration } from '../../../db/migration-resources'
import { retainMigrationDiagnostic } from '../../../db/migration-diagnostics'

const basenameSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value !== '.' && value !== '..' && !/[\\/:]/.test(value) && !value.includes('\0'),
    'Expected a local basename',
  )
export const recoverySetSchema = z
  .object({
    directoryBasename: basenameSchema,
    files: z
      .array(z.enum(['main', 'wal', 'shm']))
      .refine((files) => new Set(files).size === files.length),
  })
  .strict()
export type RecoverySet = z.infer<typeof recoverySetSchema>

const checkpointFields = {
  attemptId: z.uuid(),
  databasePath: z.string().min(1),
  backupDirectory: z.string().min(1),
  backupBasename: basenameSchema,
  backupSha256: z.string().regex(/^[a-f0-9]{64}$/),
  targetLedger: legacyLedgerSchema,
  state: z.enum([
    'prepared',
    'restoring',
    'restored',
    'restore-failed',
    'completed',
    'resolved-keep-current',
    'resolved-retry-source',
  ]),
  createdAt: z.number().int().nonnegative().safe(),
  updatedAt: z.number().int().nonnegative().safe(),
  recovery: recoverySetSchema.optional(),
}
export const migrationCheckpointSchema = z
  .discriminatedUnion('formatVersion', [
    z
      .object({ ...checkpointFields, formatVersion: z.literal(1), source: databaseStateSchema })
      .strict(),
    z
      .object({
        ...checkpointFields,
        formatVersion: z.literal(2),
        source: compositeDatabaseStateSchema,
        targetDrizzle: drizzleLedgerSchema.min(1),
      })
      .strict(),
  ])
  .superRefine((record, context) => {
    if (record.formatVersion === 2) {
      const source = record.source.drizzleLedger ?? []
      if (
        source.length > record.targetDrizzle.length ||
        source.some((entry, index) => {
          const target = record.targetDrizzle[index]
          return (
            !target ||
            entry.tag !== target.tag ||
            entry.when !== target.when ||
            entry.sha256 !== target.sha256
          )
        }) ||
        (source.length === record.targetDrizzle.length &&
          record.source.ledger.length === record.targetLedger.length)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Composite target must advance its source histories',
        })
      }
    }
    if (record.updatedAt < record.createdAt) {
      context.addIssue({ code: 'custom', message: 'Invalid checkpoint chronology' })
    }
    if ((record.state === 'restoring' || record.state === 'restored') && !record.recovery) {
      context.addIssue({ code: 'custom', message: 'Missing recovery set' })
    }
    if (
      record.source.ledger.some(
        (entry, index) =>
          record.targetLedger[index]?.version !== entry.version ||
          record.targetLedger[index]?.name !== entry.name,
      )
    ) {
      context.addIssue({ code: 'custom', message: 'Source must be a prefix of target history' })
    }
  })
export type MigrationCheckpoint = z.infer<typeof migrationCheckpointSchema>

export function validateCheckpointHistory(
  record: MigrationCheckpoint,
  knownLegacy: ReadonlyArray<{ version: number; name: string }>,
  knownDrizzle?: readonly KnownDrizzleMigration[],
): void {
  const known = knownLegacy.map(({ version, name }) => ({ version, name }))
  assertLegacyLedgerEquals(record.source.ledger, known.slice(0, record.source.ledger.length))
  assertLegacyLedgerEquals(record.targetLedger, known.slice(0, record.targetLedger.length))
  if (record.formatVersion === 1) {
    if (record.targetLedger.length <= record.source.ledger.length)
      throw new Error('The recorded target must extend its verified source history.')
    return
  }
  if (
    !knownDrizzle ||
    record.targetLedger.length !== known.length ||
    (record.source.drizzleLedger !== null && record.source.ledger.length !== known.length)
  ) {
    throw new Error(
      'Composite recovery requires the known completed legacy baseline and trusted resources.',
    )
  }
  assertDrizzlePrefix(record.source.drizzleLedger ?? [], knownDrizzle)
  assertDrizzlePrefix(record.targetDrizzle, knownDrizzle)
  assertDrizzlePrefix(record.source.drizzleLedger ?? [], record.targetDrizzle)
}

export function checkpointPendingKeys(checkpoint: MigrationCheckpoint): string[] {
  return [
    ...checkpoint.targetLedger
      .slice(checkpoint.source.ledger.length)
      .map(({ version }) => `legacy:${version}`),
    ...(checkpoint.formatVersion === 2
      ? checkpoint.targetDrizzle
          .slice(checkpoint.source.drizzleLedger?.length ?? 0)
          .map(({ tag }) => `drizzle:${tag}`)
      : []),
  ]
}

export class MigrationRetryBlockedError extends Error {
  constructor(
    readonly markerPath: string,
    readonly attemptId?: string,
  ) {
    super(
      `Database upgrade requires verified recovery before startup: ${markerPath}${
        attemptId ? ` (attempt ${attemptId})` : ''
      }. Keep this record and the database recovery files; do not delete the marker.`,
    )
    this.name = 'MigrationRetryBlockedError'
  }
}

export function canonicalPath(filePath: string): string {
  const absolute = path.resolve(filePath)
  assertNoPathLinks(absolute)
  if (fs.existsSync(absolute)) return fs.realpathSync.native(absolute)
  const parent = path.dirname(absolute)
  if (parent === absolute) return absolute
  return path.join(canonicalPath(parent), path.basename(absolute))
}

export function assertNoPathLinks(filePath: string): void {
  let current = path.resolve(filePath)
  while (true) {
    try {
      if (fs.lstatSync(current).isSymbolicLink())
        throw new Error('Recovery paths must not use links')
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
    }
    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}

export function getMigrationCheckpointPath(databasePath: string): string {
  return `${canonicalPath(databasePath)}.migration-attempt.json`
}

export function isMigrationCheckpointResolved(record: MigrationCheckpoint): boolean {
  return (
    record.state === 'completed' ||
    record.state === 'resolved-keep-current' ||
    record.state === 'resolved-retry-source'
  )
}

function validateIdentity(
  databasePath: string,
  backupDirectory: string | undefined,
  record: MigrationCheckpoint,
): void {
  if (
    record.databasePath !== canonicalPath(databasePath) ||
    record.backupDirectory !== canonicalPath(record.backupDirectory) ||
    (backupDirectory !== undefined && record.backupDirectory !== canonicalPath(backupDirectory))
  ) {
    throw new Error('Checkpoint database identity mismatch')
  }
  assertNoPathLinks(path.join(record.backupDirectory, record.backupBasename))
  if (
    record.recovery &&
    record.recovery.directoryBasename !==
      `${path.basename(databasePath)}.recovery-${record.attemptId}`
  ) {
    throw new Error('Checkpoint recovery directory mismatch')
  }
  if (record.recovery) {
    assertNoPathLinks(
      path.join(path.dirname(record.databasePath), record.recovery.directoryBasename),
    )
  }
}

export function readMigrationCheckpoint(
  databasePath: string,
  backupDirectory?: string,
): MigrationCheckpoint | null {
  const checkpointPath = getMigrationCheckpointPath(databasePath)
  try {
    assertNoPathLinks(checkpointPath)
    if (!fs.existsSync(checkpointPath)) return null
    if (!fs.lstatSync(checkpointPath).isFile()) throw new Error('Invalid checkpoint file')
    const record = migrationCheckpointSchema.parse(
      JSON.parse(fs.readFileSync(checkpointPath, 'utf8')),
    )
    validateIdentity(databasePath, backupDirectory, record)
    return record
  } catch {
    throw new MigrationRetryBlockedError(checkpointPath)
  }
}

export function assertNoUnresolvedMigrationCheckpoint(
  databasePath: string,
  backupDirectory?: string,
): void {
  const record = readMigrationCheckpoint(databasePath, backupDirectory)
  if (record && !isMigrationCheckpointResolved(record)) {
    throw new MigrationRetryBlockedError(getMigrationCheckpointPath(databasePath), record.attemptId)
  }
}

export function writeDurableJson(filePath: string, value: unknown): void {
  assertNoPathLinks(filePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp-${randomUUID()}`
  const descriptor = fs.openSync(temporaryPath, 'wx', 0o600)
  let failure: { error: unknown } | undefined
  try {
    fs.writeFileSync(descriptor, JSON.stringify(value, null, 2), 'utf8')
    fs.fsyncSync(descriptor)
  } catch (error) {
    failure = { error }
  }
  try {
    fs.closeSync(descriptor)
  } catch (error) {
    if (!failure) failure = { error }
    else retainMigrationDiagnostic(failure.error, 'db.checkpoint-close-failed', error)
  }
  if (failure) throw failure.error
  // Windows rename replaces a file without unlinking the previous durable record first.
  // On failure both the old record and temporary evidence remain; never delete either.
  fs.renameSync(temporaryPath, filePath)
}

export function writeMigrationCheckpoint(
  databasePath: string,
  backupDirectory: string,
  input: MigrationCheckpoint,
): void {
  const record = migrationCheckpointSchema.parse(input)
  validateIdentity(databasePath, backupDirectory, record)
  const previous = readMigrationCheckpoint(databasePath, backupDirectory)
  if (previous && previous.attemptId !== record.attemptId) {
    if (!isMigrationCheckpointResolved(previous)) {
      throw new MigrationRetryBlockedError(
        getMigrationCheckpointPath(databasePath),
        previous.attemptId,
      )
    }
    writeDurableJson(
      path.join(
        backupDirectory,
        `${path.basename(databasePath)}.attempt-${previous.attemptId}.json`,
      ),
      previous,
    )
  }
  writeDurableJson(getMigrationCheckpointPath(databasePath), record)
}

export function sha256File(filePath: string): string {
  assertNoPathLinks(filePath)
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}
