import { app, type App, type Session, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { getAllSites } from '../../db/repositories/siteRepository'
import { CredentialVault, type CredentialAutofillValue, type CredentialSummary } from '../CredentialVault'
import {
  CredentialAutofillCoordinator,
  type AutofillWebContents,
  type CredentialAutofillSelectionRequest,
} from './autofillServiceCore'

export interface CredentialAutofillPrompt {
  requestId: string
  siteId: string
  pageUrl: string
  credentials: Array<Pick<CredentialSummary, 'credentialId' | 'siteId' | 'username' | 'displayName' | 'masked'>>
}

export interface CredentialAutofillSelectionHost {
  getWindowId: (contents: AutofillWebContents) => string | null
  showPrompt: (windowId: string, prompt: CredentialAutofillPrompt) => boolean
  setNoticeVisible: (windowId: string, visible: boolean) => void
}

export interface CredentialAutofillServiceOptions {
  vault?: Pick<CredentialVault, 'list' | 'getForAutofill'>
  getSites?: () => ReturnType<typeof getAllSites>
  selectionHost?: CredentialAutofillSelectionHost
}

interface PendingSelection {
  windowId: string
  prompt: CredentialAutofillPrompt
  resolve: (credentialId: string | null) => void
  timeout: ReturnType<typeof setTimeout>
}

/**
 * Binds the pure coordinator to Electron's global webContents lifecycle.
 * Filtering by the persistent OJ session keeps split windows covered without
 * relying on a TabManager's active-tab lookup.
 */
export class CredentialAutofillService {
  private readonly coordinator: CredentialAutofillCoordinator
  private readonly app: Pick<App, 'on' | 'off'>
  private readonly ojSession: Session
  private readonly listener: (event: Electron.Event, contents: WebContents) => void
  private readonly selectionHost: CredentialAutofillSelectionHost | null
  private readonly pendingSelections = new Map<string, PendingSelection>()

  constructor(dependencies: { app?: Pick<App, 'on' | 'off'>; ojSession: Session }, options: CredentialAutofillServiceOptions = {}) {
    const vault = options.vault ?? new CredentialVault()
    this.selectionHost = options.selectionHost ?? null
    this.coordinator = new CredentialAutofillCoordinator({
      getSites: options.getSites ?? getAllSites,
      listCredentials: (siteId): CredentialSummary[] => vault.list(siteId),
      getForAutofill: (credentialId): Promise<CredentialAutofillValue | null> => vault.getForAutofill(credentialId),
      selectCredential: (contents, request) => this.selectCredential(contents, request),
    })
    this.app = dependencies.app ?? app
    this.ojSession = dependencies.ojSession
    this.listener = (_event, contents) => {
      if (!this.isOjContents(contents)) return
      this.coordinator.attach(contents as unknown as AutofillWebContents)
    }
  }

  attach(): void {
    this.app.on('web-contents-created', this.listener)
  }

  dispose(): void {
    this.app.off('web-contents-created', this.listener)
    for (const requestId of [...this.pendingSelections.keys()]) this.finishSelection(requestId, null)
  }

  getCoordinatorForTests(): CredentialAutofillCoordinator {
    return this.coordinator
  }

  getCurrentPrompt(windowId: string): CredentialAutofillPrompt | null {
    for (const pending of this.pendingSelections.values()) {
      if (pending.windowId === windowId) return pending.prompt
    }
    return null
  }

  respondSelection(windowId: string, requestId: string, credentialId: string | null): boolean {
    const pending = this.pendingSelections.get(requestId)
    if (!pending || pending.windowId !== windowId) return false
    if (credentialId !== null && !pending.prompt.credentials.some((credential) => credential.credentialId === credentialId)) {
      return false
    }
    this.finishSelection(requestId, credentialId)
    return true
  }

  private selectCredential(
    contents: AutofillWebContents,
    request: CredentialAutofillSelectionRequest,
  ): Promise<string | null> {
    if (!this.selectionHost) return Promise.resolve(null)
    const windowId = this.selectionHost.getWindowId(contents)
    if (!windowId) return Promise.resolve(null)
    for (const [pendingId, pending] of this.pendingSelections) {
      if (pending.windowId === windowId) this.finishSelection(pendingId, null)
    }
    const requestId = randomUUID()
    const prompt: CredentialAutofillPrompt = {
      requestId,
      siteId: request.siteId,
      pageUrl: request.pageUrl,
      credentials: request.credentials.map(({ credentialId, siteId, username, displayName, masked }) => ({
        credentialId,
        siteId,
        username,
        displayName,
        masked,
      })),
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => this.finishSelection(requestId, null), 30_000)
      this.pendingSelections.set(requestId, { windowId, prompt, resolve, timeout })
      if (!this.selectionHost?.showPrompt(windowId, prompt)) {
        this.finishSelection(requestId, null)
        return
      }
      this.selectionHost.setNoticeVisible(windowId, true)
    })
  }

  private finishSelection(requestId: string, credentialId: string | null): void {
    const pending = this.pendingSelections.get(requestId)
    if (!pending) return
    clearTimeout(pending.timeout)
    this.pendingSelections.delete(requestId)
    this.selectionHost?.setNoticeVisible(pending.windowId, false)
    pending.resolve(credentialId)
  }

  private isOjContents(contents: WebContents): boolean {
    try {
      return contents.session === this.ojSession
    } catch {
      return false
    }
  }
}
