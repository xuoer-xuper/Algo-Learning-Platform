import { getShellWindowOwner, ipcMain } from './trustedSender'
import { syncCodeforcesInput } from '../../src/shared/types/ipc/submissions'
import type { SyncResult, SyncService } from '../submissions/syncService'

interface RegisterSubmissionsIpcOptions {
  getSyncService: () => SyncService | null
}

function serviceNotReady(platform: string): SyncResult {
  return { platform, fetched: 0, inserted: 0, error: 'SyncService not ready' }
}

export function registerSubmissionsIpc(options: RegisterSubmissionsIpcOptions): void {
  /*
   * `handle` 的界（标识符 1..200）与"下界 1 对得上唯一调用点"的理由写在
   * `src/shared/types/ipc/submissions.ts`。
   */
  ipcMain.handle('submissions:syncCodeforces', syncCodeforcesInput, async (_event, handle) => {
    const syncService = options.getSyncService()
    if (!syncService) return serviceNotReady('codeforces')
    return syncService.syncCodeforces(handle)
  })

  ipcMain.handle('submissions:syncVjudge', async (event) => {
    const syncService = options.getSyncService()
    if (!syncService) return serviceNotReady('vjudge')
    return syncService.syncVjudge(getShellWindowOwner(event)?.tabManager ?? null)
  })

  ipcMain.handle('submissions:syncCurrentPage', async (event) => {
    const syncService = options.getSyncService()
    if (!syncService) return serviceNotReady('unknown')
    return syncService.syncCurrentPage(getShellWindowOwner(event)?.tabManager ?? null)
  })
}
