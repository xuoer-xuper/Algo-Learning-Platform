export interface TrendPoint {
  local_day: string
  count: number
}

export interface DashboardTimelineEvent {
  id?: string | number
  event_type: string
  platform?: string | null
  occurred_at?: string | null
}

export interface DashboardProblemListItem {
  id: string | number
  platform: string
  title?: string | null
  platform_problem_id?: string | null
  canonical_url: string
  wrong_count?: number
  days_since?: number
}

export interface DashboardRevisitItem {
  problem_id: string | number
  platform: string
  title?: string | null
  platform_problem_id?: string | null
  canonical_url: string
  visit_count: number
}

export interface ReviewRecommendation {
  problem_id: string
  platform: string
  title: string | null
  platform_problem_id: string
  canonical_url: string
  reason: string
  source: {
    wrong_count: number
    days_since_attempt: number
    visit_count: number
  }
}

export interface WeaknessItem {
  tag: string
  ac_rate: number
  evidence: string
  weakness_score: number
}

export interface CodeforcesAccount {
  id: string
  current_rating?: number | null
  peak_rating?: number | null
}

export interface RatingHistoryItem {
  contest_name: string
  delta: number
  rating_after: number
}

export interface DashboardCoreData {
  stats: OverviewStats
  streak: {
    current: number
    longest: number
  }
  wrongProblems: DashboardProblemListItem[]
  unreviewed: DashboardProblemListItem[]
  timeline: DashboardTimelineEvent[]
  revisits: DashboardRevisitItem[]
  cfAccount: CodeforcesAccount | null
}

export interface DashboardTrendData {
  visitedTrend: TrendPoint[]
  acTrend: TrendPoint[]
}

export interface DashboardAiSuggestionData {
  recommendations: ReviewRecommendation[]
  weaknesses: WeaknessItem[]
  weaknessNote: string
}

export interface PlatformDistributionItem {
  platform: string
  count: number
}
