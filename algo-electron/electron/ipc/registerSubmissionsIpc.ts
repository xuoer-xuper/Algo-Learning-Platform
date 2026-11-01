import { getShellWindowOwner, ipcMain } from './trustedSender'
import { syncCodeforcesInput } from '../../src/shared/types/ipc/submissions'
import type { SyncResult, SyncService } from '../submissions/syncService'
import { IPC_CHANNELS } from '../../src/shared/constants/channels'

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
  ipcMain.handle(
    IPC_CHANNELS.SUBMISSIONS.SYNC_CODEFORCES,
    syncCodeforcesInput,
    async (_event, handle) => {
      const syncService = options.getSyncService()
      if (!syncService) return serviceNotReady('codeforces')
      return syncService.syncCodeforces(handle)
    },
  )

  ipcMain.handle(IPC_CHANNELS.SUBMISSIONS.SYNC_VJUDGE, async (event) => {
    const syncService = options.getSyncService()
    if (!syncService) return serviceNotReady('vjudge')
    return syncService.syncVjudge(getShellWindowOwner(event)?.tabManager ?? null)
  })

  ipcMain.handle(IPC_CHANNELS.SUBMISSIONS.SYNC_CURRENT_PAGE, async (event) => {
    const syncService = options.getSyncService()
    if (!syncService) return serviceNotReady('unknown')
    return syncService.syncCurrentPage(getShellWindowOwner(event)?.tabManager ?? null)
  })
}
