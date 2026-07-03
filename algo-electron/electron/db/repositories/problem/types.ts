export interface ProblemRow {
  id: string
  platform: string
  platform_problem_id: string
  canonical_url: string
  title: string | null
  status: string
  contest_id: string | null
  problem_index: string | null
  source_platform?: string | null
  source_problem_id?: string | null
  first_seen_at?: string
  last_visited_at?: string
  first_solved_at?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export interface RecentProblem {
  id: string
  platform: string
  platform_problem_id: string
  canonical_url: string
  title: string | null
  last_visited_at: string
  status: string
  submission_count: number
}

export interface ProblemSubmissionRow {
  id: string
  problem_id: string | null
  platform: string
  platform_submission_id: string
  verdict: string
  raw_verdict?: string | null
  language?: string | null
  submitted_at: string
  runtime_ms?: number | null
  memory_kb?: number | null
  source_url?: string | null
  raw_json?: string | null
  created_at?: string
  updated_at?: string
}

export type ProblemDetail = ProblemRow & {
  status: string
  submission_count: number
  ac_count: number
  submissions: ProblemSubmissionRow[]
}

export interface PlatformDistributionRow {
  platform: string
  count: number
}

export interface OverviewStats {
  totalProblems: number
  todayVisited: number
  platformDistribution: PlatformDistributionRow[]
  lastActiveTime: string | null
}
