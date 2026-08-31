import type { SiteConfigData } from '../../db/repositories/siteRepository'
import type {
  CredentialAutofillValue,
  CredentialSummary,
} from '../credentialVaultCore'
import { resolveCredentialAutofillTarget, type CredentialAutofillTarget } from './autofillPolicy'
import type { OjCredentialFillPayload } from './credentialAutofillBridge'

export interface AutofillWebContents {
  id: number
  getURL(): string
  isDestroyed?(): boolean
  send(channel: string, payload: OjCredentialFillPayload): void
  // 监听器一律零参：这四个事件在这里只用来触发失效/清理，从不读事件参数。
  // 声明成 `(...args: any[]) => void` 会让"以后想读 url"看起来是被允许的，实际并没有。
  on(event: 'dom-ready' | 'did-navigate' | 'did-navigate-in-page' | 'destroyed', listener: () => void): void
  once?(event: 'destroyed', listener: () => void): void
}

export interface CredentialAutofillDependencies {
  getSites: () => SiteConfigData[]
  listCredentials: (siteId: string) => CredentialSummary[]
  getForAutofill: (credentialId: string) => Promise<CredentialAutofillValue | null>
  selectCredential?: (
    contents: AutofillWebContents,
    request: CredentialAutofillSelectionRequest,
  ) => Promise<string | null>
}

export interface CredentialAutofillSelectionRequest {
  siteId: string
  pageUrl: string
  credentials: CredentialSummary[]
}

export class CredentialAutofillCoordinator {
  private readonly dependencies: CredentialAutofillDependencies
  private readonly attached = new Set<number>()
  private readonly requestGenerations = new Map<number, number>()
  private readonly filledKeys = new Map<number, string>()

  constructor(dependencies: CredentialAutofillDependencies) {
    this.dependencies = dependencies
  }

  attach(contents: AutofillWebContents): void {
    if (this.attached.has(contents.id)) return
    this.attached.add(contents.id)
    this.requestGenerations.set(contents.id, 0)
    const onReady = (): void => { void this.tryAutofill(contents).catch(() => {}) }
    contents.on('dom-ready', onReady)
    contents.on('did-navigate', () => this.invalidate(contents.id))
    contents.on('did-navigate-in-page', () => {
      this.invalidate(contents.id)
      onReady()
    })
    const cleanup = (): void => {
      this.attached.delete(contents.id)
      this.requestGenerations.delete(contents.id)
      this.filledKeys.delete(contents.id)
    }
    if (contents.once) contents.once('destroyed', cleanup)
    else contents.on('destroyed', cleanup)
  }

  detach(contentsId: number): void {
    this.attached.delete(contentsId)
    this.requestGenerations.delete(contentsId)
    this.filledKeys.delete(contentsId)
  }

  invalidate(contentsId: number): void {
    this.requestGenerations.set(contentsId, (this.requestGenerations.get(contentsId) ?? 0) + 1)
    this.filledKeys.delete(contentsId)
  }

  async tryAutofill(contents: AutofillWebContents): Promise<boolean> {
    if (!this.attached.has(contents.id) || contents.isDestroyed?.()) return false
    const url = safeGetUrl(contents)
    let target: CredentialAutofillTarget | null
    try {
      target = this.resolveTarget(url)
    } catch {
      return false
    }
    const generation = (this.requestGenerations.get(contents.id) ?? 0) + 1
    this.requestGenerations.set(contents.id, generation)
    if (!target) {
      this.filledKeys.delete(contents.id)
      return false
    }

    let credentials: CredentialSummary[]
    try {
      credentials = this.dependencies.listCredentials(target.siteId)
    } catch {
      return false
    }
    if (credentials.length === 0) return false
    if (generation !== this.requestGenerations.get(contents.id)) return false
    if (contents.isDestroyed?.() || safeGetUrl(contents) !== url) return false

    let credential: CredentialSummary | undefined = credentials[0]
    if (credentials.length > 1) {
      const selectedId = await this.dependencies.selectCredential?.(contents, {
        siteId: target.siteId,
        pageUrl: url,
        credentials,
      })
      if (generation !== this.requestGenerations.get(contents.id)) return false
      if (contents.isDestroyed?.() || safeGetUrl(contents) !== url || !selectedId) return false
      credential = credentials.find(entry => entry.credentialId === selectedId)
    }
    if (!credential) return false
    const fillKey = `${url}\n${target.siteId}\n${credential.credentialId}`
    if (this.filledKeys.get(contents.id) === fillKey) return false

    let autofill: CredentialAutofillValue | null
    try {
      autofill = await this.dependencies.getForAutofill(credential.credentialId)
    } catch {
      return false
    }
    if (generation !== this.requestGenerations.get(contents.id)) return false
    if (contents.isDestroyed?.() || safeGetUrl(contents) !== url) return false
    if (!autofill || autofill.credentialId !== credential.credentialId || autofill.siteId !== target.siteId) return false

    const payload: OjCredentialFillPayload = {
      credentialId: autofill.credentialId,
      siteId: autofill.siteId,
      username: autofill.username,
      password: autofill.password,
      pageUrl: url,
      usernameSelectors: target.usernameSelectors,
      passwordSelectors: target.passwordSelectors,
    }
    try {
      contents.send('oj-credentials:fill', payload)
      this.filledKeys.set(contents.id, fillKey)
      return true
    } catch {
      return false
    }
  }

  private resolveTarget(url: string): CredentialAutofillTarget | null {
    for (const site of this.dependencies.getSites()) {
      const target = resolveCredentialAutofillTarget(url, site)
      if (target) return target
    }
    return null
  }
}

function safeGetUrl(contents: AutofillWebContents): string {
  try { return contents.getURL() } catch { return '' }
}
