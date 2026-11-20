import type { problems, problemVisits, submissions } from '../../../../src/main/db/schema'

export type ProblemRow = Omit<
  typeof problems.$inferSelect,
  | 'first_seen_at'
  | 'last_visited_at'
  | 'first_solved_at'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
> & {
  first_seen_at: number
  last_visited_at: number | null
  first_solved_at: number | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export type RecentProblem = Pick<
  ProblemRow,
  | 'id'
  | 'platform'
  | 'platform_problem_id'
  | 'canonical_url'
  | 'title'
  | 'last_visited_at'
  | 'status'
> & {
  submission_count: number
}

export type ProblemSubmissionRow = Omit<
  typeof submissions.$inferSelect,
  'submitted_at' | 'created_at' | 'updated_at' | 'deleted_at'
> & {
  submitted_at: number
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export type ProblemDetail = Omit<ProblemRow, 'id'> & {
  id: string
  submission_count: number
  ac_count: number
  submissions: ProblemSubmissionRow[]
}

/**
 * 单次题目访问记录（problem_visits 表的内存表示）。
 * 阶段 4 时间轴复盘只读取，不新增采集。
 */
export type ProblemVisitRow = Pick<
  typeof problemVisits.$inferSelect,
  | 'id'
  | 'problem_id'
  | 'session_id'
  | 'platform'
  | 'url'
  | 'duration_seconds'
  | 'active_seconds'
  | 'leave_reason'
> & {
  entered_at: number
  left_at: number | null
}
