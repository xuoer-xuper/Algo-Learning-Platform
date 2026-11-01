import { ipcMain } from './trustedSender'
import {
  bindHandleInput,
  getAccountInput,
  getAccountsInput,
  getContestResultsInput,
  getHistoryInput,
  syncCodeforcesInput,
} from '../../src/shared/types/ipc/rating'
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
import { errorMessage } from '../shared/errors'

/*
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/rating.ts`；
 * platform 闭集与 handle 64 的理由写在那里。
 */
export function registerRatingIpc(): void {
  ipcMain.handle('rating:bindHandle', bindHandleInput, (_event, platform, handle) => {
    const id = upsertAccount(platform, handle)
    return { id, handle }
  })

  ipcMain.handle('rating:getAccount', getAccountInput, (_event, platform, handle) => {
    return getAccount(platform, handle)
  })

  ipcMain.handle('rating:getAccounts', getAccountsInput, (_event, platform) => {
    return getAccountsByPlatform(platform)
  })

  ipcMain.handle('rating:syncCodeforces', syncCodeforcesInput, async (_event, handle) => {
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

      return { success: true, historyCount: history.length, inserted, peak }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  })

  // `getAccountById` 这道存在性检查留着：它是一次 DB 查询，schema 表达不了，
  // 且语义不是"参数非法"而是"账号不存在时返回空列表"。
  ipcMain.handle('rating:getHistory', getHistoryInput, (_event, accountId) => {
    if (!getAccountById(accountId)) return []
    return getRatingHistory(accountId)
  })

  ipcMain.handle('rating:getCodeforcesAccount', () => {
    const accounts = getAccountsByPlatform('codeforces')
    return accounts.length > 0 ? accounts[0] : null
  })

  ipcMain.handle('rating:getContestResults', getContestResultsInput, (_event, accountId) => {
    const db = getDb()
    return db
      .prepare(
        `
      SELECT * FROM contest_results WHERE account_id = ? ORDER BY contest_at DESC LIMIT 20
    `,
      )
      .all(accountId)
  })
}
