import { ipcMain } from './trustedSender'
import { int, localDate, optional, text } from './payloadSchema'
import { getOverviewStats } from '../db/repositories/problemRepository'
import {
  getAcTrend,
  getDailyActiveStats,
  getLastActiveTime,
  getPlatformDistribution,
  getProblemVisitStats,
  getRevisitStats,
  getStreakDays,
  getSubmissionTrend,
  getTimeline,
  getUnreviewedProblems,
  getVisitedTrend,
  getWrongProblems,
  recomputeAllDailyStats,
  recomputeDailyStats,
} from '../db/repositories/statsRepository'

/*
 * 两个复用的界，理由写在这里而不是每个 channel 重复一遍：
 *
 * - `days` 上限 3650（十年）。趋势查询要么进 `LIMIT ?`，要么经 `localDateDaysAgo` 变成
 *   SQL 里的日期下界。实测传 `'abc'` 时后者算出 `'NaN-NaN-NaN'`，SQL 匹配不到任何行——
 *   于是图表安静地变成空的，既不报错也不记日志。这是本层要拦住的那类失败。
 * - `limit` 上限 1000。当前最大调用点是 20（时间线），1000 留足余量，又不至于让 `LIMIT`
 *   退化成全表扫描。
 *
 * 都用 `optional`：这些参数在 repository 侧有默认值（`days = 30`），"没传"是合法输入。
 * 但 `null` 不是——`optional` 只放过 `undefined`，见 payloadSchema 里的说明。
 */
const daysRange = () => optional(int({ min: 1, max: 3650 }))
const rowLimit = () => optional(int({ min: 1, max: 1000 }))

export function registerStatsIpc(): void {
  ipcMain.handle('stats:getOverview', () => {
    return getOverviewStats()
  })

  ipcMain.handle('stats:getDailyActive', [daysRange()], (_event, days) => {
    return getDailyActiveStats(days)
  })

  ipcMain.handle('stats:getVisitedTrend', [daysRange()], (_event, days) => {
    return getVisitedTrend(days)
  })

  ipcMain.handle('stats:getAcTrend', [daysRange()], (_event, days) => {
    return getAcTrend(days)
  })

  ipcMain.handle('stats:getSubmissionTrend', [daysRange()], (_event, days) => {
    return getSubmissionTrend(days)
  })

  ipcMain.handle('stats:getPlatformDistribution', () => {
    return getPlatformDistribution()
  })

  ipcMain.handle('stats:getProblemVisitStats', [text()], (_event, problemId) => {
    return getProblemVisitStats(problemId)
  })

  ipcMain.handle('stats:getTimeline', [rowLimit()], (_event, limit) => {
    return getTimeline(limit)
  })

  ipcMain.handle('stats:getLastActiveTime', () => {
    return getLastActiveTime()
  })

  ipcMain.handle('stats:getRevisitStats', [rowLimit()], (_event, limit) => {
    return getRevisitStats(limit)
  })

  ipcMain.handle('stats:recomputeDaily', [optional(localDate)], (_event, date) => {
    recomputeDailyStats(date)
    return true
  })

  ipcMain.handle('stats:getStreakDays', () => {
    return getStreakDays()
  })

  ipcMain.handle('stats:getWrongProblems', [rowLimit()], (_event, limit) => {
    return getWrongProblems(limit)
  })

  ipcMain.handle('stats:getUnreviewed', [daysRange(), rowLimit()], (_event, days, limit) => {
    return getUnreviewedProblems(days, limit)
  })

  ipcMain.handle('stats:recomputeAll', () => {
    return recomputeAllDailyStats()
  })
}
