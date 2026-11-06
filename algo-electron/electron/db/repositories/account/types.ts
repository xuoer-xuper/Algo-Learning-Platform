export interface PlatformAccountRow {
  id: string
  platform: string
  handle: string
  display_name: string | null
  current_rating: number | null
  peak_rating: number | null
  last_synced_at: number | null
  raw_json: string | null
  created_at: number
  updated_at: number
}

export interface RatingHistoryInput {
  accountId: string
  platform: string
  contestId: string
  contestName?: string
  rank?: number
  ratingBefore?: number
  ratingAfter?: number
  delta?: number
  contestAt?: number
  rawJson?: string
}

export interface RatingHistoryRow {
  id: string
  account_id: string
  platform: string
  contest_id: string | null
  contest_name: string | null
  rank: number | null
  rating_before: number | null
  rating_after: number | null
  delta: number | null
  contest_at: number | null
  raw_json: string | null
  created_at: number
}
