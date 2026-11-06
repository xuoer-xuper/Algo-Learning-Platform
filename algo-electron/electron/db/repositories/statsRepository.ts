export type {
  DailyActiveStat,
  ProblemVisitStat,
  RevisitStat,
  StreakDays,
  UnreviewedProblem,
  WrongProblem,
} from './stats/types'

// 趋势点与时间线事件是跨进程类型（阶段 2 R2 收口），单一来源在 shared。
export type {
  PlatformDistributionRow,
  SubmissionTrendPoint,
  TimelineEvent,
  TrendPoint,
} from '../../../src/shared/types/stats'

export {
  getAcTrend,
  getDailyActiveStats,
  getSubmissionTrend,
  getVisitedTrend,
} from './stats/trends'

export {
  getLastActiveTime,
  getPlatformDistribution,
  getProblemVisitStats,
  getRevisitStats,
  getStreakDays,
  getTimeline,
  getUnreviewedProblems,
  getWrongProblems,
} from './stats/insights'

export {
  recomputeAllDailyStats,
  recomputeDailyStats,
  recomputeDailyStatsForDates,
} from './stats/recompute'
