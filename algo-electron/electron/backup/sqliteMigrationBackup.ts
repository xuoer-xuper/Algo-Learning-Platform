import fs from 'node:fs'
import path from 'node:path'

interface BackupCapableDatabase {
  backup(destinationFile: string): Promise<unknown>
}

export interface MigrationFailureMarker {
  databasePath: string
  backupPath: string
  failedAt: string
  pendingMigrations: Array<{ version: number; name: string }>
  error: string
  restoreError?: string
}

export class MigrationRetryBlockedError extends Error {
  constructor(readonly markerPath: string) {
    super(`Database migration retry is blocked by failure marker: ${markerPath}`)
    this.name = 'MigrationRetryBlockedError'
  }
}

export function getMigrationFailureMarkerPath(backupDir: string, databasePath: string): string {
  return path.join(backupDir, `${path.basename(databasePath)}.migration-failure.json`)
}

export function assertMigrationRetryAllowed(
  backupDir: string,
  databasePath: string,
  pendingMigrations: ReadonlyArray<{ version: number; name: string }>,
): void {
  const markerPath = getMigrationFailureMarkerPath(backupDir, databasePath)
  if (!fs.existsSync(markerPath)) return

  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as MigrationFailureMarker
    const blockedVersions = new Set(marker.pendingMigrations.map(migration => migration.version))
    if (pendingMigrations.some(migration => blockedVersions.has(migration.version))) {
      throw new MigrationRetryBlockedError(markerPath)
    }
  } catch (error) {
    if (error instanceof MigrationRetryBlockedError) throw error
    throw new MigrationRetryBlockedError(markerPath)
  }
}

export function clearMigrationFailureMarker(backupDir: string, databasePath: string): void {
  fs.rmSync(getMigrationFailureMarkerPath(backupDir, databasePath), { force: true })
}

export async function createPreMigrationBackup(
  database: BackupCapableDatabase,
  databasePath: string,
  backupDir: string,
  now: Date = new Date(),
  retention = 3,
): Promise<string> {
  fs.mkdirSync(backupDir, { recursive: true })
  const prefix = migrationBackupPrefix(databasePath)
  const timestamp = now.toISOString().replace(/[-:TZ.]/g, '')
  let backupPath = path.join(backupDir, `${prefix}${timestamp}.sqlite`)
  let suffix = 1
  while (fs.existsSync(backupPath)) {
    backupPath = path.join(backupDir, `${prefix}${timestamp}-${suffix}.sqlite`)
    suffix += 1
  }

  await database.backup(backupPath)
  retainNewestMigrationBackups(backupDir, databasePath, retention)
  return backupPath
}

export function retainNewestMigrationBackups(
  backupDir: string,
  databasePath: string,
  retention = 3,
): string[] {
  if (!fs.existsSync(backupDir)) return []
  const prefix = migrationBackupPrefix(databasePath)
  const backups = fs.readdirSync(backupDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith('.sqlite'))
    .map(entry => path.join(backupDir, entry.name))
    .sort((left, right) => {
      const mtimeDiff = fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs
      return mtimeDiff || right.localeCompare(left)
    })

  for (const stalePath of backups.slice(Math.max(0, retention))) {
    fs.rmSync(stalePath, { force: true })
  }
  return backups.slice(0, Math.max(0, retention))
}

export function restoreDatabaseFromBackup(backupPath: string, databasePath: string): void {
  const restorePath = `${databasePath}.restore-${process.pid}-${Date.now()}`
  const failedPath = `${databasePath}.failed-${process.pid}-${Date.now()}`
  fs.copyFileSync(backupPath, restorePath)

  removeSqliteSidecars(databasePath)
  const hadDatabase = fs.existsSync(databasePath)
  if (hadDatabase) fs.renameSync(databasePath, failedPath)

  try {
    fs.renameSync(restorePath, databasePath)
    if (hadDatabase) fs.rmSync(failedPath, { force: true })
  } catch (error) {
    fs.rmSync(restorePath, { force: true })
    if (hadDatabase && fs.existsSync(failedPath) && !fs.existsSync(databasePath)) {
      fs.renameSync(failedPath, databasePath)
    }
    throw error
  }
}

export function writeMigrationFailureMarker(
  backupDir: string,
  databasePath: string,
  marker: MigrationFailureMarker,
): string {
  fs.mkdirSync(backupDir, { recursive: true })
  const markerPath = getMigrationFailureMarkerPath(backupDir, databasePath)
  const temporaryPath = `${markerPath}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temporaryPath, JSON.stringify(marker, null, 2), 'utf8')
  fs.rmSync(markerPath, { force: true })
  fs.renameSync(temporaryPath, markerPath)
  return markerPath
}

function migrationBackupPrefix(databasePath: string): string {
  const extension = path.extname(databasePath)
  const baseName = path.basename(databasePath, extension)
  return `${baseName}-pre-migration-`
}

function removeSqliteSidecars(databasePath: string): void {
  fs.rmSync(`${databasePath}-wal`, { force: true })
  fs.rmSync(`${databasePath}-shm`, { force: true })
}
