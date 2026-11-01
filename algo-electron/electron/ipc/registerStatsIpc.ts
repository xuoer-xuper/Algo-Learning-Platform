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
import { IPC_CHANNELS } from '../../src/shared/constants/channels'

/*
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/stats.ts`；
 * `days` 3650 / `limit` 1000 两个界的理由写在那里，不在每个 channel 重复。
 */
export function registerStatsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.STATS.GET_OVERVIEW, () => {
    return getOverviewStats()
  })

  ipcMain.handle(IPC_CHANNELS.STATS.GET_DAILY_ACTIVE, getDailyActiveInput, (_event, days) => {
    return getDailyActiveStats(days)
  })

  ipcMain.handle(IPC_CHANNELS.STATS.GET_VISITED_TREND, getVisitedTrendInput, (_event, days) => {
    return getVisitedTrend(days)
  })

  ipcMain.handle(IPC_CHANNELS.STATS.GET_AC_TREND, getAcTrendInput, (_event, days) => {
    return getAcTrend(days)
  })

  ipcMain.handle(
    IPC_CHANNELS.STATS.GET_SUBMISSION_TREND,
    getSubmissionTrendInput,
    (_event, days) => {
      return getSubmissionTrend(days)
    },
  )

  ipcMain.handle(IPC_CHANNELS.STATS.GET_PLATFORM_DISTRIBUTION, () => {
    return getPlatformDistribution()
  })

  ipcMain.handle(
    IPC_CHANNELS.STATS.GET_PROBLEM_VISIT_STATS,
    getProblemVisitStatsInput,
    (_event, problemId) => {
      return getProblemVisitStats(problemId)
    },
  )

  ipcMain.handle(IPC_CHANNELS.STATS.GET_TIMELINE, getTimelineInput, (_event, limit) => {
    return getTimeline(limit)
  })

  ipcMain.handle(IPC_CHANNELS.STATS.GET_LAST_ACTIVE_TIME, () => {
    return getLastActiveTime()
  })

  ipcMain.handle(IPC_CHANNELS.STATS.GET_REVISIT_STATS, getRevisitStatsInput, (_event, limit) => {
    return getRevisitStats(limit)
  })

  ipcMain.handle(IPC_CHANNELS.STATS.RECOMPUTE_DAILY, recomputeDailyInput, (_event, date) => {
    recomputeDailyStats(date)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.STATS.GET_STREAK_DAYS, () => {
    return getStreakDays()
  })

  ipcMain.handle(IPC_CHANNELS.STATS.GET_WRONG_PROBLEMS, getWrongProblemsInput, (_event, limit) => {
    return getWrongProblems(limit)
  })

  ipcMain.handle(IPC_CHANNELS.STATS.GET_UNREVIEWED, getUnreviewedInput, (_event, days, limit) => {
    return getUnreviewedProblems(days, limit)
  })

  ipcMain.handle(IPC_CHANNELS.STATS.RECOMPUTE_ALL, () => {
    return recomputeAllDailyStats()
  })
}
