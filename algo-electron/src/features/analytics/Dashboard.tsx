import { useState, useEffect } from 'react'
import { AiSuggestionsPanel } from './AiSuggestionsPanel'
import {
  loadDashboardAiSuggestions,
  loadDashboardCoreData,
  loadDashboardTrends,
  loadRatingHistory,
  recomputeDashboardDailyStats,
  hideDashboardBrowserView,
  showDashboardBrowserView,
} from './analyticsApi'
import { DashboardListsPanel } from './DashboardListsPanel'
import { PlatformDistributionPanel } from './PlatformDistributionPanel'
import { RatingPanel } from './RatingPanel'
import { TrendPanel } from './TrendPanel'
import type {
  CodeforcesAccount,
  DashboardProblemListItem,
  DashboardRevisitItem,
  DashboardTimelineEvent,
  RatingHistoryItem,
  ReviewRecommendation,
  TrendPoint,
  WeaknessItem,
} from './types'

export function Dashboard({ onClose, onNavigate }: { onClose: () => void; onNavigate: (url: string) => void }) {
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [streak, setStreak] = useState({ current: 0, longest: 0 })
  const [wrongProblems, setWrongProblems] = useState<DashboardProblemListItem[]>([])
  const [unreviewed, setUnreviewed] = useState<DashboardProblemListItem[]>([])
  const [timeline, setTimeline] = useState<DashboardTimelineEvent[]>([])
  const [revisits, setRevisits] = useState<DashboardRevisitItem[]>([])
  const [visitedTrend, setVisitedTrend] = useState<TrendPoint[]>([])
  const [acTrend, setAcTrend] = useState<TrendPoint[]>([])
  const [ratingHistory, setRatingHistory] = useState<RatingHistoryItem[]>([])
  const [cfAccount, setCfAccount] = useState<CodeforcesAccount | null>(null)
  const [recomputing, setRecomputing] = useState(false)
  const [trendRange, setTrendRange] = useState<number | undefined>(30)
  const [recommendations, setRecommendations] = useState<ReviewRecommendation[]>([])
  const [weaknesses, setWeaknesses] = useState<WeaknessItem[]>([])
  const [weaknessNote, setWeaknessNote] = useState('')

  useEffect(() => {
    hideDashboardBrowserView()
    loadAll()
    return () => { showDashboardBrowserView() }
  }, [])

  useEffect(() => { loadTrends() }, [trendRange])

  const loadTrends = async () => {
    const trends = await loadDashboardTrends(trendRange)
    setVisitedTrend(trends.visitedTrend)
    setAcTrend(trends.acTrend)
  }

  const loadAll = async () => {
    const coreData = await loadDashboardCoreData()
    setStats(coreData.stats)
    setStreak(coreData.streak)
    setWrongProblems(coreData.wrongProblems)
    setUnreviewed(coreData.unreviewed)
    setTimeline(coreData.timeline)
    setRevisits(coreData.revisits)
    setCfAccount(coreData.cfAccount)

    const aiSuggestions = await loadDashboardAiSuggestions()
    setRecommendations(aiSuggestions.recommendations)
    setWeaknesses(aiSuggestions.weaknesses)
    setWeaknessNote(aiSuggestions.weaknessNote)

    setRatingHistory(await loadRatingHistory(coreData.cfAccount))
    loadTrends()
  }

  const handleRecompute = async () => {
    setRecomputing(true)
    await recomputeDashboardDailyStats()
    await loadAll()
    setRecomputing(false)
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h2 className="dashboard-title">学习统计</h2>
        <div className="dashboard-header-actions">
          <button className="dashboard-recompute-btn" onClick={handleRecompute} disabled={recomputing}>
            {recomputing ? '重算中...' : '重算'}
          </button>
          <button className="dashboard-close" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="dashboard-cards">
        <div className="dashboard-card">
          <div className="dashboard-card-value">{stats?.totalProblems ?? 0}</div>
          <div className="dashboard-card-label">总题数</div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-value">{stats?.todayVisited ?? 0}</div>
          <div className="dashboard-card-label">今日访问</div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-value">{streak.current}<span className="dashboard-card-unit">天</span></div>
          <div className="dashboard-card-label">连续活跃</div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-value">{streak.longest}<span className="dashboard-card-unit">天</span></div>
          <div className="dashboard-card-label">最长连续</div>
        </div>
      </div>

      <AiSuggestionsPanel
        recommendations={recommendations}
        weaknesses={weaknesses}
        weaknessNote={weaknessNote}
        onNavigate={onNavigate}
      />

      <PlatformDistributionPanel distribution={stats?.platformDistribution ?? []} />

      <TrendPanel
        visitedTrend={visitedTrend}
        acTrend={acTrend}
        trendRange={trendRange}
        onTrendRangeChange={setTrendRange}
      />

      <RatingPanel account={cfAccount} ratingHistory={ratingHistory} />

      <DashboardListsPanel
        timeline={timeline}
        wrongProblems={wrongProblems}
        unreviewed={unreviewed}
        revisits={revisits}
        onNavigate={onNavigate}
      />

      {stats?.lastActiveTime && (
        <div className="dashboard-footer">
          最近活跃：{typeof stats.lastActiveTime === 'string' ? stats.lastActiveTime.replace('T', ' ').slice(0, 19) : ''}
        </div>
      )}
    </div>
  )
}
