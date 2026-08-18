import fs from 'node:fs'
import path from 'node:path'

const WINDOWS_RESERVED_NAMES = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*]/g
const CONTROL_AND_BIDI_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g

export const MAX_DOWNLOAD_FILENAME_LENGTH = 120
const MAX_DUPLICATE_ATTEMPTS = 10_000

export interface DownloadPathFileSystem {
  mkdirSync(directoryPath: string, options: { recursive: true }): unknown
  existsSync(filePath: string): boolean
}

function truncateText(value: string, maxLength: number): string {
  return Array.from(value).slice(0, maxLength).join('')
}

function splitExtension(fileName: string): { stem: string; extension: string } {
  const extension = path.extname(fileName)
  if (!extension || extension.length > 20 || extension.length === fileName.length) {
    return { stem: fileName, extension: '' }
  }
  return { stem: fileName.slice(0, -extension.length), extension }
}

function avoidWindowsReservedName(fileName: string): string {
  const firstSegment = fileName.split('.', 1)[0].replace(/[. ]+$/g, '')
  return WINDOWS_RESERVED_NAMES.test(firstSegment) ? `_${fileName}` : fileName
}

function truncateFilename(fileName: string, maxLength: number): string {
  if (Array.from(fileName).length <= maxLength) return fileName
  const { stem, extension } = splitExtension(fileName)
  const extensionLength = Array.from(extension).length
  if (extensionLength >= maxLength) return truncateText(fileName, maxLength)
  return `${truncateText(stem, maxLength - extensionLength)}${extension}`
}

function cleanFilename(value: string, maxLength: number): string {
  const normalized = value.normalize('NFKC')
  const leafName = normalized.split(/[\\/]/).at(-1) ?? ''
  const cleaned = leafName
    .replace(CONTROL_AND_BIDI_CHARACTERS, '')
    .replace(INVALID_FILENAME_CHARACTERS, '-')
    .replace(/-+/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
  return truncateFilename(avoidWindowsReservedName(cleaned), maxLength)
    .replace(/[. ]+$/g, '')
}

export function sanitizeDownloadFilename(
  suggestedFilename: string,
  fallbackFilename = 'download',
  maxLength = MAX_DOWNLOAD_FILENAME_LENGTH,
): string {
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new RangeError('maxLength must be a positive integer')
  }
  const cleaned = cleanFilename(suggestedFilename, maxLength)
  if (cleaned) return cleaned
  return cleanFilename(fallbackFilename, maxLength) || truncateText('download', maxLength)
}

export function getManagedDownloadDirectory(userDataDirectory: string): string {
  if (!path.isAbsolute(userDataDirectory)) {
    throw new Error('The managed download root must be an absolute userData path')
  }
  return path.join(path.resolve(userDataDirectory), 'downloads')
}

function assertDirectChild(downloadDirectory: string, candidatePath: string): void {
  if (path.dirname(candidatePath) !== downloadDirectory) {
    throw new Error('Resolved download path escaped the managed directory')
  }
}

function buildDuplicateFilename(fileName: string, index: number): string {
  const { stem, extension } = splitExtension(fileName)
  const suffix = ` (${index})`
  const maxStemLength = Math.max(
    1,
    MAX_DOWNLOAD_FILENAME_LENGTH - Array.from(extension).length - suffix.length,
  )
  return `${truncateText(stem, maxStemLength)}${suffix}${extension}`
}

export class DownloadPathAllocator {
  readonly downloadDirectory: string
  private readonly fileSystem: DownloadPathFileSystem
  private readonly reservedPathKeys = new Set<string>()

  constructor(downloadDirectory: string, fileSystem: DownloadPathFileSystem = fs) {
    if (!path.isAbsolute(downloadDirectory)) {
      throw new Error('DownloadPathAllocator requires an absolute directory')
    }
    this.downloadDirectory = path.resolve(downloadDirectory)
    this.fileSystem = fileSystem
  }

  reserve(suggestedFilename: string): string {
    this.fileSystem.mkdirSync(this.downloadDirectory, { recursive: true })
    const sanitized = sanitizeDownloadFilename(suggestedFilename)

    for (let index = 0; index < MAX_DUPLICATE_ATTEMPTS; index += 1) {
      const fileName = index === 0 ? sanitized : buildDuplicateFilename(sanitized, index)
      const candidatePath = path.resolve(this.downloadDirectory, fileName)
      assertDirectChild(this.downloadDirectory, candidatePath)
      const pathKey = candidatePath.toLowerCase()
      if (this.reservedPathKeys.has(pathKey) || this.fileSystem.existsSync(candidatePath)) continue
      this.reservedPathKeys.add(pathKey)
      return candidatePath
    }

    throw new Error('Unable to allocate a unique managed download path')
  }

  release(filePath: string): void {
    const resolvedPath = path.resolve(filePath)
    if (path.dirname(resolvedPath) !== this.downloadDirectory) return
    this.reservedPathKeys.delete(resolvedPath.toLowerCase())
  }
}
