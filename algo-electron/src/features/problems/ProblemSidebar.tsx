import { useState, useEffect, useCallback } from 'react'

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

const PLATFORM_LABELS: Record<string, string> = {
  codeforces: 'CF',
  acwing: 'AcW',
  nowcoder: 'NC',
  vjudge: 'VJ',
  pta: 'PTA',
}

const STATUS_COLORS: Record<string, string> = {
  unknown: '#585b70',
  visited: '#89b4fa',
  attempted: '#f9e2af',
  solved: '#a6e3a1',
}

const PAGE_SIZE = 30

interface Props {
  onNavigate: (url: string) => void
  onShowDetail: (problemId: string) => void
  onWidthChange?: (width: number) => void
}

export function ProblemSidebar({ onNavigate, onShowDetail, onWidthChange }: Props) {
  const [problems, setProblems] = useState<ProblemRecord[]>([])
  const [page, setPage] = useState(1)
  const [collapsed, setCollapsed] = useState(false)
  const [filterPlatform, setFilterPlatform] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')

  const loadProblems = useCallback(async () => {
    const list = await window.electronAPI.listRecentProblems(200, filterPlatform || undefined, filterStatus || undefined)
    setProblems(list)
    setPage(1)
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

  const totalPages = Math.max(1, Math.ceil(problems.length / PAGE_SIZE))
  const paged = problems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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
        </select>
        <select className="sidebar-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="solved">已通过</option>
          <option value="attempted">尝试中</option>
          <option value="visited">已访问</option>
        </select>
      </div>

      <div className="sidebar-list">
        {paged.length === 0 ? (
          <div className="sidebar-empty">暂无记录</div>
        ) : (
          paged.map((p) => (
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

      {totalPages > 1 && (
        <div className="sidebar-pagination">
          <button className="sidebar-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
          <span className="sidebar-page-info">{page}/{totalPages}</span>
          <button className="sidebar-page-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
        </div>
      )}
    </div>
  )
}
