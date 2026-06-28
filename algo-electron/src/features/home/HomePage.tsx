import { useState, useEffect } from 'react'

interface OverviewStats {
  totalProblems: number
  todayVisited: number
  platformDistribution: { platform: string; count: number }[]
  lastActiveTime: string | null
}

interface ProblemRecord {
  id: string
  platform: string
  platform_problem_id: string
  canonical_url: string
  title: string | null
  status: string
  last_visited_at: string | null
}

interface Recommendation {
  problem_id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  reason: string
  source: {
    wrong_count: number
    last_attempt: string
    days_since_attempt: number
    visit_count: number
  }
}

const PLATFORM_NAMES: Record<string, string> = {
  codeforces: 'Codeforces',
  acwing: 'AcWing',
  nowcoder: '牛客',
  vjudge: 'VJudge',
  pta: 'PTA',
  luogu: '洛谷',
}

const PLATFORM_URLS: Record<string, string> = {
  codeforces: 'https://codeforces.com',
  acwing: 'https://www.acwing.com',
  nowcoder: 'https://ac.nowcoder.com',
  vjudge: 'https://vjudge.net',
  pta: 'https://pintia.cn',
  luogu: 'https://www.luogu.com.cn',
}

const PLATFORM_COLORS: Record<string, string> = {
  codeforces: '#1da1f2',
  acwing: '#00a0e9',
  nowcoder: '#ff6a00',
  vjudge: '#4caf50',
  pta: '#8e24aa',
  luogu: '#3498db',
}

const STATUS_COLORS: Record<string, string> = {
  solved: '#a6e3a1',
  attempted: '#f9e2af',
  visited: '#89b4fa',
  unknown: '#585b70',
}

interface Props {
  onNavigate: (url: string) => void
}

export function HomePage({ onNavigate }: Props) {
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [recent, setRecent] = useState<ProblemRecord[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])

  useEffect(() => {
    window.electronAPI.getOverviewStats().then(setStats)
    window.electronAPI.listRecentProblems(8).then(setRecent)
    // 复习建议：失败时降级为空列表，不阻塞首页
    window.electronAPI.getReviewRecommendations(5).then((res: any) => {
      setRecommendations(res?.recommendations ?? [])
    }).catch(() => setRecommendations([]))
    const unsubscribe = window.electronAPI.onProblemsUpdated(() => {
      window.electronAPI.getOverviewStats().then(setStats)
      window.electronAPI.listRecentProblems(8).then(setRecent)
      window.electronAPI.getReviewRecommendations(5).then((res: any) => {
        setRecommendations(res?.recommendations ?? [])
      }).catch(() => {})
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
