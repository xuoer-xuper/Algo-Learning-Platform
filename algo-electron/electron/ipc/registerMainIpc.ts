import type { IpcMainInvokeEvent } from 'electron'
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
import { registerNotesIpc } from './registerNotesIpc'
import { registerProblemIpc } from './registerProblemIpc'
import { registerRatingIpc } from './registerRatingIpc'
import { registerScriptsIpc } from './registerScriptsIpc'
import { registerSitesIpc } from './registerSitesIpc'
import { registerStatsIpc } from './registerStatsIpc'
import { registerSubmissionsIpc } from './registerSubmissionsIpc'
import type { PendingUserScriptInstallRegistry } from '../downloads/userScriptNavigation'
import { getShellWindowOwner } from './trustedSender'

interface RegisterMainIpcOptions {
  getSyncService: () => SyncService | null
  getCoachPetWindow?: () => CoachPetWindow | null
  /** 阶段 2 注入：CoachOrchestrator */
  getCoachOrchestrator?: () => CoachOrchestrator | null
  getBrowserDiagnostics?: () => BrowserDiagnostics | null
  getUserScriptInstallRegistry?: () => PendingUserScriptInstallRegistry | null
  allowInsecureLocalhost?: boolean
}

export function registerMainIpc(options: RegisterMainIpcOptions): void {
  const notifyProblemsUpdated = (event: IpcMainInvokeEvent): void => {
    getShellWindowOwner(event)?.send('problems:updated')
  }

  registerAiIpc()
  registerBackupIpc()
  registerBrowserShellIpc({
    getBrowserDiagnostics: options.getBrowserDiagnostics,
    getUserScriptInstallRegistry: options.getUserScriptInstallRegistry,
    allowInsecureLocalhost: options.allowInsecureLocalhost,
  })
  registerConfigIpc()
  registerCookieIpc()
  registerNotesIpc({ notifyProblemsUpdated })
  registerProblemIpc({ notifyProblemsUpdated })
  registerSitesIpc({
    notifyProblemsUpdated,
  })
  registerScriptsIpc()
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
