import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts'

const PLATFORM_NAMES: Record<string, string> = {
  codeforces: 'Codeforces', acwing: 'AcWing', nowcoder: '牛客', vjudge: 'VJudge', pta: 'PTA', luogu: '洛谷', 'leetcode-cn': 'LeetCode',
}
const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#3498db']

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
  const [wrongProblems, setWrongProblems] = useState<any[]>([])
  const [unreviewed, setUnreviewed] = useState<any[]>([])
  const [timeline, setTimeline] = useState<any[]>([])
  const [revisits, setRevisits] = useState<any[]>([])
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

  const platformData = stats?.platformDistribution?.map((p: any, i: number) => ({
    name: PLATFORM_NAMES[p.platform] || p.platform, value: p.count, color: COLORS[i % COLORS.length],
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

      {/* AI 学习建议（本地规则引擎） */}
      <div className="ai-suggest-section">
        <div className="ai-suggest-grid">
          <div className="ai-suggest-card">
            <h3 className="ai-suggest-title">复习建议</h3>
            {recommendations.length === 0 ? (
              <div className="dashboard-empty">暂无错题数据</div>
            ) : (
              recommendations.map((r: any) => (
                <div key={r.problem_id} className="ai-rec-item" onClick={() => onNavigate(r.canonical_url)}>
                  <div className="ai-rec-head">
                    <span className="ai-rec-platform">{PLATFORM_NAMES[r.platform] || r.platform}</span>
                    <span className="ai-rec-title">{r.title || r.platform_problem_id}</span>
                  </div>
                  <div className="ai-rec-reason">{r.reason}</div>
                  <div className="ai-rec-evidence">
                    {r.source.wrong_count} 次错误 · {r.source.days_since_attempt} 天前 · 访问 {r.source.visit_count} 次
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="ai-suggest-card">
            <h3 className="ai-suggest-title">薄弱标签</h3>
            {weaknesses.length === 0 ? (
              <div className="dashboard-empty">{weaknessNote || '暂无标签数据'}</div>
            ) : (
              weaknesses.map((w: any) => (
                <div key={w.tag} className="ai-weak-item">
                  <div className="ai-weak-head">
                    <span className="ai-weak-tag">{w.tag}</span>
                    <span className="ai-weak-acrate">{w.ac_rate}% AC</span>
                  </div>
                  <div className="ai-weak-evidence">{w.evidence}</div>
                  <div className="ai-weak-bar">
                    <div className="ai-weak-bar-fill" style={{ width: `${Math.min(w.weakness_score, 100)}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="ai-suggest-note">基于本地统计规则生成，不修改任何题目状态</div>
      </div>

      {/* 平台分布 */}
      {platformData.length > 0 && (
        <div className="dashboard-chart-section">
          <h3 className="dashboard-section-title">平台分布</h3>
          <div className="dashboard-chart-row">
            <div className="dashboard-chart-pie">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <Pie data={platformData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65}
                    label={({ name, value }) => `${name} ${value}`}
                    labelLine={{ strokeWidth: 1 }}>
                    {platformData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
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
      <div className="dashboard-chart-section">
        <div className="dashboard-section-header">
          <h3 className="dashboard-section-title">趋势</h3>
          <div className="dashboard-range-btns">
            <button className={`dashboard-range-btn ${trendRange === 7 ? 'active' : ''}`} onClick={() => setTrendRange(7)}>7天</button>
            <button className={`dashboard-range-btn ${trendRange === 30 ? 'active' : ''}`} onClick={() => setTrendRange(30)}>30天</button>
            <button className={`dashboard-range-btn ${trendRange === undefined ? 'active' : ''}`} onClick={() => setTrendRange(undefined)}>全部</button>
          </div>
        </div>
        {visitedTrend.length > 0 && (
          <>
            <h4 className="dashboard-sub-title">访问题数</h4>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={visitedTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="local_day" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
        {acTrend.length > 0 && (
          <>
            <h4 className="dashboard-sub-title">AC 题数</h4>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={acTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="local_day" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* Rating 趋势 */}
      <div className="dashboard-chart-section">
        <div className="dashboard-section-header">
          <h3 className="dashboard-section-title">Codeforces Rating</h3>
          {cfAccount && (
            <div className="rating-badges">
              <span className="rating-badge rating-current">当前 {cfAccount.current_rating ?? '-'}</span>
              <span className="rating-badge rating-peak">最高 {cfAccount.peak_rating ?? '-'}</span>
            </div>
          )}
        </div>
        {ratingHistory.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={ratingHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="contest_name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="rating_after" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Rating" />
              </LineChart>
            </ResponsiveContainer>
            <div className="dashboard-contest-list">
              {ratingHistory.slice(-10).reverse().map((r: any, i: number) => (
                <div key={i} className="dashboard-contest-item">
                  <span className="dashboard-contest-name">{r.contest_name}</span>
                  <span className={`dashboard-contest-delta ${r.delta >= 0 ? 'positive' : 'negative'}`}>
                    {r.delta >= 0 ? '+' : ''}{r.delta}
                  </span>
                  <span className="dashboard-contest-rating">{r.rating_after}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="dashboard-empty">
            {cfAccount ? '暂无 Rating 数据，请在设置中同步' : '请在设置中绑定 Codeforces Handle'}
          </div>
        )}
      </div>

      {/* 列表区域 */}
      <div className="dashboard-lists">
        <div className="dashboard-list-section">
          <h3 className="dashboard-section-title">学习轨迹</h3>
          {timeline.length === 0 ? (
            <div className="dashboard-empty">暂无数据</div>
          ) : (
            <div className="dashboard-timeline">
              {timeline.map((e: any, i: number) => (
                <div key={e.id || i} className="dashboard-timeline-item">
                  <div className="dashboard-timeline-dot" />
                  <div className="dashboard-timeline-content">
                    <span className="dashboard-timeline-type">{e.event_type}</span>
                    {e.platform && <span className="dashboard-timeline-platform">{e.platform}</span>}
                    <span className="dashboard-timeline-time">{typeof e.occurred_at === 'string' ? e.occurred_at.replace('T', ' ').slice(0, 19) : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-list-section">
          <h3 className="dashboard-section-title">错题（未 AC）</h3>
          {wrongProblems.length === 0 ? (
            <div className="dashboard-empty">暂无数据</div>
          ) : (
            wrongProblems.map((p: any) => (
              <div key={p.id} className="dashboard-list-item" onClick={() => onNavigate(p.canonical_url)}>
                <span className="dashboard-list-platform">{PLATFORM_NAMES[p.platform] || p.platform}</span>
                <span className="dashboard-list-title">{p.title || p.platform_problem_id}</span>
                <span className="dashboard-list-count">{p.wrong_count} 次</span>
              </div>
            ))
          )}
        </div>

        <div className="dashboard-list-section">
          <h3 className="dashboard-section-title">30 天未复习</h3>
          {unreviewed.length === 0 ? (
            <div className="dashboard-empty">暂无数据</div>
          ) : (
            unreviewed.map((p: any) => (
              <div key={p.id} className="dashboard-list-item" onClick={() => onNavigate(p.canonical_url)}>
                <span className="dashboard-list-platform">{PLATFORM_NAMES[p.platform] || p.platform}</span>
                <span className="dashboard-list-title">{p.title || p.platform_problem_id}</span>
                <span className="dashboard-list-count">{p.days_since} 天前</span>
              </div>
            ))
          )}
        </div>

        <div className="dashboard-list-section">
          <h3 className="dashboard-section-title">复访最多</h3>
          {revisits.length === 0 ? (
            <div className="dashboard-empty">暂无数据</div>
          ) : (
            revisits.map((p: any) => (
              <div key={p.problem_id} className="dashboard-list-item" onClick={() => onNavigate(p.canonical_url)}>
                <span className="dashboard-list-platform">{PLATFORM_NAMES[p.platform] || p.platform}</span>
                <span className="dashboard-list-title">{p.title || p.platform_problem_id}</span>
                <span className="dashboard-list-count">{p.visit_count} 次</span>
              </div>
            ))
          )}
        </div>
      </div>

      {stats?.lastActiveTime && (
        <div className="dashboard-footer">
          最近活跃：{typeof stats.lastActiveTime === 'string' ? stats.lastActiveTime.replace('T', ' ').slice(0, 19) : ''}
        </div>
      )}
    </div>
  )
}
