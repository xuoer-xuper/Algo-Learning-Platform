import type { BrowserWindow } from 'electron'
import type { TabManager } from '../browser/TabManager'
import type { SyncService } from '../submissions/syncService'
import type { TrackingService } from '../tracking/TrackingService'
import type { CoachPetWindow } from '../coach/CoachPetWindow'
import type { CoachOrchestrator } from '../coach/CoachOrchestrator'
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

interface RegisterMainIpcOptions {
  getWindow: () => BrowserWindow | null
  getTabManager: () => TabManager | null
  getTrackingService: () => TrackingService | null
  getSyncService: () => SyncService | null
  getCoachPetWindow?: () => CoachPetWindow | null
  /** 阶段 2 注入：CoachOrchestrator */
  getCoachOrchestrator?: () => CoachOrchestrator | null
}

export function registerMainIpc(options: RegisterMainIpcOptions): void {
  const notifyProblemsUpdated = () => options.getWindow()?.webContents.send('problems:updated')

  registerAiIpc()
  registerBackupIpc({ getParentWindow: options.getWindow })
  registerBrowserShellIpc({
    getWindow: options.getWindow,
    getTabManager: options.getTabManager,
    getTrackingService: options.getTrackingService,
  })
  registerConfigIpc()
  registerCookieIpc()
  registerNotesIpc({ notifyProblemsUpdated })
  registerProblemIpc({ notifyProblemsUpdated })
  registerSitesIpc({
    getParentWindow: options.getWindow,
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
      getWindow: options.getWindow,
      getCoachPetWindow: options.getCoachPetWindow,
      getCoachOrchestrator: options.getCoachOrchestrator,
    })
  }
}
