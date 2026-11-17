export interface DailyActiveStat {
  local_day: string
  active_seconds: number
  duration_seconds: number
  visited: number
  solved: number
  submissions: number
  ac: number
}

export interface ProblemVisitStat {
  total_visits: number
  total_duration: number
  total_active: number
  avg_duration: number
}

export interface RevisitStat {
  problem_id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  visit_count: number
  last_visit: number
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
  last_attempt: number
}

export interface UnreviewedProblem {
  id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  last_visited_at: number
  days_since: number
}
