import { parseScriptMetadata, type UserScriptMetadata } from './userScriptMetadata'
import {
  resolveUserScriptImportDecision,
  type ExistingUserScriptIdentity,
  type UserScriptImportDecision,
  type UserScriptVersionComparison,
} from './userScriptImport'
import {
  prepareUserScriptResources,
  type PreparedUserScriptResource,
} from './UserScriptResourceCache'
import {
  MAX_PENDING_USER_SCRIPT_INSTALLS,
  resolveUserScriptNavigation,
  type PendingUserScriptInstall,
} from '../downloads/userScriptNavigation'
import {
  fetchUserScriptDocument,
  type UserScriptRemoteFetch,
} from './UserScriptRemoteFetch'

const MAX_SCRIPT_BYTES = 4 * 1024 * 1024
const DEFAULT_TTL_MS = 15 * 60 * 1_000

export type RemoteFetch = UserScriptRemoteFetch

export interface UserScriptRemoteInstallerOptions {
  fetch?: RemoteFetch
  allowInsecureLocalhost?: boolean
  clock?: () => number
  ttlMs?: number
  maxScriptBytes?: number
  maxStaged?: number
}

export interface UserScriptInstallPreview {
  installId: string
  sourceUrl: string
  finalUrl: string
  sourceFileName: string
  name: string
  namespace: string | null
  version: string | null
  installedVersion: string | null
  description: string | null
  updateURL: string | null
  downloadURL: string | null
  matches: string[]
  includes: string[]
  excludes: string[]
  excludeMatches: string[]
  grants: string[]
  connects: string[]
  antifeatures: string[]
  requires: number
  resources: string[]
  action: UserScriptImportDecision['action']
  existingScriptId: string | null
  versionComparison: UserScriptVersionComparison
}

export interface PreparedUserScriptInstall {
  preview: UserScriptInstallPreview
  decision: UserScriptImportDecision
  resources: readonly PreparedUserScriptResource[]
  finalUrl: string
  etag: string | null
  lastModified: string | null
}

interface StagedInstall {
  requestUrl: string
  expiresAt: number
  prepared: PreparedUserScriptInstall
}

export class UserScriptRemoteInstaller {
  private readonly fetch: RemoteFetch
  private readonly allowInsecureLocalhost: boolean
  private readonly clock: () => number
  private readonly ttlMs: number
  private readonly maxScriptBytes: number
  private readonly maxStaged: number
  private readonly staged = new Map<string, StagedInstall>()
  private readonly inFlight = new Map<string, {
    requestUrl: string
    promise: Promise<UserScriptInstallPreview>
    controller: AbortController
  }>()

  constructor(options: UserScriptRemoteInstallerOptions = {}) {
    this.fetch = options.fetch ?? ((input, init) => fetch(input, init))
    this.allowInsecureLocalhost = options.allowInsecureLocalhost ?? false
    this.clock = options.clock ?? Date.now
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.maxScriptBytes = options.maxScriptBytes ?? MAX_SCRIPT_BYTES
    this.maxStaged = options.maxStaged ?? MAX_PENDING_USER_SCRIPT_INSTALLS
    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) throw new RangeError('ttlMs must be positive')
    if (!Number.isSafeInteger(this.maxScriptBytes) || this.maxScriptBytes < 1) {
      throw new RangeError('maxScriptBytes must be a positive integer')
    }
    if (!Number.isSafeInteger(this.maxStaged) || this.maxStaged < 1) {
      throw new RangeError('maxStaged must be a positive integer')
    }
  }

  async prepare(
    request: PendingUserScriptInstall,
    existingScripts: readonly ExistingUserScriptIdentity[],
    installId = request.installId,
  ): Promise<UserScriptInstallPreview> {
    this.prune()
    const staged = this.staged.get(installId)
    if (staged?.requestUrl === request.sourceUrl) return staged.prepared.preview
    const current = this.inFlight.get(installId)
    if (current) {
      if (current.requestUrl !== request.sourceUrl) throw new Error('Userscript install request changed while loading')
      return current.promise
    }
    const controller = new AbortController()
    const promise = this.prepareOnce(request, existingScripts, installId, controller.signal)
    this.inFlight.set(installId, { requestUrl: request.sourceUrl, promise, controller })
    try { return await promise }
    finally {
      if (this.inFlight.get(installId)?.promise === promise) this.inFlight.delete(installId)
    }
  }

  private async prepareOnce(
    request: PendingUserScriptInstall,
    existingScripts: readonly ExistingUserScriptIdentity[],
    installId: string,
    signal: AbortSignal,
  ): Promise<UserScriptInstallPreview> {
    assertAllowedInstallUrl(request.sourceUrl, this.allowInsecureLocalhost)
    const response = await fetchUserScriptDocument(request.sourceUrl, {
      fetch: this.fetch,
      allowInsecureLocalhost: this.allowInsecureLocalhost,
      maxBytes: this.maxScriptBytes,
      signal,
    })
    if (response.status !== 'ok') throw new Error('Userscript install source was not modified unexpectedly')
    const metadata = parseScriptMetadata(response.code)
    if (!hasCompleteMetadataBlock(response.code) || !metadata.name) {
      throw new Error('Remote content is not a userscript')
    }
    const { decision } = resolveUserScriptImportDecision({
      code: response.code,
      sourceFileName: request.sourceFileName,
      existingScripts,
    })
    const resources = await prepareUserScriptResources(decision.metadata, {
      fetch: this.fetch,
      allowInsecureLocalhost: this.allowInsecureLocalhost,
      signal,
    })
    if (signal.aborted) throw new Error('Userscript install request was cancelled')
    const prepared: PreparedUserScriptInstall = {
      preview: toPreview(installId, request, response.finalUrl, decision, resources),
      decision,
      resources,
      finalUrl: response.finalUrl,
      etag: response.etag,
      lastModified: response.lastModified,
    }
    if (!this.staged.has(installId) && this.staged.size >= this.maxStaged) {
      throw new Error('Too many userscript installs are awaiting confirmation')
    }
    this.staged.set(installId, {
      requestUrl: request.sourceUrl,
      expiresAt: this.clock() + this.ttlMs,
      prepared,
    })
    return prepared.preview
  }

  getPrepared(installId: string, requestUrl: string): PreparedUserScriptInstall | null {
    this.prune()
    const staged = this.staged.get(installId)
    if (!staged || staged.requestUrl !== requestUrl) return null
    return staged.prepared
  }

  consume(installId: string): PreparedUserScriptInstall | null {
    this.prune()
    const staged = this.staged.get(installId)
    if (!staged) return null
    this.staged.delete(installId)
    return staged.prepared
  }

  clear(installId?: string): void {
    if (installId) {
      this.staged.delete(installId)
      this.inFlight.get(installId)?.controller.abort()
      return
    }
    this.staged.clear()
    for (const current of this.inFlight.values()) current.controller.abort()
  }

  private prune(): void {
    const now = this.clock()
    for (const [installId, staged] of this.staged) {
      if (staged.expiresAt <= now) this.staged.delete(installId)
    }
  }
}

function assertAllowedInstallUrl(value: string, allowInsecureLocalhost: boolean): void {
  const navigation = resolveUserScriptNavigation(value, { allowInsecureLocalhost })
  if (!navigation) throw new Error('Userscript source URL must be an HTTPS .user.js URL')
}

function toPreview(
  installId: string,
  request: PendingUserScriptInstall,
  finalUrl: string,
  decision: UserScriptImportDecision,
  resources: readonly PreparedUserScriptResource[],
): UserScriptInstallPreview {
  const metadata: UserScriptMetadata = decision.metadata
  return {
    installId,
    sourceUrl: request.sourceUrl,
    finalUrl,
    sourceFileName: request.sourceFileName,
    name: metadata.name ?? decision.identity.identityName,
    namespace: decision.identity.namespace,
    version: metadata.version ?? null,
    installedVersion: decision.existing?.version ?? null,
    description: metadata.description ?? null,
    updateURL: metadata.updateURL ?? null,
    downloadURL: metadata.downloadURL ?? null,
    matches: [...metadata.matches],
    includes: [...metadata.includes],
    excludes: [...metadata.excludes],
    excludeMatches: [...metadata.excludeMatches],
    grants: [...metadata.grants],
    connects: [...metadata.connects],
    antifeatures: [...metadata.antifeatures],
    requires: resources.filter(resource => resource.kind === 'require').length,
    resources: resources.filter(resource => resource.kind === 'resource').map(resource => resource.key),
    action: decision.action,
    existingScriptId: decision.existing?.id ?? null,
    versionComparison: decision.versionComparison,
  }
}

function hasCompleteMetadataBlock(code: string): boolean {
  const lines = code.split(/\r?\n/).map(line => line.trim())
  const start = lines.indexOf('// ==UserScript==')
  if (start < 0) return false
  return lines.slice(start + 1).includes('// ==/UserScript==')
}
