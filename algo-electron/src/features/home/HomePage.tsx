import { useState, useEffect } from 'react'
import { PLATFORM_COLORS, PLATFORM_NAMES, PLATFORM_URLS, STATUS_COLORS } from '../../shared/display'
import {
  loadHomeOverviewStats,
  loadHomeRecentProblems,
  loadHomeRecommendations,
  subscribeHomeProblemsUpdated,
} from './homeApi'
import type { HomeOverviewStats, HomeProblemRecord, HomeRecommendation } from './homeTypes'

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
        <h1 className="home-title">Algo Learning Platform</h1>
        <p className="home-subtitle">本地优先的算法学习记录平台</p>
      </div>

      <div className="home-section">
        <h2 className="home-section-title">快捷入口</h2>
        <div className="home-sites">
          {Object.entries(PLATFORM_URLS).map(([key, url]) => (
            <button
              key={key}
              className="home-site-btn"
              style={{ borderColor: PLATFORM_COLORS[key] }}
              onClick={() => onNavigate(url)}
            >
              <span className="home-site-name" style={{ color: PLATFORM_COLORS[key] }}>
                {PLATFORM_NAMES[key]}
              </span>
              <span className="home-site-url">{url.replace('https://', '')}</span>
            </button>
          ))}
        </div>
      </div>

      {stats && (
        <div className="home-section">
          <h2 className="home-section-title">学习概览</h2>
          <div className="home-stats">
            <div className="home-stat-card">
              <div className="home-stat-value">{stats.totalProblems}</div>
              <div className="home-stat-label">总题数</div>
            </div>
            <div className="home-stat-card">
              <div className="home-stat-value">{stats.todayVisited}</div>
              <div className="home-stat-label">今日访问</div>
            </div>
            {stats.platformDistribution.map(p => (
              <div key={p.platform} className="home-stat-card">
                <div className="home-stat-value">{p.count}</div>
                <div className="home-stat-label">{PLATFORM_NAMES[p.platform] || p.platform}</div>
              </div>
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
                <div className="home-rec-head">
                  <span className="home-rec-platform" style={{ color: PLATFORM_COLORS[r.platform] || '#585b70' }}>
                    {PLATFORM_NAMES[r.platform] || r.platform}
                  </span>
                  <span className="home-rec-title">{r.title || r.platform_problem_id}</span>
                </div>
                <div className="home-rec-evidence">
                  {r.source.wrong_count} 次错误 · {r.source.days_since_attempt} 天未复习
                </div>
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
                <span className="home-recent-platform">
                  {PLATFORM_NAMES[p.platform] || p.platform}
                </span>
                <span className="home-recent-title">
                  {p.title || p.platform_problem_id}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
