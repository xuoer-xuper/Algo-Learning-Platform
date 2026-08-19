import { randomUUID } from 'node:crypto'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 5 * 60_000
const MAX_IDENTIFIER_LENGTH = 256
const MAX_SCRIPT_NAME_LENGTH = 256
const MAX_HOST_LENGTH = 512
const MAX_PENDING_PER_WINDOW = 32
const MAX_TOTAL_PENDING = 256

export interface UserScriptHostPermissionPrompt {
  promptId: string
  scriptName: string
  targetHost: string
  sourceHost: string
}

export interface UserScriptHostPermissionRequest {
  windowId: string
  generation: number
  scriptId: string
  scriptName: string
  targetHost: string
  sourceHost: string
  webContentsId?: number
}

export type UserScriptHostPermissionResponse =
  | 'allowed'
  | 'denied'
  | 'persist-failed'
  | 'stale'

export interface UserScriptHostPermissionBrokerOptions {
  grantUserScriptHost: (scriptId: string, exactHost: string) => unknown | Promise<unknown>
  send: (windowId: string, prompt: UserScriptHostPermissionPrompt) => boolean | void
  show: (windowId: string) => void
  hide: (windowId: string) => void
  validate?: (request: UserScriptHostPermissionRequest) => boolean | Promise<boolean>
  timeoutMs?: number
}

interface NormalizedPermissionRequest extends UserScriptHostPermissionRequest {
  permissionKey: string
  dedupeKey: string
}

interface PendingPermission {
  request: NormalizedPermissionRequest
  prompt: UserScriptHostPermissionPrompt
  promise: Promise<boolean>
  resolve: (allowed: boolean) => void
  timer: ReturnType<typeof setTimeout> | null
  completed: boolean
  settling: boolean
}

interface WindowPermissionQueue {
  windowId: string
  current: PendingPermission | null
  pending: PendingPermission[]
}

export class UserScriptHostPermissionBroker {
  private readonly options: UserScriptHostPermissionBrokerOptions
  private readonly timeoutMs: number
  private readonly queues = new Map<string, WindowPermissionQueue>()
  private readonly requestsByKey = new Map<string, PendingPermission>()
  private readonly negativePermissions = new Set<string>()
  private pendingCount = 0
  private disposed = false

  public constructor(options: UserScriptHostPermissionBrokerOptions) {
    this.options = options
    this.timeoutMs = normalizeTimeout(options.timeoutMs)
  }

  public request(input: UserScriptHostPermissionRequest): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false)
    const request = normalizePermissionRequest(input)
    if (!request || this.negativePermissions.has(request.permissionKey)) return Promise.resolve(false)

    const existing = this.requestsByKey.get(request.dedupeKey)
    if (existing) return existing.promise
    const queue = this.getOrCreateQueue(request.windowId)
    if (
      !queue
      || this.pendingCount >= MAX_TOTAL_PENDING
      || Number(Boolean(queue.current)) + queue.pending.length >= MAX_PENDING_PER_WINDOW
    ) {
      return Promise.resolve(false)
    }

    let resolvePermission: (allowed: boolean) => void = () => undefined
    const promise = new Promise<boolean>((resolve) => { resolvePermission = resolve })
    const pending: PendingPermission = {
      request,
      prompt: Object.freeze({
        promptId: randomUUID(),
        scriptName: request.scriptName,
        targetHost: request.targetHost,
        sourceHost: request.sourceHost,
      }),
      promise,
      resolve: resolvePermission,
      timer: null,
      completed: false,
      settling: false,
    }
    queue.pending.push(pending)
    this.requestsByKey.set(request.dedupeKey, pending)
    this.pendingCount += 1
    this.pump(queue)
    return promise
  }

  public getCurrent(windowId: string): UserScriptHostPermissionPrompt | null {
    const normalizedWindowId = normalizeIdentifier(windowId)
    if (!normalizedWindowId) return null
    const prompt = this.queues.get(normalizedWindowId)?.current?.prompt
    return prompt ? { ...prompt } : null
  }

  public async respond(
    windowId: string,
    promptId: string,
    allow: boolean,
  ): Promise<UserScriptHostPermissionResponse> {
    if (this.disposed || typeof allow !== 'boolean') return 'stale'
    const normalizedWindowId = normalizeIdentifier(windowId)
    const normalizedPromptId = normalizeIdentifier(promptId)
    if (!normalizedWindowId || !normalizedPromptId) return 'stale'
    const queue = this.queues.get(normalizedWindowId)
    const current = queue?.current
    if (!queue || !current || current.prompt.promptId !== normalizedPromptId || current.settling) {
      return 'stale'
    }

    current.settling = true
    if (!allow) {
      this.negativePermissions.add(current.request.permissionKey)
      this.settlePermissionKey(current.request.permissionKey, false)
      return 'denied'
    }

    try {
      if (this.options.validate && !await this.options.validate(current.request)) {
        if (!current.completed) this.settleEntry(current, false)
        return 'stale'
      }
    }
    catch {
      if (!current.completed) this.settleEntry(current, false)
      return 'stale'
    }
    if (current.completed) return 'stale'

    try {
      await this.options.grantUserScriptHost(current.request.scriptId, current.request.targetHost)
    }
    catch {
      if (!current.completed) this.settleEntry(current, false)
      return 'persist-failed'
    }
    if (current.completed) return 'stale'
    this.settlePermissionKey(current.request.permissionKey, true)
    return 'allowed'
  }

  public cancelGeneration(generation: number): void {
    if (!Number.isSafeInteger(generation) || generation < 0) return
    for (const key of this.negativePermissions) {
      if (key.startsWith(`${generation}\u0000`)) this.negativePermissions.delete(key)
    }
    for (const pending of [...this.requestsByKey.values()]) {
      if (pending.request.generation === generation) this.settleEntry(pending, false)
    }
  }

  public cancelWindow(windowId: string): void {
    const normalizedWindowId = normalizeIdentifier(windowId)
    if (!normalizedWindowId) return
    const queue = this.queues.get(normalizedWindowId)
    if (!queue) return
    const entries = [...(queue.current ? [queue.current] : []), ...queue.pending]
    for (const pending of entries) this.completeEntry(pending, false, false)
    this.safeHide(normalizedWindowId)
    this.queues.delete(normalizedWindowId)
  }

  public dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const windowId of [...this.queues.keys()]) this.cancelWindow(windowId)
    this.negativePermissions.clear()
    this.requestsByKey.clear()
    this.pendingCount = 0
  }

  private getOrCreateQueue(windowId: string): WindowPermissionQueue | null {
    const existing = this.queues.get(windowId)
    if (existing) return existing
    if (this.queues.size >= MAX_TOTAL_PENDING) return null
    const queue: WindowPermissionQueue = { windowId, current: null, pending: [] }
    this.queues.set(windowId, queue)
    return queue
  }

  private pump(queue: WindowPermissionQueue): void {
    if (this.disposed || queue.current) return
    while (queue.pending.length > 0) {
      const pending = queue.pending.shift()!
      if (pending.completed) continue
      queue.current = pending
      try {
        this.options.show(queue.windowId)
        if (this.options.send(queue.windowId, { ...pending.prompt }) === false) {
          throw new Error('Userscript host permission prompt could not be delivered')
        }
      }
      catch {
        this.safeHide(queue.windowId)
        queue.current = null
        this.completeEntry(pending, false, false)
        continue
      }
      pending.timer = setTimeout(() => {
        if (pending.completed || queue.current !== pending) return
        this.negativePermissions.add(pending.request.permissionKey)
        this.settlePermissionKey(pending.request.permissionKey, false)
      }, this.timeoutMs)
      return
    }
    if (!queue.current) this.queues.delete(queue.windowId)
  }

  private settlePermissionKey(permissionKey: string, allowed: boolean): void {
    const matching = [...this.requestsByKey.values()]
      .filter(pending => pending.request.permissionKey === permissionKey)
    for (const pending of matching) this.settleEntry(pending, allowed)
  }

  private settleEntry(pending: PendingPermission, allowed: boolean): void {
    if (pending.completed) return
    const queue = this.queues.get(pending.request.windowId)
    if (!queue) {
      this.completeEntry(pending, allowed, false)
      return
    }
    if (queue.current === pending) {
      queue.current = null
      this.safeHide(queue.windowId)
    }
    else {
      const index = queue.pending.indexOf(pending)
      if (index >= 0) queue.pending.splice(index, 1)
    }
    this.completeEntry(pending, allowed, false)
    this.pump(queue)
  }

  private completeEntry(pending: PendingPermission, allowed: boolean, removeFromQueue: boolean): void {
    if (pending.completed) return
    pending.completed = true
    this.clearTimer(pending)
    this.requestsByKey.delete(pending.request.dedupeKey)
    this.pendingCount = Math.max(0, this.pendingCount - 1)
    if (removeFromQueue) {
      const queue = this.queues.get(pending.request.windowId)
      if (queue?.current === pending) queue.current = null
      else if (queue) {
        const index = queue.pending.indexOf(pending)
        if (index >= 0) queue.pending.splice(index, 1)
      }
    }
    pending.resolve(allowed)
  }

  private clearTimer(pending: PendingPermission): void {
    if (!pending.timer) return
    clearTimeout(pending.timer)
    pending.timer = null
  }

  private safeHide(windowId: string): void {
    try { this.options.hide(windowId) }
    catch { /* a destroyed shell window is already effectively hidden */ }
  }
}

function normalizePermissionRequest(
  input: UserScriptHostPermissionRequest,
): NormalizedPermissionRequest | null {
  if (!input || typeof input !== 'object') return null
  const windowId = normalizeIdentifier(input.windowId)
  const scriptId = normalizeIdentifier(input.scriptId)
  const scriptName = normalizeDisplayText(input.scriptName, MAX_SCRIPT_NAME_LENGTH)
  const targetHost = normalizeExactHost(input.targetHost)
  const sourceHost = normalizeExactHost(input.sourceHost)
  const webContentsId = input.webContentsId
  if (
    !windowId
    || !scriptId
    || !scriptName
    || !targetHost
    || !sourceHost
    || !Number.isSafeInteger(input.generation)
    || input.generation < 0
    || (webContentsId !== undefined && (!Number.isSafeInteger(webContentsId) || webContentsId <= 0))
  ) return null
  const permissionKey = `${input.generation}\u0000${scriptId}\u0000${targetHost}`
  return {
    windowId,
    generation: input.generation,
    scriptId,
    scriptName,
    targetHost,
    sourceHost,
    webContentsId,
    permissionKey,
    dedupeKey: `${windowId}\u0000${permissionKey}`,
  }
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_IDENTIFIER_LENGTH) return null
  if (value.trim() !== value || /\s/u.test(value) || hasDisallowedDisplayCharacters(value)) return null
  return value
}

function normalizeDisplayText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength || hasDisallowedDisplayCharacters(normalized)) return null
  return normalized
}

function normalizeExactHost(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_HOST_LENGTH) return null
  const normalized = value.trim().toLowerCase()
  if (
    normalized !== value.toLowerCase()
    || /\s/u.test(normalized)
    || hasDisallowedDisplayCharacters(normalized)
    || /[/\\@?#]/u.test(normalized)
  ) return null
  try {
    const parsed = new URL(`https://${normalized}/`)
    if (parsed.host !== normalized || !isCanonicalHostname(parsed.hostname)) return null
    return normalized
  }
  catch {
    return null
  }
}

function normalizeTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_TIMEOUT_MS) {
    throw new TypeError(`Userscript host permission timeout must be between 1 and ${MAX_TIMEOUT_MS} ms`)
  }
  return value
}

function hasDisallowedDisplayCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32
      || codePoint === 127
      || (codePoint >= 0x202a && codePoint <= 0x202e)
      || (codePoint >= 0x2066 && codePoint <= 0x2069)
  })
}

function isCanonicalHostname(hostname: string): boolean {
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true
  if (!hostname || hostname.length > 253 || hostname.includes('..') || hostname.endsWith('.')) return false
  if (!hostname.includes('.') && hostname !== 'localhost') return false
  return hostname.split('.').every(label => (
    label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label)
  ))
}
