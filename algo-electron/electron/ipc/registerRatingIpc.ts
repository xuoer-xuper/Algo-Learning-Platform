import { ipcMain } from 'electron'
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
import { fetchCFCurrentRating, fetchCFRatingHistory, formatCFRatingHistory } from '../rating/codeforces'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerRatingIpc(): void {
  ipcMain.handle('rating:bindHandle', (_event, platform: string, handle: string) => {
    const id = upsertAccount(platform, handle)
    return { id, handle }
  })

  ipcMain.handle('rating:getAccount', (_event, platform: string, handle: string) => {
    return getAccount(platform, handle)
  })

  ipcMain.handle('rating:getAccounts', (_event, platform: string) => {
    return getAccountsByPlatform(platform)
  })

  ipcMain.handle('rating:syncCodeforces', async (_event, handle: string) => {
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

  ipcMain.handle('rating:getHistory', (_event, accountId: string) => {
    if (!getAccountById(accountId)) return []
    return getRatingHistory(accountId)
  })

  ipcMain.handle('rating:getCodeforcesAccount', () => {
    const accounts = getAccountsByPlatform('codeforces')
    return accounts.length > 0 ? accounts[0] : null
  })

  ipcMain.handle('rating:getContestResults', (_event, accountId: string) => {
    const db = getDb()
    return db.prepare(`
      SELECT * FROM contest_results WHERE account_id = ? ORDER BY contest_at DESC LIMIT 20
    `).all(accountId) as Record<string, unknown>[]
  })
}
