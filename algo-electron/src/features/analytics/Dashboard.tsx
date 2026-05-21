import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts'

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

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']

export function Dashboard({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [streak, setStreak] = useState<Streak>({ current: 0, longest: 0 })
  const [wrongProblems, setWrongProblems] = useState<any[]>([])
  const [unreviewed, setUnreviewed] = useState<any[]>([])
  const [timeline, setTimeline] = useState<any[]>([])
  const [revisits, setRevisits] = useState<any[]>([])
  const [visitedTrend, setVisitedTrend] = useState<any[]>([])
  const [acTrend, setAcTrend] = useState<any[]>([])
  const [recomputing, setRecomputing] = useState(false)

  useEffect(() => {
    window.electronAPI.hideBrowserView()
    loadAll()
    return () => { window.electronAPI.showBrowserView() }
  }, [])

  const loadAll = async () => {
    const [s, st, wp, ur, tl, rv, vt, at] = await Promise.all([
      window.electronAPI.getOverviewStats(),
      window.electronAPI.getStreakDays(),
      window.electronAPI.getWrongProblems(10),
      window.electronAPI.getUnreviewedProblems(30, 10),
      window.electronAPI.getTimeline(20),
      window.electronAPI.getRevisitStats(10),
      window.electronAPI.getVisitedTrend(14),
      window.electronAPI.getAcTrend(14),
    ])
    setStats(s)
    setStreak(st)
    setWrongProblems(wp)
    setUnreviewed(ur)
    setTimeline(tl)
    setRevisits(rv)
    setVisitedTrend(vt.reverse())
    setAcTrend(at.reverse())
  }

  const handleRecompute = async () => {
    setRecomputing(true)
    await window.electronAPI.recomputeAllDailyStats()
    await loadAll()
    setRecomputing(false)
  }

  const platformData = stats?.platformDistribution?.map((p, i) => ({
    name: PLATFORM_NAMES[p.platform] || p.platform,
    value: p.count,
    color: COLORS[i % COLORS.length],
  })) ?? []

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

      {/* 图表区域 */}
      <div className="dashboard-charts">
        {/* 平台分布 */}
        {platformData.length > 0 && (
          <div className="dashboard-chart-section">
            <h3 className="dashboard-section-title">平台分布</h3>
            <div className="dashboard-chart-row">
              <div className="dashboard-chart-pie">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={platformData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name} ${value}`}>
                      {platformData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="dashboard-chart-bar">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={platformData}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* 趋势图 */}
        {visitedTrend.length > 0 && (
          <div className="dashboard-chart-section">
            <h3 className="dashboard-section-title">最近 14 天趋势</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={visitedTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="local_day" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="访问题数" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {acTrend.length > 0 && (
          <div className="dashboard-chart-section">
            <h3 className="dashboard-section-title">AC 趋势</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={acTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="local_day" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="AC 题数" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 列表区域 */}
      <div className="dashboard-lists">
        {/* 学习轨迹 */}
        {timeline.length > 0 && (
          <div className="dashboard-list-section">
            <h3 className="dashboard-section-title">学习轨迹</h3>
            <div className="dashboard-timeline">
              {timeline.map((e: any, i: number) => (
                <div key={e.id || i} className="dashboard-timeline-item">
                  <div className="dashboard-timeline-dot" />
                  <div className="dashboard-timeline-content">
                    <span className="dashboard-timeline-type">{e.event_type}</span>
                    {e.platform && <span className="dashboard-timeline-platform">{e.platform}</span>}
                    <span className="dashboard-timeline-time">{e.occurred_at?.replace('T', ' ').slice(0, 19)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 错题 */}
        {wrongProblems.length > 0 && (
          <div className="dashboard-list-section">
            <h3 className="dashboard-section-title">错题（未 AC）</h3>
            {wrongProblems.map((p: any) => (
              <div key={p.id} className="dashboard-list-item">
                <span className="dashboard-list-platform">{PLATFORM_NAMES[p.platform] || p.platform}</span>
                <span className="dashboard-list-title">{p.title || p.platform_problem_id}</span>
                <span className="dashboard-list-count">{p.wrong_count} 次</span>
              </div>
            ))}
          </div>
        )}

        {/* 未复习 */}
        {unreviewed.length > 0 && (
          <div className="dashboard-list-section">
            <h3 className="dashboard-section-title">30 天未复习</h3>
            {unreviewed.map((p: any) => (
              <div key={p.id} className="dashboard-list-item">
                <span className="dashboard-list-platform">{PLATFORM_NAMES[p.platform] || p.platform}</span>
                <span className="dashboard-list-title">{p.title || p.platform_problem_id}</span>
                <span className="dashboard-list-count">{p.days_since} 天前</span>
              </div>
            ))}
          </div>
        )}

        {/* 复访最多 */}
        {revisits.length > 0 && (
          <div className="dashboard-list-section">
            <h3 className="dashboard-section-title">复访最多</h3>
            {revisits.map((p: any) => (
              <div key={p.problem_id} className="dashboard-list-item">
                <span className="dashboard-list-platform">{PLATFORM_NAMES[p.platform] || p.platform}</span>
                <span className="dashboard-list-title">{p.title || p.platform_problem_id}</span>
                <span className="dashboard-list-count">{p.visit_count} 次</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 最近活跃 */}
      {stats?.lastActiveTime && (
        <div className="dashboard-footer">
          最近活跃：{stats.lastActiveTime.replace('T', ' ').slice(0, 19)}
        </div>
      )}
    </div>
  )
}
