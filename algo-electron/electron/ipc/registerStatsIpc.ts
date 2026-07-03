import { ipcMain } from 'electron'
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

export function registerStatsIpc(): void {
  ipcMain.handle('stats:getOverview', () => {
    return getOverviewStats()
  })

  ipcMain.handle('stats:getDailyActive', (_event, days?: number) => {
    return getDailyActiveStats(days)
  })

  ipcMain.handle('stats:getVisitedTrend', (_event, days?: number) => {
    return getVisitedTrend(days)
  })

  ipcMain.handle('stats:getAcTrend', (_event, days?: number) => {
    return getAcTrend(days)
  })

  ipcMain.handle('stats:getSubmissionTrend', (_event, days?: number) => {
    return getSubmissionTrend(days)
  })

  ipcMain.handle('stats:getPlatformDistribution', () => {
    return getPlatformDistribution()
  })

  ipcMain.handle('stats:getProblemVisitStats', (_event, problemId: string) => {
    return getProblemVisitStats(problemId)
  })

  ipcMain.handle('stats:getTimeline', (_event, limit?: number) => {
    return getTimeline(limit)
  })

  ipcMain.handle('stats:getLastActiveTime', () => {
    return getLastActiveTime()
  })

  ipcMain.handle('stats:getRevisitStats', (_event, limit?: number) => {
    return getRevisitStats(limit)
  })

  ipcMain.handle('stats:recomputeDaily', (_event, date?: string) => {
    recomputeDailyStats(date)
    return true
  })

  ipcMain.handle('stats:getStreakDays', () => {
    return getStreakDays()
  })

  ipcMain.handle('stats:getWrongProblems', (_event, limit?: number) => {
    return getWrongProblems(limit)
  })

  ipcMain.handle('stats:getUnreviewed', (_event, days?: number, limit?: number) => {
    return getUnreviewedProblems(days, limit)
  })

  ipcMain.handle('stats:recomputeAll', () => {
    return recomputeAllDailyStats()
  })
}
