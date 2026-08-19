import { app, type App, type Session, type WebContents } from 'electron'
import { getAllSites } from '../../db/repositories/siteRepository'
import { CredentialVault, type CredentialAutofillValue, type CredentialSummary } from '../CredentialVault'
import { CredentialAutofillCoordinator, type AutofillWebContents } from './autofillServiceCore'

export interface CredentialAutofillServiceOptions {
  vault?: Pick<CredentialVault, 'list' | 'getForAutofill'>
  getSites?: () => ReturnType<typeof getAllSites>
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

  constructor(dependencies: { app?: Pick<App, 'on' | 'off'>; ojSession: Session }, options: CredentialAutofillServiceOptions = {}) {
    const vault = options.vault ?? new CredentialVault()
    this.coordinator = new CredentialAutofillCoordinator({
      getSites: options.getSites ?? getAllSites,
      listCredentials: (siteId): CredentialSummary[] => vault.list(siteId),
      getForAutofill: (credentialId): Promise<CredentialAutofillValue | null> => vault.getForAutofill(credentialId),
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
  }

  getCoordinatorForTests(): CredentialAutofillCoordinator {
    return this.coordinator
  }

  private isOjContents(contents: WebContents): boolean {
    try {
      return contents.session === this.ojSession
    } catch {
      return false
    }
  }
}
