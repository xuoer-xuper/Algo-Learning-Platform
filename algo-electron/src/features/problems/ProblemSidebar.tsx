import { useState, useEffect, useCallback } from 'react'

interface ProblemRecord {
  id: string
  platform: string
  platform_problem_id: string
  canonical_url: string
  title: string | null
  status: string
  last_visited_at: string | null
}

const PLATFORM_LABELS: Record<string, string> = {
  codeforces: 'CF',
  acwing: 'AcW',
  nowcoder: 'NC',
  vjudge: 'VJ',
}

const STATUS_COLORS: Record<string, string> = {
  unknown: '#585b70',
  visited: '#89b4fa',
  attempted: '#f9e2af',
  solved: '#a6e3a1',
}

const PAGE_SIZE = 30

export function ProblemSidebar() {
  const [problems, setProblems] = useState<ProblemRecord[]>([])
  const [page, setPage] = useState(1)
  const [collapsed, setCollapsed] = useState(false)

  const loadProblems = useCallback(async () => {
    const list = await window.electronAPI.listRecentProblems(200)
    setProblems(list)
  }, [])

  useEffect(() => {
    loadProblems()
    const unsubscribe = window.electronAPI.onProblemsUpdated(() => {
      loadProblems()
    })
    return unsubscribe
  }, [loadProblems])

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
        <span className="sidebar-title">最近访问</span>
        <button className="sidebar-collapse-btn" onClick={() => setCollapsed(true)}>
          ‹
        </button>
      </div>
      <div className="sidebar-list">
        {problems.length === 0 ? (
          <div className="sidebar-empty">暂无记录</div>
        ) : (
          paged.map((p) => (
            <div
              key={p.id}
              className="sidebar-item"
              onClick={() => window.electronAPI.navigate(p.canonical_url)}
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
            </div>
          ))
        )}
      </div>
      {totalPages > 1 && (
        <div className="sidebar-pagination">
          <button
            className="sidebar-page-btn"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ‹
          </button>
          <span className="sidebar-page-info">{page}/{totalPages}</span>
          <button
            className="sidebar-page-btn"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}
