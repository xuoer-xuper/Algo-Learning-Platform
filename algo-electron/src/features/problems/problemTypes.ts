import type { ProblemDetailRecord } from '@shared/types/problem'
import type { ProblemVisitStats } from '@shared/types/stats'

/**
 * 详情视图 = problem:getDetail 的输出 + loadProblemDetail 并发取回的访问统计。
 * 收口前本文件手抄了 ProblemDetailRecord / SidebarProblemRecord / SubmissionRecord /
 * ProblemVisitStats 四份（阶段 2 R2 删除，单一来源在 @shared/types）。
 */
export type ProblemDetailView = ProblemDetailRecord & {
  visitStats?: ProblemVisitStats
}
