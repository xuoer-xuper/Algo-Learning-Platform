import { ipcMain } from './trustedSender'
import {
  getAcTrendInput,
  getDailyActiveInput,
  getProblemVisitStatsInput,
  getRevisitStatsInput,
  getSubmissionTrendInput,
  getTimelineInput,
  getUnreviewedInput,
  getVisitedTrendInput,
  getWrongProblemsInput,
  recomputeDailyInput,
} from '../../src/shared/types/ipc/stats'
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
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/stats.ts`；
 * `days` 3650 / `limit` 1000 两个界的理由写在那里，不在每个 channel 重复。
 */
export function registerStatsIpc(): void {
  ipcMain.handle('stats:getOverview', () => {
    return getOverviewStats()
  })

  ipcMain.handle('stats:getDailyActive', getDailyActiveInput, (_event, days) => {
    return getDailyActiveStats(days)
  })

  ipcMain.handle('stats:getVisitedTrend', getVisitedTrendInput, (_event, days) => {
    return getVisitedTrend(days)
  })

  ipcMain.handle('stats:getAcTrend', getAcTrendInput, (_event, days) => {
    return getAcTrend(days)
  })

  ipcMain.handle('stats:getSubmissionTrend', getSubmissionTrendInput, (_event, days) => {
    return getSubmissionTrend(days)
  })

  ipcMain.handle('stats:getPlatformDistribution', () => {
    return getPlatformDistribution()
  })

  ipcMain.handle('stats:getProblemVisitStats', getProblemVisitStatsInput, (_event, problemId) => {
    return getProblemVisitStats(problemId)
  })

  ipcMain.handle('stats:getTimeline', getTimelineInput, (_event, limit) => {
    return getTimeline(limit)
  })

  ipcMain.handle('stats:getLastActiveTime', () => {
    return getLastActiveTime()
  })

  ipcMain.handle('stats:getRevisitStats', getRevisitStatsInput, (_event, limit) => {
    return getRevisitStats(limit)
  })

  ipcMain.handle('stats:recomputeDaily', recomputeDailyInput, (_event, date) => {
    recomputeDailyStats(date)
    return true
  })

  ipcMain.handle('stats:getStreakDays', () => {
    return getStreakDays()
  })

  ipcMain.handle('stats:getWrongProblems', getWrongProblemsInput, (_event, limit) => {
    return getWrongProblems(limit)
  })

  ipcMain.handle('stats:getUnreviewed', getUnreviewedInput, (_event, days, limit) => {
    return getUnreviewedProblems(days, limit)
  })

  ipcMain.handle('stats:recomputeAll', () => {
    return recomputeAllDailyStats()
  })
}
