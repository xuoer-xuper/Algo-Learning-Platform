import type {
  CodeforcesAccount,
  DashboardAiSuggestionData,
  DashboardCoreData,
  DashboardTrendData,
  RatingHistoryItem,
  TrendPoint,
} from './types'

function fillMissingDays(data: TrendPoint[], days: number): TrendPoint[] {
  const map = new Map(data.map((d) => [d.local_day, d.count]))
  const result: TrendPoint[] = []
  const now = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    // 与数据库 local_day 的本地日期口径保持一致，避免 UTC 序列化导致凌晨跨日。
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    result.push({ local_day: key, count: map.get(key) ?? 0 })
  }

  return result
}

export async function loadDashboardTrends(trendRange: number | undefined): Promise<DashboardTrendData> {
  const [visitedTrend, acTrend] = await Promise.all([
    window.electronAPI.getVisitedTrend(trendRange),
    window.electronAPI.getAcTrend(trendRange),
  ])

  return {
    visitedTrend: trendRange ? fillMissingDays(visitedTrend, trendRange) : visitedTrend,
    acTrend: trendRange ? fillMissingDays(acTrend, trendRange) : acTrend,
  }
}

export async function loadDashboardCoreData(): Promise<DashboardCoreData> {
  const [stats, streak, wrongProblems, unreviewed, timeline, revisits, cfAccount] = await Promise.all([
    window.electronAPI.getOverviewStats(),
    window.electronAPI.getStreakDays(),
    window.electronAPI.getWrongProblems(10),
    window.electronAPI.getUnreviewedProblems(30, 10),
    window.electronAPI.getTimeline(20),
    window.electronAPI.getRevisitStats(10),
    window.electronAPI.getCodeforcesAccount(),
  ])

  return {
    stats,
    streak,
    wrongProblems,
    unreviewed,
    timeline,
    revisits,
    cfAccount,
  }
}

export async function loadDashboardAiSuggestions(): Promise<DashboardAiSuggestionData> {
  try {
    const [recommendations, weaknesses] = await Promise.all([
      window.electronAPI.getReviewRecommendations(5),
      window.electronAPI.getWeaknessAnalysis(8),
    ])

    return {
      recommendations: recommendations?.recommendations ?? [],
      weaknesses: weaknesses?.weaknesses ?? [],
      weaknessNote: weaknesses?.data_note ?? '',
    }
  } catch (err) {
    console.error('[Dashboard] AI 建议加载失败，已降级显示', err)
    return {
      recommendations: [],
      weaknesses: [],
      weaknessNote: 'AI 建议暂时不可用',
    }
  }
}

export async function loadRatingHistory(account: CodeforcesAccount | null): Promise<RatingHistoryItem[]> {
  if (!account) return []
  return window.electronAPI.getRatingHistory(account.id)
}

export function recomputeDashboardDailyStats(): Promise<number> {
  return window.electronAPI.recomputeAllDailyStats()
}

export function hideDashboardBrowserView(): void {
  window.electronAPI.hideView()
}

export function showDashboardBrowserView(): void {
  window.electronAPI.showView()
}
