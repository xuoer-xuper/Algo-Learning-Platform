export interface AIContextExport {
  schema_version: number
  exported_at: string
  overview: {
    total_problems: number
    solved_problems: number
    attempted_problems: number
    visited_problems: number
    total_submissions: number
    ac_submissions: number
    platforms: { platform: string; count: number }[]
    streak: { current: number; longest: number }
  }
  trends: {
    daily_stats: {
      local_day: string
      active_seconds: number
      duration_seconds: number
      visited: number
      solved: number
      submissions: number
      ac: number
    }[]
    platform_distribution: { platform: string; count: number }[]
  }
  wrong_problems: {
    platform: string
    platform_problem_id: string
    title: string | null
    wrong_count: number
    last_attempt: string
  }[]
  unreviewed_problems: {
    platform: string
    platform_problem_id: string
    title: string | null
    last_visited_at: string
    days_since: number
  }[]
  tag_stats: ContextTagStat[]
  recent_activity: {
    event_type: string
    occurred_at: string
    platform: string | null
  }[]
}

export interface ContextTagStat {
  tag: string
  total: number
  solved: number
  attempted: number
  ac_rate: number
}

export interface ContextTagAggregate {
  total: number
  solved: number
  attempted: number
}
