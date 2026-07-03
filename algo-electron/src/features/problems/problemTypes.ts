export interface SidebarProblemRecord {
  id: string
  platform: string
  platform_problem_id: string
  canonical_url: string
  title: string | null
  status: string
  last_visited_at: string | null
  submission_count?: number
}

export interface ProblemVisitStats {
  total_visits: number
  total_duration: number
  total_active: number
  avg_duration: number
}

export interface SubmissionRecord {
  id: string
  verdict: string
  language?: string | null
  submitted_at?: string | null
}

export interface ProblemDetailRecord {
  id: string
  platform: string
  platform_problem_id: string
  canonical_url: string
  title: string | null
  status: string
  submission_count: number
  ac_count: number
  first_seen_at?: string | null
  last_visited_at?: string | null
  submissions?: SubmissionRecord[]
  visitStats?: ProblemVisitStats
}
