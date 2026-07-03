export interface SubmissionRow {
  id: string
  problem_id: string | null
  platform: string
  platform_submission_id: string
  verdict: string
  raw_verdict: string | null
  language: string | null
  submitted_at: string
  runtime_ms: number | null
  memory_kb: number | null
  source_url: string | null
  raw_json: string | null
  created_at: string
  updated_at: string
}

export interface FirstAcRow {
  submitted_at: string
}
