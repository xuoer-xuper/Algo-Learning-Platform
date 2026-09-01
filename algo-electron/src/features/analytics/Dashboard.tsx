import { useState, useCallback, useEffect } from 'react'
import { Button, Card, IconButton, Skeleton } from '../../components/ui'
import { AiSuggestionsPanel } from './AiSuggestionsPanel'
import {
  loadDashboardAiSuggestions,
  loadDashboardCoreData,
  loadDashboardTrends,
  loadRatingHistory,
  recomputeDashboardDailyStats,
} from './analyticsApi'
import { reportRendererError } from '../../rendererErrors'
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
  // 四个列表 null = 还没读到，[] = 读到了且为空。见 DashboardListsPanel 头部说明。
  const [wrongProblems, setWrongProblems] = useState<DashboardProblemListItem[] | null>(null)
  const [unreviewed, setUnreviewed] = useState<DashboardProblemListItem[] | null>(null)
  const [timeline, setTimeline] = useState<DashboardTimelineEvent[] | null>(null)
  const [revisits, setRevisits] = useState<DashboardRevisitItem[] | null>(null)
  const [visitedTrend, setVisitedTrend] = useState<TrendPoint[]>([])
  const [acTrend, setAcTrend] = useState<TrendPoint[]>([])
  const [ratingHistory, setRatingHistory] = useState<RatingHistoryItem[]>([])
  const [cfAccount, setCfAccount] = useState<CodeforcesAccount | null>(null)
  const [recomputing, setRecomputing] = useState(false)
  const [trendRange, setTrendRange] = useState<number | undefined>(30)
  const [recommendations, setRecommendations] = useState<ReviewRecommendation[]>([])
  const [weaknesses, setWeaknesses] = useState<WeaknessItem[]>([])
  const [weaknessNote, setWeaknessNote] = useState('')

  // 读失败在这里兜底而不是在 effect 里，重算路径复用同一处理。
  const loadTrends = useCallback(async () => {
    try {
      const trends = await loadDashboardTrends(trendRange)
      setVisitedTrend(trends.visitedTrend)
      setAcTrend(trends.acTrend)
    } catch (error: unknown) {
      reportRendererError('统计趋势读取', error)
    }
  }, [trendRange])

  const loadAll = useCallback(async () => {
    try {
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
    } catch (error: unknown) {
      /*
       * 失败必须把四个列表从 null 落到 []，否则骨架屏会一直脉冲下去，
       * 看起来像"永远在加载"。错误本身仍然经 reportRendererError 上报，
       * 用户看到的是空态而不是假的加载态。
       */
      setWrongProblems((prev) => prev ?? [])
      setUnreviewed((prev) => prev ?? [])
      setTimeline((prev) => prev ?? [])
      setRevisits((prev) => prev ?? [])
      reportRendererError('学习统计读取', error)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => { void loadTrends() }, [loadTrends])

  const handleRecompute = async () => {
    setRecomputing(true)
    try {
      await recomputeDashboardDailyStats()
      await loadAll()
    } catch (error: unknown) {
      reportRendererError('统计重算', error)
    } finally {
      // 无论成功失败都要复位，否则「重算」按钮会永久禁用。
      setRecomputing(false)
    }
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h2 className="dashboard-title">学习统计</h2>
        <div className="dashboard-header-actions">
          <Button className="dashboard-recompute-btn" size="sm" icon="refresh" onClick={handleRecompute} disabled={recomputing}>
            {recomputing ? '重算中...' : '重算'}
          </Button>
          <IconButton className="dashboard-close" icon="close" title="关闭" onClick={onClose} />
        </div>
      </div>

      {/*
        概览卡片（数据声线：大数字等宽 + 表格数字）。
        `stats === null` 时四张卡都出骨架而不是 0：`?? 0` 会把"还没读到"渲染成
        "总题数 0"，那是一个看起来很确定的假数字，随后又跳到真值。streak 与 stats
        来自同一次 loadDashboardCoreData，所以共用这一个判定。
      */}
      <div className="dashboard-cards">
        <Card padded={false} className="dashboard-card">
          <div className="dashboard-card-value num">
            {stats === null ? <Skeleton inline label="总题数加载中" /> : stats.totalProblems}
          </div>
          <div className="dashboard-card-label">总题数</div>
        </Card>
        <Card padded={false} className="dashboard-card">
          <div className="dashboard-card-value num">
            {stats === null ? <Skeleton inline label="今日访问加载中" /> : stats.todayVisited}
          </div>
          <div className="dashboard-card-label">今日访问</div>
        </Card>
        <Card padded={false} className="dashboard-card">
          <div className="dashboard-card-value num">
            {stats === null
              ? <Skeleton inline label="连续活跃加载中" />
              : <>{streak.current}<span className="dashboard-card-unit">天</span></>}
          </div>
          <div className="dashboard-card-label">连续活跃</div>
        </Card>
        <Card padded={false} className="dashboard-card">
          <div className="dashboard-card-value num">
            {stats === null
              ? <Skeleton inline label="最长连续加载中" />
              : <>{streak.longest}<span className="dashboard-card-unit">天</span></>}
          </div>
          <div className="dashboard-card-label">最长连续</div>
        </Card>
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
          最近活跃：<span className="num">{typeof stats.lastActiveTime === 'string' ? stats.lastActiveTime.replace('T', ' ').slice(0, 19) : ''}</span>
        </div>
      )}
    </div>
  )
}
