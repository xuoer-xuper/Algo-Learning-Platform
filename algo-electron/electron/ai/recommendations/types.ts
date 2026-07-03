export interface ReviewRecommendation {
  problem_id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  reason: string
  score: number
  source: {
    wrong_count: number
    last_attempt: string
    days_since_attempt: number
    visit_count: number
    has_ac: boolean
  }
}

export interface ReviewRecommendationResult {
  generated_at: string
  rule_version: number
  recommendations: ReviewRecommendation[]
}

export interface TagWeakness {
  tag: string
  total: number
  solved: number
  attempted: number
  ac_rate: number
  wrong_submissions: number
  total_duration_seconds: number
  weakness_score: number
  evidence: string
}

export interface WeaknessAnalysisResult {
  generated_at: string
  rule_version: number
  weaknesses: TagWeakness[]
  data_note: string
}

export type ReviewPriority = 1 | 2 | 3

export interface ReviewPlanItem {
  problem_id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  related_tags: string[]
  priority: ReviewPriority
  estimated_minutes: number
  reason: string
  source: {
    wrong_count: number
    days_since_attempt: number
    weakness_tags: string[]
    weakness_scores: number[]
  }
}

export interface ReviewPlan {
  generated_at: string
  rule_version: number
  plan_days: number
  title: string
  items: ReviewPlanItem[]
  weak_tags_summary: { tag: string; ac_rate: number; total: number }[]
  evidence: string
}

export interface TagAggregate {
  total: number
  solved: number
  attempted: number
  wrong_submissions: number
  total_duration_seconds: number
}
