import { createHash, timingSafeEqual } from 'node:crypto'
import type { UserScriptResourceWriteInput } from '../db/repositories/userScriptRuntimeRepository'
import { nowChinaStandardTime } from '../shared/time'
import type { UserScriptMetadata, UserScriptResourceReference } from './userScriptMetadata'
import { resolveUserScriptRequestTarget } from './userScriptConnectPolicy'

const MAX_REDIRECTS = 5
const FETCH_TIMEOUT_MS = 30_000
const MAX_DECLARATIONS = 64
const MAX_RESOURCE_BYTES = 4 * 1024 * 1024
const MAX_TOTAL_BYTES = 8 * 1024 * 1024

type IntegrityAlgorithm = 'sha256' | 'md5'

export interface UserScriptIntegrity {
  algorithm: IntegrityAlgorithm
  digest: Uint8Array
  canonical: string
}

export type PreparedUserScriptResource = Omit<UserScriptResourceWriteInput, 'scriptId'>

interface PrepareUserScriptResourcesOptions {
  fetch: (input: string, init: RequestInit) => Promise<Response>
  allowInsecureLocalhost?: boolean
  now?: () => string
}

export function selectUserScriptIntegrity(fragment: string | null): UserScriptIntegrity | null {
  if (!fragment) return null
  let selected: { algorithm: IntegrityAlgorithm; value: string } | null = null
  for (const rawPart of fragment.split(/[;,]/)) {
    const part = decodeFragmentPart(rawPart.trim())
    const match = part.match(/^(sha256|md5)(?:[-=:])(.+)$/i)
    if (!match) continue
    selected = { algorithm: match[1].toLowerCase() as IntegrityAlgorithm, value: match[2].trim() }
  }
  if (!selected) throw new Error('Userscript resource integrity has no supported sha256 or md5 hash')

  const expectedLength = selected.algorithm === 'sha256' ? 32 : 16
  const digest = decodeDigest(selected.value, expectedLength)
  return {
    algorithm: selected.algorithm,
    digest,
    canonical: `${selected.algorithm}-${Buffer.from(digest).toString('base64')}`,
  }
}

export async function prepareUserScriptResources(
  metadata: Pick<UserScriptMetadata, 'requires' | 'resources'>,
  options: PrepareUserScriptResourcesOptions,
): Promise<PreparedUserScriptResource[]> {
  const declarations = [
    ...metadata.requires.map((reference, index) => ({
      kind: 'require' as const,
      key: `require-${index}`,
      declarationOrder: index,
      reference,
    })),
    ...metadata.resources.map((resource, index) => ({
      kind: 'resource' as const,
      key: resource.name,
      declarationOrder: index,
      reference: resource,
    })),
  ]
  if (declarations.length > MAX_DECLARATIONS) {
    throw new Error(`Userscript declares more than ${MAX_DECLARATIONS} external resources`)
  }
  const resourceNames = metadata.resources.map(resource => resource.name)
  if (
    resourceNames.some(name => name.length === 0 || name.length > 512 || hasControlCharacter(name))
    || new Set(resourceNames).size !== resourceNames.length
  ) {
    throw new Error('Userscript resource names must be non-empty and unique')
  }

  const prepared: PreparedUserScriptResource[] = []
  let totalBytes = 0
  for (const declaration of declarations) {
    const downloaded = await downloadResource(declaration.reference, options)
    totalBytes += downloaded.content.byteLength
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Userscript external resources exceed the total size limit')
    if (declaration.kind === 'require') assertUtf8JavaScript(downloaded.content)
    prepared.push({
      kind: declaration.kind,
      key: declaration.key,
      declarationOrder: declaration.declarationOrder,
      sourceUrl: declaration.reference.url,
      content: downloaded.content,
      contentEncoding: declaration.kind === 'require' ? 'utf8' : 'binary',
      contentType: downloaded.contentType,
      integrity: downloaded.integrity,
      fetchedAt: (options.now ?? nowChinaStandardTime)(),
    })
  }
  return prepared
}

async function downloadResource(
  reference: UserScriptResourceReference,
  options: PrepareUserScriptResourcesOptions,
): Promise<{ finalUrl: string; content: Uint8Array; contentType: string | null; integrity: string | null }> {
  const integrity = selectUserScriptIntegrity(reference.integrity)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let rawUrl = reference.url
  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const target = resolveUserScriptRequestTarget(rawUrl, Boolean(options.allowInsecureLocalhost))
      if (!target) throw new Error('Userscript external resource URL must be HTTPS')
      const response = await options.fetch(target.url, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'manual',
        signal: controller.signal,
      })
      const redirectUrl = getRedirectUrl(response, target.url)
      if (redirectUrl) {
        if (redirectCount === MAX_REDIRECTS) throw new Error('Userscript external resource has too many redirects')
        rawUrl = redirectUrl
        continue
      }
      if (!response.ok) throw new Error(`Userscript external resource returned HTTP ${response.status}`)
      const content = await readBoundedResponse(response)
      if (integrity) verifyIntegrity(content, integrity)
      return {
        finalUrl: target.url,
        content,
        contentType: normalizeContentType(response.headers.get('content-type')),
        integrity: integrity?.canonical ?? null,
      }
    }
    throw new Error('Userscript external resource redirect resolution failed')
  }
  catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error('Userscript external resource download timed out'), { cause: error })
    }
    throw error
  }
  finally {
    clearTimeout(timer)
  }
}

function getRedirectUrl(response: Response, currentUrl: string): string | null {
  if (response.status < 300 || response.status >= 400) return null
  const location = response.headers.get('location')
  if (!location) return null
  try { return new URL(location, currentUrl).toString() }
  catch { throw new Error('Userscript external resource redirect URL is invalid') }
}

async function readBoundedResponse(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESOURCE_BYTES) {
    throw new Error('Userscript external resource exceeds the per-resource size limit')
  }
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESOURCE_BYTES) {
      await reader.cancel()
      throw new Error('Userscript external resource exceeds the per-resource size limit')
    }
    chunks.push(value)
  }
  const content = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    content.set(chunk, offset)
    offset += chunk.byteLength
  }
  return content
}

function verifyIntegrity(content: Uint8Array, integrity: UserScriptIntegrity): void {
  const actual = createHash(integrity.algorithm).update(content).digest()
  if (actual.byteLength !== integrity.digest.byteLength || !timingSafeEqual(actual, integrity.digest)) {
    throw new Error(`Userscript external resource ${integrity.algorithm} integrity mismatch`)
  }
}

function decodeDigest(value: string, expectedLength: number): Uint8Array {
  if (/^[0-9a-f]+$/i.test(value) && value.length === expectedLength * 2) {
    return Buffer.from(value, 'hex')
  }
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error('Userscript resource integrity digest is invalid')
  }
  const decoded = Buffer.from(normalized, 'base64')
  if (decoded.byteLength !== expectedLength) throw new Error('Userscript resource integrity digest length is invalid')
  return decoded
}

function decodeFragmentPart(value: string): string {
  try { return decodeURIComponent(value) }
  catch { return value }
}

function assertUtf8JavaScript(content: Uint8Array): void {
  try { new TextDecoder('utf-8', { fatal: true }).decode(content) }
  catch { throw new Error('Userscript @require content must be valid UTF-8 JavaScript') }
}

function normalizeContentType(value: string | null): string | null {
  if (!value) return null
  const normalized = value.split(';', 1)[0].trim().toLowerCase()
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized)) return null
  return normalized
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}
