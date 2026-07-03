export interface HomeOverviewStats {
  totalProblems: number
  todayVisited: number
  platformDistribution: { platform: string; count: number }[]
  lastActiveTime: string | null
}

export interface HomeProblemRecord {
  id: string
  platform: string
  platform_problem_id: string
  canonical_url: string
  title: string | null
  status: string
  last_visited_at: string | null
}

export interface HomeRecommendation {
  problem_id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  reason: string
  source: {
    wrong_count: number
    last_attempt: string
    days_since_attempt: number
    visit_count: number
  }
}
