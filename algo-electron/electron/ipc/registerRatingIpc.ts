import { ipcMain } from './trustedSender'
import {
  bindHandleInput,
  getAccountInput,
  getAccountsInput,
  getContestResultsInput,
  getHistoryInput,
  syncCodeforcesInput,
} from '../../src/shared/types/ipc/rating'
import { ERROR_CODES } from '../../src/shared/constants/errorCodes'
import type { IpcOutput } from '../../src/shared/types/common'
import { getDb } from '../db/connection'
import {
  computePeakRating,
  getAccount,
  getAccountById,
  getAccountsByPlatform,
  getRatingHistory,
  updateCurrentRating,
  updatePeakRating,
  upsertAccount,
  upsertRatingHistory,
} from '../db/repositories/accountRepository'
import {
  fetchCFCurrentRating,
  fetchCFRatingHistory,
  formatCFRatingHistory,
} from '../rating/codeforces'
import { logger } from '../shared/logger'
import { IPC_CHANNELS } from '../../src/shared/constants/channels'

const log = logger.scope('rating')

/*
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/rating.ts`；
 * platform 闭集与 handle 64 的理由写在那里。
 */
export function registerRatingIpc(): void {
  ipcMain.handle(IPC_CHANNELS.RATING.BIND_HANDLE, bindHandleInput, (_event, platform, handle) => {
    const id = upsertAccount(platform, handle)
    return { id, handle }
  })

  ipcMain.handle(IPC_CHANNELS.RATING.GET_ACCOUNT, getAccountInput, (_event, platform, handle) => {
    return getAccount(platform, handle)
  })

  ipcMain.handle(IPC_CHANNELS.RATING.GET_ACCOUNTS, getAccountsInput, (_event, platform) => {
    return getAccountsByPlatform(platform)
  })

  ipcMain.handle(
    IPC_CHANNELS.RATING.SYNC_CODEFORCES,
    syncCodeforcesInput,
    async (
      _event,
      handle,
    ): Promise<IpcOutput<{ historyCount: number; inserted: number; peak: number | null }>> => {
      try {
        const accountId = upsertAccount('codeforces', handle)

        const info = await fetchCFCurrentRating(handle)
        if (info) {
          updateCurrentRating(accountId, info.rating)
        }

        const history = await fetchCFRatingHistory(handle)
        const formatted = formatCFRatingHistory(history)
        let inserted = 0
        for (const h of formatted) {
          const isNew = upsertRatingHistory({ accountId, platform: 'codeforces', ...h })
          if (isNew) inserted++
        }

        const peak = computePeakRating(accountId)
        if (peak) updatePeakRating(accountId, peak)

        return { success: true, data: { historyCount: history.length, inserted, peak } }
      } catch (error) {
        // 拉取走的是 Codeforces 公网 API：失败归为外部依赖故障。原始异常
        // （含 API 返回文本）只进日志，用户只看到固定文案。
        log.warn('sync-codeforces-failed', { error })
        return { success: false, error: '同步 Codeforces 数据失败', code: ERROR_CODES.EXTERNAL }
      }
    },
  )

  // `getAccountById` 这道存在性检查留着：它是一次 DB 查询，schema 表达不了，
  // 且语义不是"参数非法"而是"账号不存在时返回空列表"。
  ipcMain.handle(IPC_CHANNELS.RATING.GET_HISTORY, getHistoryInput, (_event, accountId) => {
    if (!getAccountById(accountId)) return []
    return getRatingHistory(accountId)
  })

  ipcMain.handle(IPC_CHANNELS.RATING.GET_CODEFORCES_ACCOUNT, () => {
    const accounts = getAccountsByPlatform('codeforces')
    return accounts.length > 0 ? accounts[0] : null
  })

  ipcMain.handle(
    IPC_CHANNELS.RATING.GET_CONTEST_RESULTS,
    getContestResultsInput,
    (_event, accountId) => {
      const db = getDb()
      return db
        .prepare(
          `
      SELECT * FROM contest_results WHERE account_id = ? ORDER BY contest_at DESC LIMIT 20
    `,
        )
        .all(accountId)
    },
  )
}
