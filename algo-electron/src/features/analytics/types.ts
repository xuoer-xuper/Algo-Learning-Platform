import type { ReviewRecommendation } from '@shared/types/ai'
import type { PlatformAccount } from '@shared/types/rating'
import type { OverviewStats, TrendPoint } from '@shared/types/stats'

/*
 * Dashboard 的视图模型。收口前本文件手抄了 TrendPoint / ReviewRecommendation /
 * CodeforcesAccount 三份副本（阶段 2 R2 删除：前两个直接用 shared 类型，
 * 账户视图统一为 rating 域的 PlatformAccount）。
 */

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

export interface WeaknessItem {
  tag: string
  ac_rate: number
  evidence: string
  weakness_score: number
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
  cfAccount: PlatformAccount | null
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
