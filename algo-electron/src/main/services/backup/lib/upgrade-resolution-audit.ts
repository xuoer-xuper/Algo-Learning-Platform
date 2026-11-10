import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  assertLegacyLedgerEquals,
  databaseStateSchema,
  legacyLedgerSchema,
} from '../../../db/legacy-ledger-validation'
import { assertNoPathLinks, canonicalPath, type MigrationCheckpoint } from './migration-checkpoint'

export const migrationFailureMarkerSchema = z
  .object({
    databasePath: z.string().min(1),
    backupPath: z.string().min(1),
    failedAt: z.iso.datetime(),
    pendingMigrations: legacyLedgerSchema,
    error: z.string(),
    restoreError: z.string().optional(),
    attemptId: z.uuid().optional(),
  })
  .strict()
export type MigrationFailureMarker = z.infer<typeof migrationFailureMarkerSchema>

export const resolutionAuditSchema = z
  .object({
    formatVersion: z.literal(1),
    attemptId: z.uuid(),
    resolution: z.enum(['keep-current', 'retry-source']),
    state: z.enum(['prepared', 'verified']),
    databasePath: z.string(),
    backupBasename: z.string().regex(/^[A-Za-z0-9._-]+\.sqlite$/),
    backupSha256: z.string().regex(/^[a-f0-9]{64}$/),
    source: databaseStateSchema,
  })
  .strict()
export type ResolutionAudit = z.infer<typeof resolutionAuditSchema>

const legacyAssociationSchema = z
  .object({
    formatVersion: z.literal(1),
    attemptId: z.uuid(),
    markerSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()

export function readRegularRecoveryFile(filePath: string): Buffer {
  assertNoPathLinks(filePath)
  const stat = fs.lstatSync(filePath)
  if (!stat.isFile() || stat.nlink !== 1)
    throw new Error('Recovery evidence must be a regular, unlinked local file.')
  return fs.readFileSync(filePath)
}

export function readRecoveryJson(filePath: string): unknown {
  return JSON.parse(readRegularRecoveryFile(filePath).toString('utf8'))
}

export function legacyAttemptId(databasePath: string, markerHash: string): string {
  // RFC UUIDv5 (DNS namespace); SHA256 protects the evidence, not this identifier.
  const bytes = createHash('sha1')
    .update(Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex'))
    .update(`algo-learning-platform/legacy-upgrade\0${canonicalPath(databasePath)}\0${markerHash}`)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function legacyAuditPath(backupDirectory: string, markerHash: string): string {
  return path.join(backupDirectory, `algo-learning.sqlite.legacy-marker-${markerHash}.json`)
}

export function legacyAssociationPath(backupDirectory: string, attemptId: string): string {
  return path.join(backupDirectory, `algo-learning.sqlite.legacy-association-${attemptId}.json`)
}

export function assertFailureMarkerMatchesCheckpoint(
  marker: MigrationFailureMarker,
  checkpoint: MigrationCheckpoint,
): void {
  if (
    (marker.attemptId !== undefined && marker.attemptId !== checkpoint.attemptId) ||
    canonicalPath(marker.databasePath) !== checkpoint.databasePath ||
    canonicalPath(marker.backupPath) !==
      path.join(checkpoint.backupDirectory, checkpoint.backupBasename)
  ) {
    throw new Error('The failure marker and upgrade record identify different recovery evidence.')
  }
  assertLegacyLedgerEquals(
    marker.pendingMigrations,
    checkpoint.targetLedger.slice(checkpoint.source.ledger.length),
  )
}

export function verifyLegacyFailureAudit(
  checkpoint: MigrationCheckpoint,
  failure: MigrationFailureMarker | null,
): void {
  if (checkpoint.attemptId[14] !== '5') return
  const association = legacyAssociationSchema.parse(
    readRecoveryJson(legacyAssociationPath(checkpoint.backupDirectory, checkpoint.attemptId)),
  )
  const bytes = readRegularRecoveryFile(
    legacyAuditPath(checkpoint.backupDirectory, association.markerSha256),
  )
  const marker = migrationFailureMarkerSchema.parse(JSON.parse(bytes.toString('utf8')))
  if (
    !failure ||
    association.attemptId !== checkpoint.attemptId ||
    createHash('sha256').update(bytes).digest('hex') !== association.markerSha256 ||
    legacyAttemptId(checkpoint.databasePath, association.markerSha256) !== checkpoint.attemptId ||
    JSON.stringify({ ...marker, attemptId: checkpoint.attemptId }) !== JSON.stringify(failure)
  ) {
    throw new Error(
      'The original legacy failure audit or its linkage is missing or inconsistent. Preserve all recovery evidence.',
    )
  }
  assertFailureMarkerMatchesCheckpoint(marker, checkpoint)
}

export function readVerifiedResolutionAudit(checkpoint: MigrationCheckpoint): ResolutionAudit {
  const resolution =
    checkpoint.state === 'resolved-keep-current'
      ? 'keep-current'
      : checkpoint.state === 'resolved-retry-source'
        ? 'retry-source'
        : null
  if (!resolution) throw new Error('The upgrade record does not have a verified resolution.')
  const audit = resolutionAuditSchema.parse(
    readRecoveryJson(
      path.join(
        checkpoint.backupDirectory,
        'resolutions',
        `${checkpoint.attemptId}.${resolution}.json`,
      ),
    ),
  )
  if (
    audit.state !== 'verified' ||
    audit.attemptId !== checkpoint.attemptId ||
    audit.resolution !== resolution ||
    audit.databasePath !== checkpoint.databasePath
  ) {
    throw new Error('The resolution audit is missing or inconsistent. Preserve all current files.')
  }
  assertLegacyLedgerEquals(
    audit.source.ledger,
    resolution === 'keep-current' ? checkpoint.targetLedger : checkpoint.source.ledger,
  )
  if (resolution === 'retry-source' && audit.source.schemaHash !== checkpoint.source.schemaHash)
    throw new Error('The retry resolution audit does not match the verified source schema.')
  return audit
}
