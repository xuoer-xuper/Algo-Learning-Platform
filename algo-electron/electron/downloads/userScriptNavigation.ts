import { randomUUID } from 'node:crypto'
import { sanitizeDownloadFilename } from './downloadPath'
import type { InternalPage } from '../browser/tabManagerTypes'

const MAX_NAVIGATION_URL_LENGTH = 4_096
const DEFAULT_INSTALL_TTL_MS = 15 * 60 * 1_000
const DEFAULT_MAX_PENDING_INSTALLS = 32
const INSTALL_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/

export interface UserScriptNavigationOptions {
  allowInsecureLocalhost?: boolean
}

export interface UserScriptNavigation {
  sourceUrl: string
  sourceFileName: string
}

export interface PendingUserScriptInstall extends UserScriptNavigation {
  installId: string
  createdAt: string
}

export interface UserScriptInstallRoute {
  request: PendingUserScriptInstall
  page: Extract<InternalPage, { type: 'script-install' }>
}

export interface PendingUserScriptInstallRegistryOptions {
  clock?: () => number
  idFactory?: () => string
  ttlMs?: number
  maxPending?: number
}

interface StoredInstallRequest extends PendingUserScriptInstall {
  createdAtMs: number
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '[::1]'
    || normalized === '::1'
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32 || (codePoint >= 127 && codePoint <= 159)
  })
}

export function resolveUserScriptNavigation(
  value: string,
  options: UserScriptNavigationOptions = {},
): UserScriptNavigation | null {
  if (
    !value
    || value.length > MAX_NAVIGATION_URL_LENGTH
    || value.trim() !== value
    || containsControlCharacter(value)
  ) {
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (parsed.username || parsed.password) return null
  const protocolAllowed = parsed.protocol === 'https:'
    || (
      parsed.protocol === 'http:'
      && options.allowInsecureLocalhost === true
      && isLoopbackHost(parsed.hostname)
    )
  if (!protocolAllowed) return null

  let decodedPathname: string
  try {
    decodedPathname = decodeURIComponent(parsed.pathname)
  } catch {
    return null
  }
  if (!decodedPathname.toLowerCase().endsWith('.user.js')) return null
  const sourceLeafName = decodedPathname.split('/').at(-1) ?? 'script.user.js'
  parsed.hash = ''

  return {
    sourceUrl: parsed.toString(),
    sourceFileName: sanitizeDownloadFilename(sourceLeafName, 'script.user.js'),
  }
}

function cloneRequest(request: StoredInstallRequest): PendingUserScriptInstall {
  return {
    installId: request.installId,
    sourceUrl: request.sourceUrl,
    sourceFileName: request.sourceFileName,
    createdAt: request.createdAt,
  }
}

export class PendingUserScriptInstallRegistry {
  private readonly clock: () => number
  private readonly idFactory: () => string
  private readonly ttlMs: number
  private readonly maxPending: number
  private readonly requests = new Map<string, StoredInstallRequest>()

  constructor(options: PendingUserScriptInstallRegistryOptions = {}) {
    this.clock = options.clock ?? Date.now
    this.idFactory = options.idFactory ?? randomUUID
    this.ttlMs = options.ttlMs ?? DEFAULT_INSTALL_TTL_MS
    this.maxPending = options.maxPending ?? DEFAULT_MAX_PENDING_INSTALLS
    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) {
      throw new RangeError('ttlMs must be positive')
    }
    if (!Number.isInteger(this.maxPending) || this.maxPending < 1) {
      throw new RangeError('maxPending must be a positive integer')
    }
  }

  register(
    url: string,
    navigationOptions: UserScriptNavigationOptions = {},
  ): UserScriptInstallRoute | null {
    const navigation = resolveUserScriptNavigation(url, navigationOptions)
    if (!navigation) return null
    const now = this.clock()
    this.prune(now)
    while (this.requests.size >= this.maxPending) {
      const oldestId = this.requests.keys().next().value as string | undefined
      if (!oldestId) break
      this.requests.delete(oldestId)
    }

    const installId = this.createInstallId()
    const stored: StoredInstallRequest = {
      installId,
      ...navigation,
      createdAt: new Date(now).toISOString(),
      createdAtMs: now,
    }
    this.requests.set(installId, stored)
    return {
      request: cloneRequest(stored),
      page: { type: 'script-install', installId },
    }
  }

  get(installId: string): PendingUserScriptInstall | null {
    if (!INSTALL_ID_PATTERN.test(installId)) return null
    this.prune(this.clock())
    const request = this.requests.get(installId)
    return request ? cloneRequest(request) : null
  }

  consume(installId: string): PendingUserScriptInstall | null {
    const request = this.get(installId)
    if (!request) return null
    this.requests.delete(installId)
    return request
  }

  clear(): void {
    this.requests.clear()
  }

  private createInstallId(): string {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const installId = this.idFactory()
      if (INSTALL_ID_PATTERN.test(installId) && !this.requests.has(installId)) return installId
    }
    throw new Error('Unable to allocate a safe userscript install id')
  }

  private prune(now: number): void {
    for (const [installId, request] of this.requests) {
      if (now - request.createdAtMs >= this.ttlMs) this.requests.delete(installId)
    }
  }
}
