import { useState, useEffect } from 'react'

interface Stats {
  totalProblems: number
  todayVisited: number
  platformDistribution: { platform: string; count: number }[]
  lastActiveTime: string | null
}

interface Streak {
  current: number
  longest: number
}

const PLATFORM_NAMES: Record<string, string> = {
  codeforces: 'Codeforces',
  acwing: 'AcWing',
  nowcoder: '牛客',
  vjudge: 'VJudge',
}

export function Dashboard({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [streak, setStreak] = useState<Streak>({ current: 0, longest: 0 })
  const [wrongProblems, setWrongProblems] = useState<any[]>([])
  const [unreviewed, setUnreviewed] = useState<any[]>([])
  const [recomputing, setRecomputing] = useState(false)

  useEffect(() => {
    window.electronAPI.hideBrowserView()
    loadAll()
    return () => { window.electronAPI.showBrowserView() }
  }, [])

  const loadAll = async () => {
    const [s, st, wp, ur] = await Promise.all([
      window.electronAPI.getOverviewStats(),
      window.electronAPI.getStreakDays(),
      window.electronAPI.getWrongProblems(10),
      window.electronAPI.getUnreviewedProblems(30, 10),
    ])
    setStats(s)
    setStreak(st)
    setWrongProblems(wp)
    setUnreviewed(ur)
  }

  const handleRecompute = async () => {
    setRecomputing(true)
    await window.electronAPI.recomputeAllDailyStats()
    await loadAll()
    setRecomputing(false)
  }

  return (
    <div className="settings-page dashboard">
      <div className="settings-header">
        <h2 className="settings-title">学习统计</h2>
        <button className="settings-close" onClick={onClose}>✕</button>
      </div>

      {/* 概览卡片 */}
      <div className="stats-grid">
        <div className="stats-card">
          <div className="stats-value">{stats?.totalProblems ?? 0}</div>
          <div className="stats-label">总题数</div>
        </div>
        <div className="stats-card">
          <div className="stats-value">{stats?.todayVisited ?? 0}</div>
          <div className="stats-label">今日访问</div>
        </div>
        <div className="stats-card">
          <div className="stats-value">{streak.current}</div>
          <div className="stats-label">连续活跃</div>
        </div>
        <div className="stats-card">
          <div className="stats-value">{streak.longest}</div>
          <div className="stats-label">最长连续</div>
        </div>
      </div>

      {/* 平台分布 */}
      {stats?.platformDistribution && stats.platformDistribution.length > 0 && (
        <div className="settings-section">
          <h3 className="settings-section-title">平台分布</h3>
          <div className="platform-list">
            {stats.platformDistribution.map(p => (
              <div key={p.platform} className="platform-item">
                <span className="platform-name">{PLATFORM_NAMES[p.platform] || p.platform}</span>
                <span className="platform-count">{p.count} 题</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 错题列表 */}
      {wrongProblems.length > 0 && (
        <div className="settings-section">
          <h3 className="settings-section-title">错题（未 AC）</h3>
          <div className="dashboard-list">
            {wrongProblems.map((p: any) => (
              <div key={p.id} className="dashboard-list-item">
                <span className="dashboard-item-platform">{PLATFORM_NAMES[p.platform] || p.platform}</span>
                <span className="dashboard-item-title">{p.title || p.platform_problem_id}</span>
                <span className="dashboard-item-count">{p.wrong_count} 次错误</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 未复习题目 */}
      {unreviewed.length > 0 && (
        <div className="settings-section">
          <h3 className="settings-section-title">30 天未复习</h3>
          <div className="dashboard-list">
            {unreviewed.map((p: any) => (
              <div key={p.id} className="dashboard-list-item">
                <span className="dashboard-item-platform">{PLATFORM_NAMES[p.platform] || p.platform}</span>
                <span className="dashboard-item-title">{p.title || p.platform_problem_id}</span>
                <span className="dashboard-item-count">{p.days_since} 天前</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 最近活跃 */}
      {stats?.lastActiveTime && (
        <div className="settings-section">
          <h3 className="settings-section-title">最近活跃</h3>
          <div className="dashboard-active-time">
            {stats.lastActiveTime.replace('T', ' ').slice(0, 19)}
          </div>
        </div>
      )}

      {/* 重算按钮 */}
      <div className="settings-section">
        <button
          className="settings-save-btn"
          onClick={handleRecompute}
          disabled={recomputing}
        >
          {recomputing ? '重算中...' : '重算统计数据'}
        </button>
      </div>
    </div>
  )
}
