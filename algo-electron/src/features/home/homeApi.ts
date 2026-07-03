import type { HomeOverviewStats, HomeProblemRecord, HomeRecommendation } from './homeTypes'

export function loadHomeOverviewStats(): Promise<HomeOverviewStats> {
  return window.electronAPI.getOverviewStats()
}

export function loadHomeRecentProblems(limit = 8): Promise<HomeProblemRecord[]> {
  return window.electronAPI.listRecentProblems(limit)
}

export async function loadHomeRecommendations(limit = 5): Promise<HomeRecommendation[]> {
  const result = await window.electronAPI.getReviewRecommendations(limit)
  return result?.recommendations ?? []
}

export function subscribeHomeProblemsUpdated(callback: () => void): () => void {
  return window.electronAPI.onProblemsUpdated(callback)
}
