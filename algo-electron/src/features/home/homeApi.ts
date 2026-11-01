import type { ReviewRecommendation } from '@shared/types/ai'
import type { OverviewStats } from '@shared/types/stats'
import type { HomeProblemRecord } from './homeTypes'

export function loadHomeOverviewStats(): Promise<OverviewStats> {
  return window.electronAPI.getOverviewStats()
}

export function loadHomeRecentProblems(limit = 8): Promise<HomeProblemRecord[]> {
  return window.electronAPI.listRecentProblems(limit)
}

export function loadHomeShortcuts(): Promise<string[]> {
  return window.electronAPI.getHomeShortcuts()
}

export async function loadHomeRecommendations(limit = 5): Promise<ReviewRecommendation[]> {
  const result = await window.electronAPI.getReviewRecommendations(limit)
  return result?.recommendations ?? []
}

export function subscribeHomeProblemsUpdated(callback: () => void): () => void {
  return window.electronAPI.onProblemsUpdated(callback)
}
