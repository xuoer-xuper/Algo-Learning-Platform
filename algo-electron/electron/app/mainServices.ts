import type { BrowserWindow } from 'electron'
import { CookieVault } from '../cookies/CookieVault'
import { initDb, getDb } from '../db/connection'
import { getEnabledSites, seedBuiltinSites } from '../db/repositories/siteRepository'
import { setEnabledSitesFetcher } from '../parsers/registry'
import { UserScriptService } from '../scripts/UserScriptService'
import { SiteRegistry } from '../sites/siteRegistry'
import { RealtimeSubmissionService } from '../submissions/RealtimeSubmissionService'
import { createDefaultSubmissionBatchWriter } from '../submissions/createDefaultSubmissionBatchWriter'
import { SyncService } from '../submissions/syncService'
import { TrackingService } from '../tracking/TrackingService'

export interface MainServices {
  trackingService: TrackingService
  syncService: SyncService
  realtimeSubmissionService: RealtimeSubmissionService
  userScriptService: UserScriptService
}

export function initializeMainServices(getWindow: () => BrowserWindow | null): MainServices {
  initDb()
  seedBuiltinSites()
  setEnabledSitesFetcher(getEnabledSites)
  new SiteRegistry()
  new CookieVault()

  const trackingService = new TrackingService()
  const syncService = new SyncService({
    batchWriter: createDefaultSubmissionBatchWriter(),
    findNowcoderProblemBySearch: (search) => {
      const problem = getDb().prepare(
        "SELECT platform_problem_id FROM problems WHERE platform = 'nowcoder' AND platform_problem_id LIKE ?"
      ).get(`%${search}%`) as { platform_problem_id: string } | undefined
      return problem?.platform_problem_id
    },
  })
  const realtimeSubmissionService = new RealtimeSubmissionService(getWindow)
  realtimeSubmissionService.registerIpc()
  const userScriptService = new UserScriptService()

  return {
    trackingService,
    syncService,
    realtimeSubmissionService,
    userScriptService,
  }
}
