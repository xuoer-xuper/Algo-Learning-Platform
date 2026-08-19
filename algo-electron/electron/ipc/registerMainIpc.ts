import type { SyncService } from '../submissions/syncService'
import type { CoachPetWindow } from '../coach/CoachPetWindow'
import type { CoachOrchestrator } from '../coach/CoachOrchestrator'
import type { BrowserDiagnostics } from '../diagnostics/BrowserDiagnostics'
import { registerAiIpc } from './registerAiIpc'
import { registerBackupIpc } from './registerBackupIpc'
import { registerBrowserShellIpc } from './registerBrowserShellIpc'
import { registerCoachIpc } from './registerCoachIpc'
import { registerConfigIpc } from './registerConfigIpc'
import { registerCookieIpc } from './registerCookieIpc'
import { registerCredentialsIpc } from './registerCredentialsIpc'
import { registerNotesIpc } from './registerNotesIpc'
import { registerProblemIpc } from './registerProblemIpc'
import { registerRatingIpc } from './registerRatingIpc'
import { registerScriptsIpc } from './registerScriptsIpc'
import { registerSitesIpc } from './registerSitesIpc'
import { registerStatsIpc } from './registerStatsIpc'
import { registerSubmissionsIpc } from './registerSubmissionsIpc'
import type { PendingUserScriptInstallRegistry } from '../downloads/userScriptNavigation'
import type { AppWindow } from '../windows/AppWindow'
import type { UserScriptRuntime } from '../scripts/UserScriptRuntime'
import type { CredentialVault } from '../credentials/CredentialVault'
import type { CredentialAutofillService } from '../credentials/autofill/CredentialAutofillService'
import type {
  UserScriptHostPermissionPrompt,
  UserScriptHostPermissionResponse,
} from '../scripts/UserScriptHostPermissionBroker'

interface RegisterMainIpcOptions {
  getSyncService: () => SyncService | null
  getUserScriptRuntime?: () => UserScriptRuntime | null
  getCoachPetWindow?: () => CoachPetWindow | null
  /** 阶段 2 注入：CoachOrchestrator */
  getCoachOrchestrator?: () => CoachOrchestrator | null
  credentialVault?: CredentialVault
  getCredentialAutofillService?: () => CredentialAutofillService | null
  getBrowserDiagnostics?: () => BrowserDiagnostics | null
  getUserScriptInstallRegistry?: () => PendingUserScriptInstallRegistry | null
  allowInsecureLocalhost?: boolean
  notifyProblemsUpdated: () => void
  moveTabToNewWindow?: (source: AppWindow, tabId: string) => Promise<boolean>
  finishTabDrag?: (
    source: AppWindow,
    tabId: string,
    targetIndex: number,
    screenX: number,
    screenY: number,
  ) => Promise<boolean>
  getUserScriptHostPermissionPrompt?: (owner: AppWindow) => UserScriptHostPermissionPrompt | null
  respondUserScriptHostPermission?: (
    owner: AppWindow,
    promptId: string,
    allow: boolean,
  ) => Promise<UserScriptHostPermissionResponse>
}

export function registerMainIpc(options: RegisterMainIpcOptions): void {
  const notifyProblemsUpdated = (): void => { options.notifyProblemsUpdated() }
  const refreshUserScriptRuntime = (): void => { options.getUserScriptRuntime?.()?.refresh() }

  registerAiIpc()
  registerBackupIpc()
  registerBrowserShellIpc({
    getBrowserDiagnostics: options.getBrowserDiagnostics,
    getUserScriptInstallRegistry: options.getUserScriptInstallRegistry,
    allowInsecureLocalhost: options.allowInsecureLocalhost,
    moveTabToNewWindow: options.moveTabToNewWindow,
    finishTabDrag: options.finishTabDrag,
    getUserScriptHostPermissionPrompt: options.getUserScriptHostPermissionPrompt,
    respondUserScriptHostPermission: options.respondUserScriptHostPermission,
  })
  registerConfigIpc()
  registerCookieIpc()
  registerCredentialsIpc(options.credentialVault, {
    getAutofillService: options.getCredentialAutofillService,
  })
  registerNotesIpc({ notifyProblemsUpdated })
  registerProblemIpc({ notifyProblemsUpdated })
  registerSitesIpc({
    notifyProblemsUpdated,
    refreshUserScriptRuntime,
  })
  registerScriptsIpc({ refreshUserScriptRuntime })
  registerRatingIpc()
  registerStatsIpc()
  registerSubmissionsIpc({
    getSyncService: options.getSyncService,
  })

  if (options.getCoachPetWindow) {
    registerCoachIpc({
      getCoachPetWindow: options.getCoachPetWindow,
      getCoachOrchestrator: options.getCoachOrchestrator,
    })
  }
}
