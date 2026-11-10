import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const BACKUP_DIRECTORY = 'config-normalization-backups'

function refuse(code: string): never {
  throw Object.assign(new Error('Config normalization protection failed'), { code })
}

function assertUnlinkedDirectory(directory: string): void {
  const root = path.parse(directory).root
  let current = root
  for (const part of path.relative(root, directory).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    const stat = fs.lstatSync(current, { throwIfNoEntry: false })
    if (!stat) return
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      refuse('CONFIG_UNSAFE_PATH')
    }
  }
}

function resolveConfigPath(userDataDir: string): string {
  if (!path.isAbsolute(userDataDir)) refuse('CONFIG_UNSAFE_PATH')
  const directory = path.resolve(userDataDir)
  assertUnlinkedDirectory(directory)
  return path.join(directory, 'config.json')
}

function withDescriptor<T>(descriptor: number, operation: () => T): T {
  let result: { ok: true; value: T } | { ok: false; error: unknown }
  try {
    result = { ok: true, value: operation() }
  } catch (error) {
    result = { ok: false, error }
  }
  try {
    fs.closeSync(descriptor)
  } catch (closeError) {
    if (result.ok) throw closeError
    // Keep both failures without letting cleanup replace the diagnostic reason.
    throw Object.assign(new Error('Config file operation and close failed'), {
      cause: result.error,
      closeError,
      code: result.error instanceof Error && 'code' in result.error ? result.error.code : undefined,
    })
  }
  if (!result.ok) throw result.error
  return result.value
}

function readRegularFile(filePath: string): Buffer {
  const before = fs.lstatSync(filePath)
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    refuse('CONFIG_UNSAFE_PATH')
  }
  const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
  return withDescriptor(descriptor, () => {
    const opened = fs.fstatSync(descriptor)
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      refuse('CONFIG_UNSAFE_PATH')
    }
    return fs.readFileSync(descriptor)
  })
}

function writeExclusiveFile(filePath: string, bytes: Buffer): void {
  const descriptor = fs.openSync(filePath, 'wx', 0o600)
  withDescriptor(descriptor, () => {
    fs.writeFileSync(descriptor, bytes)
    fs.fsyncSync(descriptor)
  })
}

/** Read only the fixed local config, before electron-store can follow a linked path. */
export function readConfigNormalizationSource(userDataDir: string): Buffer | null {
  const configPath = resolveConfigPath(userDataDir)
  if (!fs.lstatSync(configPath, { throwIfNoEntry: false })) return null
  return readRegularFile(configPath)
}

/** Protect the bytes being normalized; never parse, decrypt, restore or prune user config. */
export function createConfigNormalizationBackup(userDataDir: string, original: Buffer): string {
  const configPath = resolveConfigPath(userDataDir)
  const assertSourceUnchanged = (): void => {
    resolveConfigPath(userDataDir)
    if (!readRegularFile(configPath).equals(original)) refuse('CONFIG_SOURCE_CHANGED')
  }
  assertSourceUnchanged()

  const backupDir = path.join(path.dirname(configPath), BACKUP_DIRECTORY)
  if (!fs.lstatSync(backupDir, { throwIfNoEntry: false })) {
    fs.mkdirSync(backupDir, { mode: 0o700 })
  }
  assertUnlinkedDirectory(backupDir)
  if (process.platform !== 'win32' && (fs.statSync(backupDir).mode & 0o077) !== 0) {
    refuse('CONFIG_UNSAFE_PATH')
  }

  // Reuse only a verified byte-identical copy after a failed writeback/restart.
  const digest = createHash('sha256').update(original).digest('hex')
  const backupPath = path.join(backupDir, `config-before-normalization-${digest}.json`)
  const verifyBackup = (filePath: string): void => {
    assertUnlinkedDirectory(backupDir)
    if (!readRegularFile(filePath).equals(original)) refuse('CONFIG_BACKUP_MISMATCH')
    if (process.platform !== 'win32' && (fs.statSync(filePath).mode & 0o077) !== 0) {
      refuse('CONFIG_UNSAFE_PATH')
    }
  }

  if (fs.lstatSync(backupPath, { throwIfNoEntry: false })) {
    verifyBackup(backupPath)
  } else {
    const partialPath = `${backupPath}.${randomUUID()}.partial`
    writeExclusiveFile(partialPath, original)
    // An interrupted/failed copy stays .partial and is never a recovery point.
    verifyBackup(partialPath)
    fs.renameSync(partialPath, backupPath)
    verifyBackup(backupPath)
  }

  assertSourceUnchanged()
  return backupPath
}

/** Unlike conf's EXDEV fallback, automatic normalization must never write in place. */
export function writeNormalizedConfigWithBackup(
  userDataDir: string,
  original: Buffer,
  serialized: string,
): void {
  const backupPath = createConfigNormalizationBackup(userDataDir, original)
  const configPath = resolveConfigPath(userDataDir)
  const stagedPath = path.join(
    path.dirname(configPath),
    `.config-normalization-${randomUUID()}.partial`,
  )
  const normalized = Buffer.from(serialized, 'utf8')
  writeExclusiveFile(stagedPath, normalized)
  resolveConfigPath(userDataDir)
  assertUnlinkedDirectory(path.dirname(backupPath))
  if (!readRegularFile(stagedPath).equals(normalized)) refuse('CONFIG_WRITE_MISMATCH')
  if (!readRegularFile(backupPath).equals(original)) refuse('CONFIG_BACKUP_MISMATCH')
  if (!readConfigNormalizationSource(userDataDir)?.equals(original)) refuse('CONFIG_SOURCE_CHANGED')
  // One same-directory replacement, with no delete/copy/in-place fallback on error.
  fs.renameSync(stagedPath, configPath)
}
