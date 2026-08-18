import { useState, useEffect } from 'react'
import {
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  PLATFORM_NAMES,
  PLATFORM_URLS,
  STATUS_COLORS,
  STATUS_LABELS,
} from '../../shared/display'
import {
  loadHomeOverviewStats,
  loadHomeRecentProblems,
  loadHomeRecommendations,
  subscribeHomeProblemsUpdated,
} from './homeApi'
import type { HomeOverviewStats, HomeProblemRecord, HomeRecommendation } from './homeTypes'
import { Card } from '../../components/ui'

interface Props {
  onNavigate: (url: string) => void
}

export function HomePage({ onNavigate }: Props) {
  const [stats, setStats] = useState<HomeOverviewStats | null>(null)
  const [recent, setRecent] = useState<HomeProblemRecord[]>([])
  const [recommendations, setRecommendations] = useState<HomeRecommendation[]>([])

  useEffect(() => {
    loadHomeOverviewStats().then(setStats)
    loadHomeRecentProblems(8).then(setRecent)
    // 复习建议：失败时降级为空列表，不阻塞首页
    loadHomeRecommendations(5).then(setRecommendations).catch(() => setRecommendations([]))
    const unsubscribe = subscribeHomeProblemsUpdated(() => {
      loadHomeOverviewStats().then(setStats)
      loadHomeRecentProblems(8).then(setRecent)
      loadHomeRecommendations(5).then(setRecommendations).catch(() => {})
    })
    return unsubscribe
  }, [])

  return (
    <div className="home-page">
      <div className="home-header">
        {/* 品牌名降级为等宽小字肩标，主标题让位给一句克制的产品语 */}
        <div className="home-kicker num">Algo Learning Platform</div>
        <h1 className="home-title">今天刷点什么？</h1>
        <p className="home-subtitle">本地优先的算法学习记录平台，数据只存在你自己的磁盘上</p>
      </div>

      <div className="home-section">
        <h2 className="home-section-title">快捷入口</h2>
        <div className="home-sites">
          {Object.entries(PLATFORM_URLS).map(([key, url]) => (
            <button
              key={key}
              className="home-site-btn"
              onClick={() => onNavigate(url)}
            >
              {/* 平台色圆点必须与等宽短标签成对出现（display.ts 约定） */}
              <span className="home-site-head">
                <span className="home-site-dot" style={{ backgroundColor: PLATFORM_COLORS[key] }} />
                <span className="home-site-label num">{PLATFORM_LABELS[key] || key}</span>
              </span>
              <span className="home-site-name">{PLATFORM_NAMES[key]}</span>
              <span className="home-site-url num">{url.replace('https://', '').replace(/\/$/, '')}</span>
            </button>
          ))}
        </div>
      </div>

      {stats && stats.totalProblems === 0 && (
        <div className="home-empty">
          <p className="home-empty-title">还没有学习记录</p>
          <p className="home-empty-hint">从上方快捷入口打开一个站点，浏览过的题目会自动记录在这里</p>
        </div>
      )}

      {stats && stats.totalProblems > 0 && (
        <div className="home-section">
          <h2 className="home-section-title">学习概览</h2>
          <div className="home-stats">
            <Card padded={false} className="home-stat-card">
              <div className="home-stat-value num">{stats.totalProblems}</div>
              <div className="home-stat-label">总题数</div>
            </Card>
            <Card padded={false} className="home-stat-card">
              <div className="home-stat-value num">{stats.todayVisited}</div>
              <div className="home-stat-label">今日访问</div>
            </Card>
            {stats.platformDistribution.map(p => (
              <Card key={p.platform} padded={false} className="home-stat-card">
                <div className="home-stat-value num">{p.count}</div>
                <div className="home-stat-label">
                  <span className="home-stat-dot" style={{ backgroundColor: PLATFORM_COLORS[p.platform] }} />
                  <span className="num">{PLATFORM_LABELS[p.platform] || p.platform}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="home-section">
          <h2 className="home-section-title">今日复习建议</h2>
          <div className="home-recommendations">
            {recommendations.map((r) => (
              <div
                key={r.problem_id}
                className="home-rec-item"
                onClick={() => onNavigate(r.canonical_url)}
              >
                <span className="home-rec-dot" style={{ backgroundColor: PLATFORM_COLORS[r.platform] }} />
                <span className="home-rec-platform num">{PLATFORM_LABELS[r.platform] || r.platform}</span>
                <span className="home-rec-title">{r.title || r.platform_problem_id}</span>
                <span className="home-rec-evidence">
                  <span className="num">{r.source.wrong_count}</span> 次错误 · <span className="num">{r.source.days_since_attempt}</span> 天未复习
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="home-section">
          <h2 className="home-section-title">最近访问</h2>
          <div className="home-recent">
            {recent.map(p => (
              <div
                key={p.id}
                className="home-recent-item"
                onClick={() => onNavigate(p.canonical_url)}
              >
                <span
                  className="home-recent-dot"
                  style={{ backgroundColor: STATUS_COLORS[p.status] || STATUS_COLORS.unknown }}
                />
                <span className="home-recent-platform num">
                  {PLATFORM_LABELS[p.platform] || p.platform}
                </span>
                <span className="home-recent-title">
                  {p.title || p.platform_problem_id}
                </span>
                {/* 状态色圆点与文字成对出现（display.ts 约定） */}
                <span
                  className="home-recent-status"
                  style={{ color: STATUS_COLORS[p.status] || STATUS_COLORS.unknown }}
                >
                  {STATUS_LABELS[p.status] || p.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
