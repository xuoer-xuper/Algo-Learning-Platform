export type PeriodType = 'weekly' | 'monthly' | 'custom'

export interface PeriodSummaryInput {
  start_date: string
  end_date: string
}

export interface PeriodSummary {
  generated_at: string
  rule_version: number
  period: {
    type: PeriodType
    start_date: string
    end_date: string
    days: number
  }
  study_stats: {
    active_days: number
    total_problems_visited: number
    total_problems_solved: number
    total_submissions: number
    total_ac: number
    avg_daily_minutes: number
    streak: { current: number; longest: number }
  }
  platform_distribution: { platform: string; count: number }[]
  wrong_problems_count: number
  unreviewed_count: number
  weak_tags: string[]
  comparison: {
    prev_start_date: string
    prev_end_date: string
    changes: {
      metric: string
      current: number
      previous: number
      delta: number
      trend: 'up' | 'down' | 'flat'
    }[]
  } | null
  evidence: string
  source_snapshots: { snapshot_date: string; created_at: string }[]
}

export interface AggregatedPeriodStats {
  totalVisited: number
  totalSolved: number
  totalSubmissions: number
  totalAc: number
  activeDays: number
  totalActiveSeconds: number
  avgDailyMinutes: number
  platformDistribution: { platform: string; count: number }[]
  weakTags: string[]
}
