import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseScriptMetadata, type UserScriptMetadata } from './userScriptMetadata'

const WINDOWS_RESERVED_NAMES = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
const DEFAULT_SLUG_MAX_LENGTH = 64
const HASH_LENGTH = 12
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type UserScriptVersionComparison = 'newer' | 'same' | 'older' | 'unknown'
export type UserScriptImportMode = 'upsert' | 'copy'

export interface UserScriptIdentity {
  namespace: string | null
  identityName: string
  key: string
}

export interface ExistingUserScriptIdentity {
  id: string
  namespace?: string | null
  identityName: string
  version?: string | null
  filePath?: string | null
}

export interface UserScriptImportDecisionInput {
  code: string
  sourceFileName: string
  existingScripts?: readonly ExistingUserScriptIdentity[]
  mode?: UserScriptImportMode
  localCopyId?: string
}

export interface UserScriptImportDecision {
  action: 'create' | 'update'
  code: string
  metadata: UserScriptMetadata
  identity: UserScriptIdentity
  identityHash: string
  contentHash: string
  fileName: string
  existing?: ExistingUserScriptIdentity
  versionComparison: UserScriptVersionComparison
  isLocalCopy: boolean
  autoUpdateEnabled: boolean
}

export interface ResolvedUserScriptImportDecision {
  decision: UserScriptImportDecision
  claimLegacy: boolean
}

export interface UserScriptImportFileSystem {
  mkdir(directoryPath: string, options: { recursive: true }): Promise<unknown>
  writeFile(filePath: string, data: string, options: { encoding: 'utf8'; flag: 'wx' }): Promise<unknown>
  rename(sourcePath: string, destinationPath: string): Promise<void>
  readFile(filePath: string, encoding: 'utf8'): Promise<string>
  unlink(filePath: string): Promise<void>
}

export interface WriteUserScriptImportOptions<T> {
  scriptsDirectory: string
  persist: (decision: UserScriptImportDecision, filePath: string) => T | Promise<T>
  fileSystem?: UserScriptImportFileSystem
  temporaryId?: string
}

interface ParsedVersion {
  core: number[]
  prerelease: string[] | null
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

function parseComparableVersion(value: string | null | undefined): ParsedVersion | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const match = trimmed.match(/^[vV]?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!match) return null

  const core = match[1].split('.').map((part) => Number(part))
  if (core.some((part) => !Number.isSafeInteger(part))) return null

  return {
    core,
    prerelease: match[2] ? match[2].split('.') : null,
  }
}

function comparePrerelease(left: string[] | null, right: string[] | null): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1

  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index]
    const rightPart = right[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue

    const leftIsNumber = /^\d+$/.test(leftPart)
    const rightIsNumber = /^\d+$/.test(rightPart)
    if (leftIsNumber && rightIsNumber) {
      const difference = Number(leftPart) - Number(rightPart)
      if (difference !== 0) return difference
      continue
    }
    if (leftIsNumber) return -1
    if (rightIsNumber) return 1
    return leftPart < rightPart ? -1 : 1
  }

  return 0
}

export function compareUserScriptVersions(
  incomingVersion: string | null | undefined,
  installedVersion: string | null | undefined,
): UserScriptVersionComparison {
  const incoming = parseComparableVersion(incomingVersion)
  const installed = parseComparableVersion(installedVersion)
  if (!incoming || !installed) return 'unknown'

  const coreLength = Math.max(incoming.core.length, installed.core.length)
  for (let index = 0; index < coreLength; index += 1) {
    const incomingPart = incoming.core[index] ?? 0
    const installedPart = installed.core[index] ?? 0
    if (incomingPart > installedPart) return 'newer'
    if (incomingPart < installedPart) return 'older'
  }

  const prereleaseComparison = comparePrerelease(incoming.prerelease, installed.prerelease)
  if (prereleaseComparison > 0) return 'newer'
  if (prereleaseComparison < 0) return 'older'
  return 'same'
}

export function createUserScriptIdentity(
  namespace: string | null | undefined,
  identityName: string,
): UserScriptIdentity {
  const normalizedNamespace = namespace === undefined ? '' : namespace
  return {
    namespace: normalizedNamespace,
    identityName,
    key: JSON.stringify([normalizedNamespace, identityName]),
  }
}

export function createWindowsSafeSlug(value: string, maxLength = DEFAULT_SLUG_MAX_LENGTH): string {
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new RangeError('maxLength must be a positive integer')
  }

  let slug = value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[. -]+|[. -]+$/g, '')

  if (!slug) slug = 'script'
  const dotIndex = slug.indexOf('.')
  const firstSegment = dotIndex === -1 ? slug : slug.slice(0, dotIndex)
  if (WINDOWS_RESERVED_NAMES.test(firstSegment)) {
    slug = dotIndex === -1
      ? `${slug}-script`
      : `${firstSegment}-script${slug.slice(dotIndex)}`
  }

  slug = slug.slice(0, maxLength).replace(/[. ]+$/g, '')
  if (!slug) return 'script'.slice(0, maxLength)
  const truncatedFirstSegment = slug.split('.', 1)[0]
  if (WINDOWS_RESERVED_NAMES.test(truncatedFirstSegment)) {
    slug = `_${slug}`.slice(0, maxLength)
  }
  return slug
}

export function createLocalCopyNamespace(id: string): string {
  const trimmed = id.trim()
  if (!UUID_PATTERN.test(trimmed)) throw new Error('A valid UUID is required for a local userscript copy')
  return `local:${trimmed.toLowerCase()}`
}

export function rewriteUserScriptNamespace(code: string, namespace: string): string {
  if (!namespace || /[\r\n]/.test(namespace)) {
    throw new Error('Userscript namespace must be a non-empty single-line value')
  }

  const startMatch = /(^|\r?\n)([ \t]*\/\/\s*==UserScript==[ \t]*)(?=\r?\n|$)/.exec(code)
  if (!startMatch) {
    const lineEnding = code.includes('\r\n') ? '\r\n' : '\n'
    return `// ==UserScript==${lineEnding}// @namespace   ${namespace}${lineEnding}// ==/UserScript==${lineEnding}${code}`
  }

  const blockStart = startMatch.index + startMatch[0].length
  const endPattern = /(^|\r?\n)[ \t]*\/\/\s*==\/UserScript==[ \t]*(?=\r?\n|$)/g
  endPattern.lastIndex = blockStart
  const endMatch = endPattern.exec(code)
  if (!endMatch) throw new Error('Userscript metadata block is not closed')

  const header = code.slice(blockStart, endMatch.index)
  const namespacePattern = /(^|\r?\n)([ \t]*\/\/\s*@namespace)(?:[ \t]+.*)?(?=\r?\n|$)/g
  if (/(^|\r?\n)[ \t]*\/\/\s*@namespace(?:[ \t]+.*)?(?=\r?\n|$)/.test(header)) {
    let namespaceWritten = false
    const rewrittenHeader = header.replace(namespacePattern, (_match, prefix: string, directive: string) => {
      if (namespaceWritten) return prefix
      namespaceWritten = true
      return `${prefix}${directive}   ${namespace}`
    })
    return `${code.slice(0, blockStart)}${rewrittenHeader}${code.slice(endMatch.index)}`
  }

  const lineEnding = code.includes('\r\n') ? '\r\n' : '\n'
  const insertion = `${lineEnding}// @namespace   ${namespace}`
  return `${code.slice(0, blockStart)}${insertion}${code.slice(blockStart)}`
}

function getFallbackName(sourceFileName: string): string {
  const baseName = path.basename(sourceFileName)
  return baseName.replace(/(?:\.user)?\.js$/i, '') || baseName || 'Unnamed Script'
}

export function decideUserScriptImport(input: UserScriptImportDecisionInput): UserScriptImportDecision {
  const mode = input.mode ?? 'upsert'
  let code = input.code
  let metadata = parseScriptMetadata(code)

  if (mode === 'copy') {
    const copyId = input.localCopyId ?? crypto.randomUUID()
    code = rewriteUserScriptNamespace(code, createLocalCopyNamespace(copyId))
    metadata = parseScriptMetadata(code)
  }

  const name = metadata.name || getFallbackName(input.sourceFileName)
  // A missing @namespace is an explicit empty-string canonical identity.
  // NULL is reserved for legacy rows that have not been claimed yet.
  const identity = createUserScriptIdentity(metadata.namespace ?? '', name)
  const identityHash = sha256(identity.key).slice(0, HASH_LENGTH)
  const contentHash = sha256(code).slice(0, HASH_LENGTH)
  const matchingScript = input.existingScripts?.find((script) => {
    return createUserScriptIdentity(script.namespace, script.identityName).key === identity.key
  })

  if (mode === 'copy' && matchingScript) {
    throw new Error(`Local userscript copy identity already exists: ${identity.key}`)
  }

  return {
    action: matchingScript ? 'update' : 'create',
    code,
    metadata: { ...metadata, name },
    identity,
    identityHash,
    contentHash,
    fileName: `${createWindowsSafeSlug(name)}--${identityHash}--${contentHash}.user.js`,
    existing: matchingScript,
    versionComparison: matchingScript
      ? compareUserScriptVersions(metadata.version, matchingScript.version)
      : 'unknown',
    isLocalCopy: mode === 'copy',
    autoUpdateEnabled: mode !== 'copy',
  }
}

export function resolveUserScriptImportDecision(
  input: UserScriptImportDecisionInput,
): ResolvedUserScriptImportDecision {
  const decision = decideUserScriptImport(input)
  if (
    decision.existing
    || decision.identity.namespace === null
    || decision.identity.namespace.startsWith('local:')
  ) return { decision, claimLegacy: false }

  const legacy = input.existingScripts?.find(script => (
    script.namespace === null && script.identityName === decision.identity.identityName
  ))
  if (!legacy) return { decision, claimLegacy: false }
  return {
    decision: {
      ...decision,
      action: 'update',
      existing: legacy,
      versionComparison: compareUserScriptVersions(decision.metadata.version, legacy.version),
    },
    claimLegacy: true,
  }
}

async function removeIfPresent(fileSystem: UserScriptImportFileSystem, filePath: string): Promise<void> {
  try {
    await fileSystem.unlink(filePath)
  }
  catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code
    if (errorCode !== 'ENOENT') throw error
  }
}

export async function writeUserScriptImport<T>(
  decision: UserScriptImportDecision,
  options: WriteUserScriptImportOptions<T>,
): Promise<T> {
  const fileSystem = options.fileSystem ?? fs
  const destinationPath = path.join(options.scriptsDirectory, decision.fileName)
  const temporaryId = options.temporaryId ?? crypto.randomUUID()
  const temporaryPath = path.join(options.scriptsDirectory, `.${decision.fileName}.${temporaryId}.tmp`)
  let createdDestination = false

  await fileSystem.mkdir(options.scriptsDirectory, { recursive: true })

  try {
    await fileSystem.writeFile(temporaryPath, decision.code, { encoding: 'utf8', flag: 'wx' })

    try {
      const existingCode = await fileSystem.readFile(destinationPath, 'utf8')
      if (existingCode !== decision.code) {
        throw new Error(`Userscript destination hash collision: ${decision.fileName}`)
      }
      await removeIfPresent(fileSystem, temporaryPath)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await fileSystem.rename(temporaryPath, destinationPath)
      createdDestination = true
    }

    return await options.persist(decision, destinationPath)
  }
  catch (error) {
    await removeIfPresent(fileSystem, temporaryPath)
    if (createdDestination) await removeIfPresent(fileSystem, destinationPath)
    throw error
  }
}
