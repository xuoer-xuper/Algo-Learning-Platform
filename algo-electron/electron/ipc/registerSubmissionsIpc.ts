import { ipcMain } from 'electron'
import type { SyncResult, SyncService } from '../submissions/syncService'

interface RegisterSubmissionsIpcOptions {
  getSyncService: () => SyncService | null
}

function serviceNotReady(platform: string): SyncResult {
  return { platform, fetched: 0, inserted: 0, error: 'SyncService not ready' }
}

export function registerSubmissionsIpc(options: RegisterSubmissionsIpcOptions): void {
  ipcMain.handle('submissions:syncCodeforces', async (_event, handle: string) => {
    const syncService = options.getSyncService()
    if (!syncService) return serviceNotReady('codeforces')
    return syncService.syncCodeforces(handle)
  })

  ipcMain.handle('submissions:syncVjudge', async () => {
    const syncService = options.getSyncService()
    if (!syncService) return serviceNotReady('vjudge')
    return syncService.syncVjudge()
  })

  ipcMain.handle('submissions:syncCurrentPage', async () => {
    const syncService = options.getSyncService()
    if (!syncService) return serviceNotReady('unknown')
    return syncService.syncCurrentPage()
  })
}
