import { ipcMain } from './trustedSender'
import { oneOf, text } from './payloadSchema'
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
import { errorMessage } from '../shared/errors'

/*
 * 两个复用的界，理由写在这里而不是每个 channel 重复一遍：
 *
 * - `platform` 只放行 `'codeforces'`。渲染进程侧 `settingsApi.ts` 里这三个 channel 的
 *   platform 实参全是写死的字面量 `'codeforces'`，且本文件唯一的同步实现就是 CF
 *   （`rating:syncCodeforces` 内部也写死了 `'codeforces'`）。用 `text()` 只会让拼错的
 *   平台名变成一次查不到的查询——`platform_accounts.platform` 是裸 TEXT，没有 CHECK 约束，
 *   收窄只能发生在这里。接入第二个平台时这里要跟着加一项。
 * - `handle` 上限 64。CF 用户名实际是 3..24 位，取 64 是留余量而不是照抄那个上限——
 *   本层不想替 CF 判定"什么是合法用户名"，那由 CF API 的响应回答。要拦的是渲染进程那个
 *   自由文本框（`CodeforcesSyncPanel` / `CredentialsPage` 都只做了 `.trim()` 和非空判断，
 *   没有任何长度上限）把一整段文本当 handle 送进来，最后拼进 CF API 的 URL。
 */
const ratingPlatform = () => oneOf(['codeforces'])
const cfHandle = () => text({ max: 64 })

export function registerRatingIpc(): void {
  ipcMain.handle('rating:bindHandle', [ratingPlatform(), cfHandle()], (_event, platform, handle) => {
    const id = upsertAccount(platform, handle)
    return { id, handle }
  })

  ipcMain.handle('rating:getAccount', [ratingPlatform(), cfHandle()], (_event, platform, handle) => {
    return getAccount(platform, handle)
  })

  ipcMain.handle('rating:getAccounts', [ratingPlatform()], (_event, platform) => {
    return getAccountsByPlatform(platform)
  })

  ipcMain.handle('rating:syncCodeforces', [cfHandle()], async (_event, handle) => {
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
  ipcMain.handle('rating:getHistory', [text()], (_event, accountId) => {
    if (!getAccountById(accountId)) return []
    return getRatingHistory(accountId)
  })

  ipcMain.handle('rating:getCodeforcesAccount', () => {
    const accounts = getAccountsByPlatform('codeforces')
    return accounts.length > 0 ? accounts[0] : null
  })

  ipcMain.handle('rating:getContestResults', [text()], (_event, accountId) => {
    const db = getDb()
    return db.prepare(`
      SELECT * FROM contest_results WHERE account_id = ? ORDER BY contest_at DESC LIMIT 20
    `).all(accountId) as Record<string, unknown>[]
  })
}
