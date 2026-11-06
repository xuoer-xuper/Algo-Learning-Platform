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
  generated_at: number
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
