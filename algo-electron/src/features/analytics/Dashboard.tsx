import { useState, useEffect } from 'react'
import { AiSuggestionsPanel } from './AiSuggestionsPanel'
import {
  DashboardListsPanel,
  type DashboardProblemListItem,
  type DashboardRevisitItem,
  type DashboardTimelineEvent,
} from './DashboardListsPanel'
import { PlatformDistributionPanel } from './PlatformDistributionPanel'
import { RatingPanel } from './RatingPanel'
import { TrendPanel } from './TrendPanel'

function fillMissingDays(data: { local_day: string; count: number }[], days: number): { local_day: string; count: number }[] {
  const map = new Map(data.map(d => [d.local_day, d.count]))
  const result: { local_day: string; count: number }[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    // 使用本地日期（与数据库 local_day 由 todayBeijing 生成的方式一致），
    // 不能用 toISOString() 否则 UTC+8 凌晨会偏移到前一天
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    result.push({ local_day: key, count: map.get(key) ?? 0 })
  }
  return result
}

export function Dashboard({ onClose, onNavigate }: { onClose: () => void; onNavigate: (url: string) => void }) {
  const [stats, setStats] = useState<any>(null)
  const [streak, setStreak] = useState({ current: 0, longest: 0 })
  const [wrongProblems, setWrongProblems] = useState<DashboardProblemListItem[]>([])
  const [unreviewed, setUnreviewed] = useState<DashboardProblemListItem[]>([])
  const [timeline, setTimeline] = useState<DashboardTimelineEvent[]>([])
  const [revisits, setRevisits] = useState<DashboardRevisitItem[]>([])
  const [visitedTrend, setVisitedTrend] = useState<any[]>([])
  const [acTrend, setAcTrend] = useState<any[]>([])
  const [ratingHistory, setRatingHistory] = useState<any[]>([])
  const [cfAccount, setCfAccount] = useState<any>(null)
  const [recomputing, setRecomputing] = useState(false)
  const [trendRange, setTrendRange] = useState<number | undefined>(30)
  const [recommendations, setRecommendations] = useState<any[]>([])
  const [weaknesses, setWeaknesses] = useState<any[]>([])
  const [weaknessNote, setWeaknessNote] = useState('')

  useEffect(() => {
    window.electronAPI.hideView()
    loadAll()
    return () => { window.electronAPI.showView() }
  }, [])

  useEffect(() => { loadTrends() }, [trendRange])

  const loadTrends = async () => {
    const [vt, at] = await Promise.all([
      window.electronAPI.getVisitedTrend(trendRange),
      window.electronAPI.getAcTrend(trendRange),
    ])
    // 7天/30天补全缺失日期为 0
    setVisitedTrend(trendRange ? fillMissingDays(vt, trendRange) : vt)
    setAcTrend(trendRange ? fillMissingDays(at, trendRange) : at)
  }

  const loadAll = async () => {
    // 修复：核心统计与 AI 建议分离，AI 模块异常不影响 Dashboard 主功能
    const [s, st, wp, ur, tl, rv, acc] = await Promise.all([
      window.electronAPI.getOverviewStats(),
      window.electronAPI.getStreakDays(),
      window.electronAPI.getWrongProblems(10),
      window.electronAPI.getUnreviewedProblems(30, 10),
      window.electronAPI.getTimeline(20),
      window.electronAPI.getRevisitStats(10),
      window.electronAPI.getCodeforcesAccount(),
    ])
    setStats(s); setStreak(st); setWrongProblems(wp)
    setUnreviewed(ur); setTimeline(tl); setRevisits(rv)
    setCfAccount(acc)

    // AI 建议单独加载，失败时降级为空列表，不阻塞 Dashboard
    try {
      const [rec, weak] = await Promise.all([
        window.electronAPI.getReviewRecommendations(5),
        window.electronAPI.getWeaknessAnalysis(8),
      ])
      setRecommendations(rec?.recommendations ?? [])
      setWeaknesses(weak?.weaknesses ?? [])
      setWeaknessNote(weak?.data_note ?? '')
    } catch (err) {
      console.error('[Dashboard] AI 建议加载失败，已降级显示', err)
      setRecommendations([])
      setWeaknesses([])
      setWeaknessNote('AI 建议暂时不可用')
    }

    if (acc) {
      const history = await window.electronAPI.getRatingHistory(acc.id)
      setRatingHistory(history)
    }
    loadTrends()
  }

  const handleRecompute = async () => {
    setRecomputing(true)
    await window.electronAPI.recomputeAllDailyStats()
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
