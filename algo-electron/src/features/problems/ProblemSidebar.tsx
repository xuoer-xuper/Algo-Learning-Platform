import { useState, useEffect, useCallback } from 'react'
import { PLATFORM_LABELS, STATUS_COLORS } from '../../shared/display'

interface ProblemRecord {
  id: string
  platform: string
  platform_problem_id: string
  canonical_url: string
  title: string | null
  status: string
  last_visited_at: string | null
  submission_count?: number
}

interface Props {
  onNavigate: (url: string) => void
  onShowDetail: (problemId: string) => void
  onShowNotes: (problemId: string) => void
  onWidthChange?: (width: number) => void
}

export function ProblemSidebar({ onNavigate, onShowDetail, onShowNotes, onWidthChange }: Props) {
  const [problems, setProblems] = useState<ProblemRecord[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [filterPlatform, setFilterPlatform] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')

  const loadProblems = useCallback(async () => {
    const list = await window.electronAPI.listRecentProblems(200, filterPlatform || undefined, filterStatus || undefined)
    setProblems(list)
  }, [filterPlatform, filterStatus])

  useEffect(() => {
    loadProblems()
    const unsubscribe = window.electronAPI.onProblemsUpdated(() => { loadProblems() })
    return unsubscribe
  }, [loadProblems])

  useEffect(() => {
    const width = collapsed ? 28 : 220
    window.electronAPI.setSidebarWidth(width)
    onWidthChange?.(width)
  }, [collapsed, onWidthChange])



  if (collapsed) {
    return (
      <div className="sidebar-collapsed" onClick={() => setCollapsed(false)}>
        <span className="sidebar-collapsed-label">题库</span>
      </div>
    )
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">题库 ({problems.length})</span>
        <button className="sidebar-collapse-btn" onClick={() => setCollapsed(true)}>‹</button>
      </div>

      <div className="sidebar-filters">
        <select className="sidebar-select" value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}>
          <option value="">全部平台</option>
          <option value="codeforces">Codeforces</option>
          <option value="acwing">AcWing</option>
          <option value="nowcoder">牛客</option>
          <option value="vjudge">VJudge</option>
          <option value="pta">PTA</option>
          <option value="luogu">洛谷</option>
          <option value="leetcode-cn">LeetCode</option>
        </select>
        <select className="sidebar-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="solved">已通过</option>
          <option value="attempted">尝试中</option>
          <option value="visited">已访问</option>
        </select>
      </div>

      <div className="sidebar-list">
        {problems.length === 0 ? (
          <div className="sidebar-empty">暂无记录</div>
        ) : (
          problems.map((p) => (
            <div
              key={p.id}
              className="sidebar-item"
              onClick={() => onNavigate(p.canonical_url)}
            >
              <span
                className="sidebar-item-dot"
                style={{ backgroundColor: STATUS_COLORS[p.status] || STATUS_COLORS.unknown }}
              />
              <span className="sidebar-item-platform">
                {PLATFORM_LABELS[p.platform] || p.platform}
              </span>
              <span className="sidebar-item-id">
                {p.title || p.platform_problem_id}
              </span>
              {p.submission_count ? (
                <span className="sidebar-item-count">{p.submission_count}</span>
              ) : null}
              <button
                className="sidebar-item-notes"
                onClick={e => { e.stopPropagation(); onShowNotes(p.id) }}
                title="本地笔记"
              >
                ✎
              </button>
              <button
                className="sidebar-item-detail"
                onClick={e => { e.stopPropagation(); onShowDetail(p.id) }}
                title="查看详情"
              >
                ⋯
              </button>
            </div>
          ))
        )}
      </div>


    </div>
  )
}
