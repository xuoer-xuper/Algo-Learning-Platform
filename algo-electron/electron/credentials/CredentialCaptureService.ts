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
  /** 是否已向壳层展示。提交先挂起，页面导航离开登录页（登录成功的信号）才展示。 */
  shown: boolean
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
      if (capture.windowId === windowId && capture.shown) return capture.prompt
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
        shown: false,
      })
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
    contents.on('did-navigate', (_event, url, _code, _text, isMainFrame = true) => {
      if (isMainFrame) this.handleNavigation(contents.id, url)
    })
    contents.on('did-navigate-in-page', (_event, url, isMainFrame = true) => {
      if (isMainFrame) this.handleNavigation(contents.id, url)
    })
    contents.once('destroyed', () => {
      this.invalidate(contents.id)
      this.generations.delete(contents.id)
    })
  }

  /**
   * 导航是登录成败的分水岭，也是"存储密码"提示的唯一展示时机（对齐 Chrome）：
   * - 离开登录页 → 提交真的登录成功了，此刻才把提示亮出来，答复窗口重新起算；
   * - 仍在登录页（验证码错误重渲染、重试）→ 这次提交没有成功，静默丢弃；
   * - 已展示的提示不随后续导航撤销——用户该有从容选择的时间。
   */
  private handleNavigation(contentsId: number, url: string): void {
    this.generations.set(contentsId, (this.generations.get(contentsId) ?? 0) + 1)
    for (const [captureId, capture] of this.pending) {
      if (capture.contentsId !== contentsId || capture.shown) continue
      const site = this.getSites().find(candidate => candidate.id === capture.siteId)
      if (!site || !resolveCredentialAutofillTarget(url, site)) {
        if (!site) {
          this.finish(captureId, true)
          continue
        }
        // 站点配置还在但 URL 已不命中登录页 → 登录成功，展示提示。
        capture.shown = true
        clearTimeout(capture.timeout)
        capture.timeout = setTimeout(() => this.finish(captureId, true), 30_000)
        if (!this.captureHost?.showPrompt(capture.windowId, capture.prompt)) {
          this.finish(captureId)
          continue
        }
        this.captureHost.setNoticeVisible(capture.windowId, true)
      } else {
        this.finish(captureId, true)
      }
    }
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
