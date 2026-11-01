import type { ReviewRecommendation } from '@shared/types/ai'
import type { OverviewStats } from '@shared/types/stats'
import type { HomeProblemRecord } from './homeTypes'

export function loadHomeOverviewStats(): Promise<OverviewStats> {
  return window.api.stats.getOverview()
}

export function loadHomeRecentProblems(limit = 8): Promise<HomeProblemRecord[]> {
  return window.api.problem.listRecent({ limit })
}

export function loadHomeShortcuts(): Promise<string[]> {
  return window.api.config.getHomeShortcuts()
}

export async function loadHomeRecommendations(limit = 5): Promise<ReviewRecommendation[]> {
  const result = await window.api.ai.getReviewRecommendations(limit)
  return result?.recommendations ?? []
}

export function subscribeHomeProblemsUpdated(callback: () => void): () => void {
  return window.api.problem.onUpdated(callback)
}
