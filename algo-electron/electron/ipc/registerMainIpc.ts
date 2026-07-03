import type { BrowserWindow } from 'electron'
import type { TabManager } from '../browser/TabManager'
import type { SyncService } from '../submissions/syncService'
import type { TrackingService } from '../tracking/TrackingService'
import { registerAiIpc } from './registerAiIpc'
import { registerBrowserShellIpc } from './registerBrowserShellIpc'
import { registerConfigIpc } from './registerConfigIpc'
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
}

export function registerMainIpc(options: RegisterMainIpcOptions): void {
  const notifyProblemsUpdated = () => options.getWindow()?.webContents.send('problems:updated')

  registerAiIpc()
  registerBrowserShellIpc({
    getWindow: options.getWindow,
    getTabManager: options.getTabManager,
    getTrackingService: options.getTrackingService,
  })
  registerConfigIpc()
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
}
