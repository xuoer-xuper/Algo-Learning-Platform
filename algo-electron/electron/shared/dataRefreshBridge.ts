import { IPC_CHANNELS, type IpcChannel } from '../../src/shared/constants/channels'
import type { DataTable } from '../../src/shared/types/data'
import { subscribeDataChanges } from './dataEvents'
import { logger } from './logger'

/** The destination is the shell-window manager, never remote OJ web contents. */
export function installDataRefreshBridge(target: {
  sendToAll: (channel: IpcChannel, ...args: unknown[]) => void
}): () => void {
  const pending = new Set<DataTable>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const unsubscribe = subscribeDataChanges(({ tables }) => {
    for (const table of tables) pending.add(table)
    if (timer !== undefined) return
    // A fixed window, rather than a resetting debounce, cannot starve continuous writes.
    timer = setTimeout(() => {
      timer = undefined
      const changed = [...pending]
      pending.clear()
      try {
        target.sendToAll(IPC_CHANNELS.DATA.CHANGED, { tables: changed })
      } catch {
        logger.warn('data-refresh.broadcast-failed')
      }
    }, 50)
  })
  return () => {
    unsubscribe()
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    pending.clear()
  }
}
