import { formatForDisplay } from '@shared/time'
import { useState } from 'react'
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
import { useIpcQuery } from '../../hooks/useIpcQuery'
import { useIpcQueryError } from '../../hooks/useIpcQueryError'

export function Dashboard({
  onClose,
  onNavigate,
}: {
  onClose: () => void
  onNavigate: (url: string) => void
}) {
  const [recomputing, setRecomputing] = useState(false)
  const [trendRange, setTrendRange] = useState<number | undefined>(30)
  const core = useIpcQuery(loadDashboardCoreData, [], {
    tables: ['problems', 'submissions', 'stats'],
  })
  const rating = useIpcQuery(
    () => loadRatingHistory(core.data?.cfAccount ?? null),
    [core.data?.cfAccount?.id],
    { tables: ['stats'], enabled: core.data !== undefined },
  )
  const ai = useIpcQuery(loadDashboardAiSuggestions, [], {
    tables: ['problems', 'submissions', 'stats'],
  })
  const trends = useIpcQuery(() => loadDashboardTrends(trendRange), [trendRange], {
    tables: ['problems', 'submissions', 'stats'],
  })
  useIpcQueryError(core.error, '学习统计读取')
  useIpcQueryError(rating.error, 'Rating 历史读取')
  useIpcQueryError(ai.error, '学习建议读取')
  useIpcQueryError(trends.error, '统计趋势读取')
  const stats = core.data?.stats
  const streak = core.data?.streak ?? { current: 0, longest: 0 }
  const wrongProblems = core.isLoading ? null : (core.data?.wrongProblems ?? [])
  const unreviewed = core.isLoading ? null : (core.data?.unreviewed ?? [])
  const timeline = core.isLoading ? null : (core.data?.timeline ?? [])
  const revisits = core.isLoading ? null : (core.data?.revisits ?? [])
  const cfAccount = core.data?.cfAccount ?? null
  const ratingHistory = rating.data ?? []
  const visitedTrend = trends.data?.visitedTrend ?? []
  const acTrend = trends.data?.acTrend ?? []
  const recommendations = ai.data?.recommendations ?? []
  const weaknesses = ai.data?.weaknesses ?? []
  const weaknessNote = ai.data?.weaknessNote ?? ''

  const handleRecompute = async () => {
    setRecomputing(true)
    try {
      await recomputeDashboardDailyStats()
      await Promise.all([core.refetch(), ai.refetch(), trends.refetch(), rating.refetch()])
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
          <Button
            className="dashboard-recompute-btn"
            size="sm"
            icon="refresh"
            onClick={handleRecompute}
            disabled={recomputing}
          >
            {recomputing ? '重算中...' : '重算'}
          </Button>
          <IconButton className="dashboard-close" icon="close" title="关闭" onClick={onClose} />
        </div>
      </div>

      {/*
        概览卡片（数据声线：大数字等宽 + 表格数字）。
        `core.isLoading` 时四张卡都出骨架而不是 0：`?? 0` 会把"还没读到"渲染成
        "总题数 0"，那是一个看起来很确定的假数字，随后又跳到真值。streak 与 stats
        来自同一次 loadDashboardCoreData，所以共用这一个判定。
      */}
      <div className="dashboard-cards">
        <Card padded={false} className="dashboard-card">
          <div className="dashboard-card-value num">
            {core.isLoading ? (
              <Skeleton inline label="总题数加载中" />
            ) : (
              (stats?.totalProblems ?? 0)
            )}
          </div>
          <div className="dashboard-card-label">总题数</div>
        </Card>
        <Card padded={false} className="dashboard-card">
          <div className="dashboard-card-value num">
            {core.isLoading ? (
              <Skeleton inline label="今日访问加载中" />
            ) : (
              (stats?.todayVisited ?? 0)
            )}
          </div>
          <div className="dashboard-card-label">今日访问</div>
        </Card>
        <Card padded={false} className="dashboard-card">
          <div className="dashboard-card-value num">
            {core.isLoading ? (
              <Skeleton inline label="连续活跃加载中" />
            ) : (
              <>
                {streak.current}
                <span className="dashboard-card-unit">天</span>
              </>
            )}
          </div>
          <div className="dashboard-card-label">连续活跃</div>
        </Card>
        <Card padded={false} className="dashboard-card">
          <div className="dashboard-card-value num">
            {core.isLoading ? (
              <Skeleton inline label="最长连续加载中" />
            ) : (
              <>
                {streak.longest}
                <span className="dashboard-card-unit">天</span>
              </>
            )}
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

      {stats?.lastActiveTime != null && (
        <div className="dashboard-footer">
          最近活跃：
          <span className="num">{formatForDisplay(stats.lastActiveTime)}</span>
        </div>
      )}
    </div>
  )
}
