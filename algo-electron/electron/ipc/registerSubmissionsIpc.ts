import { getShellWindowOwner, ipcMain } from './trustedSender'
import { text } from './payloadSchema'
import type { SyncResult, SyncService } from '../submissions/syncService'

interface RegisterSubmissionsIpcOptions {
  getSyncService: () => SyncService | null
}

function serviceNotReady(platform: string): SyncResult {
  return { platform, fetched: 0, inserted: 0, error: 'SyncService not ready' }
}

export function registerSubmissionsIpc(options: RegisterSubmissionsIpcOptions): void {
  /*
   * `handle` 走 `text()` 默认的 1..200。
   *
   * 下界 1 对得上唯一调用点：`CodeforcesSyncPanel` 的 `handleSyncCF` 先
   * `if (!cfHandle.trim())` 挡掉空串才发，所以空串到这里只可能是调用两端脱节。
   *
   * `syncService.syncCodeforces` 里那句 `if (!handle)` 刻意不删：它是主进程内部调用的
   * 兜底，而且返回的是一条给用户看的中文提示，不是校验失败。schema 拦的是"渲染进程
   * 发了非法载荷"，两者不是同一件事。
   */
  ipcMain.handle('submissions:syncCodeforces', [text()], async (_event, handle) => {
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
