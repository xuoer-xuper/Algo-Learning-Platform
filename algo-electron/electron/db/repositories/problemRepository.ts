export type { ProblemDetail, ProblemRow, ProblemVisitRow, RecentProblem } from './problem/types'

// 统计聚合与 omnibox 联想项是跨进程类型（阶段 2 R2 收口），单一来源在 shared。
export type { OverviewStats, PlatformDistributionRow } from '../../../src/shared/types/stats'
export type { OmniboxSuggestion } from '../../../src/shared/types/problem'

export { deleteProblem, upsertProblem } from './problem/mutations'

export {
  getProblemDetail,
  getRecentProblems,
  listProblemVisitsByProblem,
  findProblemIdByPlatformKey,
} from './problem/queries'

export { getOmniboxSuggestions, OMNIBOX_SUGGESTION_LIMIT } from './problem/omnibox'

export {
  getLastActiveTime,
  getOverviewStats,
  getPlatformDistribution,
  getProblemCount,
  getTodayVisitedCount,
} from './problem/overview'
