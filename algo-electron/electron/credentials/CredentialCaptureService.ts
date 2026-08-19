import { app, type App, type Session, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { getAllSites } from '../db/repositories/siteRepository'
import { resolveCredentialAutofillTarget } from './autofill/autofillPolicy'
import { CredentialVault } from './CredentialVault'
import {
  isOjCredentialCapturePayload,
  type CredentialCaptureAction,
  type CredentialCapturePrompt,
  type CredentialCaptureResult,
} from './captureTypes'

export interface CredentialCaptureHost {
  getWindowId: (contents: Pick<WebContents, 'id'>) => string | null
  showPrompt: (windowId: string, prompt: CredentialCapturePrompt) => boolean
  setNoticeVisible: (windowId: string, visible: boolean) => void
  sendResult: (windowId: string, result: CredentialCaptureResult) => void
}

export interface CredentialCaptureServiceOptions {
  vault?: Pick<CredentialVault, 'list' | 'getForAutofill' | 'save'>
  getSites?: () => ReturnType<typeof getAllSites>
  captureHost?: CredentialCaptureHost
}

interface PendingCapture {
  captureId: string
  windowId: string
  contentsId: number
  generation: number
  siteId: string
  username: string
  password: string
  prompt: CredentialCapturePrompt
  timeout: ReturnType<typeof setTimeout>
}

export class CredentialCaptureService {
  private readonly app: Pick<App, 'on' | 'off'>
  private readonly ojSession: Session
  private readonly vault: Pick<CredentialVault, 'list' | 'getForAutofill' | 'save'>
  private readonly getSites: () => ReturnType<typeof getAllSites>
  private readonly captureHost: CredentialCaptureHost | null
  private readonly pending = new Map<string, PendingCapture>()
  private readonly generations = new Map<number, number>()
  private readonly listener: (event: Electron.Event, contents: WebContents) => void

  constructor(
    dependencies: { app?: Pick<App, 'on' | 'off'>; ojSession: Session },
    options: CredentialCaptureServiceOptions = {},
  ) {
    this.app = dependencies.app ?? app
    this.ojSession = dependencies.ojSession
    this.vault = options.vault ?? new CredentialVault()
    this.getSites = options.getSites ?? getAllSites
    this.captureHost = options.captureHost ?? null
    this.listener = (_event, contents) => {
      if (!this.isOjContents(contents)) return
      this.attachContents(contents)
    }
  }

  attach(): void {
    this.app.on('web-contents-created', this.listener)
  }

  dispose(): void {
    this.app.off('web-contents-created', this.listener)
    for (const captureId of [...this.pending.keys()]) this.finish(captureId, true)
    this.generations.clear()
  }

  getCurrentPrompt(windowId: string): CredentialCapturePrompt | null {
    for (const capture of this.pending.values()) {
      if (capture.windowId === windowId) return capture.prompt
    }
    return null
  }

  async receiveCapture(contents: WebContents, payload: unknown): Promise<boolean> {
    try {
      if (!this.isOjContents(contents) || !isOjCredentialCapturePayload(payload) || contents.isDestroyed()) return false
      const url = safeGetUrl(contents)
      const sites = this.getSites()
      const site = sites.find(candidate => resolveCredentialAutofillTarget(url, candidate)?.siteId === candidate.id)
      if (!site || !site.enabled) return false
      const username = payload.username.trim()
      const password = payload.password
      if (!username || !password) return false

      const contentsId = contents.id
      const generation = (this.generations.get(contentsId) ?? 0) + 1
      this.generations.set(contentsId, generation)
      const windowId = this.captureHost?.getWindowId(contents)
      if (!windowId) return false

      const existing = this.vault.list(site.id).find(entry => entry.username === username) ?? null
      let isUpdate = false
      if (existing) {
        const current = await this.vault.getForAutofill(existing.credentialId)
        if (!current || current.password === password) return false
        isUpdate = true
      }
      if (generation !== this.generations.get(contentsId) || contents.isDestroyed() || safeGetUrl(contents) !== url) return false

      for (const [captureId, capture] of this.pending) {
        if (capture.windowId === windowId) this.finish(captureId, true)
      }
      const captureId = randomUUID()
      const prompt: CredentialCapturePrompt = {
        captureId,
        siteId: site.id,
        siteName: site.name,
        username,
        displayName: existing?.displayName ?? null,
        masked: existing?.masked ?? '********',
        isUpdate,
      }
      const timeout = setTimeout(() => this.finish(captureId, true), 30_000)
      this.pending.set(captureId, {
        captureId,
        windowId,
        contentsId,
        generation,
        siteId: site.id,
        username,
        password,
        prompt,
        timeout,
      })
      if (!this.captureHost?.showPrompt(windowId, prompt)) {
        this.finish(captureId)
        return false
      }
      this.captureHost.setNoticeVisible(windowId, true)
      return true
    } catch {
      return false
    }
  }

  async respondCapture(windowId: string, captureId: string, action: CredentialCaptureAction): Promise<boolean> {
    const capture = this.pending.get(captureId)
    if (!capture || capture.windowId !== windowId) return false
    if (!['save', 'update', 'cancel'].includes(action)) return false
    if (action !== 'cancel' && (capture.prompt.isUpdate ? action !== 'update' : action !== 'save')) return false
    this.finish(captureId)
    if (action === 'cancel') return true

    try {
      await this.vault.save({ siteId: capture.siteId, username: capture.username, password: capture.password })
      this.captureHost?.sendResult(windowId, { captureId, success: true })
      return true
    } catch {
      this.captureHost?.sendResult(windowId, { captureId, success: false, error: 'save-failed' })
      return false
    }
  }

  invalidate(contentsId: number): void {
    this.generations.set(contentsId, (this.generations.get(contentsId) ?? 0) + 1)
    for (const [captureId, capture] of this.pending) {
      if (capture.contentsId === contentsId) this.finish(captureId, true)
    }
  }

  private attachContents(contents: WebContents): void {
    if (this.generations.has(contents.id)) return
    this.generations.set(contents.id, 0)
    contents.on('did-navigate', () => this.invalidate(contents.id))
    contents.on('did-navigate-in-page', () => this.invalidate(contents.id))
    contents.once('destroyed', () => {
      this.invalidate(contents.id)
      this.generations.delete(contents.id)
    })
  }

  private finish(captureId: string, notifyRenderer = false): void {
    const capture = this.pending.get(captureId)
    if (!capture) return
    clearTimeout(capture.timeout)
    this.pending.delete(captureId)
    this.captureHost?.setNoticeVisible(capture.windowId, false)
    if (notifyRenderer) this.captureHost?.sendResult(capture.windowId, { captureId, success: true })
  }

  private isOjContents(contents: WebContents): boolean {
    try { return contents.session === this.ojSession }
    catch { return false }
  }
}

function safeGetUrl(contents: Pick<WebContents, 'getURL'>): string {
  try { return contents.getURL() }
  catch { return '' }
}
