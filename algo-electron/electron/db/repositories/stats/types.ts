export interface DailyActiveStat {
  local_day: string
  active_seconds: number
  duration_seconds: number
  visited: number
  solved: number
  submissions: number
  ac: number
}

export interface TrendPoint {
  local_day: string
  count: number
}

export interface SubmissionTrendPoint {
  local_day: string
  total: number
  ac: number
}

export interface PlatformDistributionRow {
  platform: string
  count: number
}

export interface ProblemVisitStat {
  total_visits: number
  total_duration: number
  total_active: number
  avg_duration: number
}

export interface TimelineEvent {
  id: string
  event_type: string
  occurred_at: string
  platform: string | null
  url: string | null
  problem_id: string | null
}

export interface RevisitStat {
  problem_id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  visit_count: number
  last_visit: string
}

export interface StreakDays {
  current: number
  longest: number
}

export interface WrongProblem {
  id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  wrong_count: number
  last_attempt: string
}

export interface UnreviewedProblem {
  id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  last_visited_at: string
  days_since: number
}
