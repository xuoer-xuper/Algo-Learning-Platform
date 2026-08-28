import { useState, useEffect, useCallback, useRef } from 'react'
import { PLATFORM_LABELS, STATUS_COLORS } from '../../shared/display'
import { Icon } from '../../components/ui'
import { reportRendererError } from '../../rendererErrors'
import { loadRecentProblems, setProblemSidebarWidth, subscribeProblemsUpdated } from './problemsApi'
import type { SidebarProblemRecord } from './problemTypes'

interface Props {
  onNavigate: (url: string) => void
  onShowDetail: (problemId: string) => void
  onShowNotes: (problemId: string) => void
  onWidthChange?: (width: number) => void
}

export function ProblemSidebar({ onNavigate, onShowDetail, onShowNotes, onWidthChange }: Props) {
  const [problems, setProblems] = useState<SidebarProblemRecord[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [filterPlatform, setFilterPlatform] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const sidebarRef = useRef<HTMLDivElement>(null)

  const loadProblems = useCallback(async () => {
    try {
      const list = await loadRecentProblems(200, filterPlatform || undefined, filterStatus || undefined)
      setProblems(list)
    } catch (error: unknown) {
      // 侧栏空态与「筛选无结果」长得一样，静默失败会被当成筛选生效。
      reportRendererError('题目侧栏读取', error)
    }
  }, [filterPlatform, filterStatus])

  useEffect(() => {
    void loadProblems()
    const unsubscribe = subscribeProblemsUpdated(() => { void loadProblems() })
    return unsubscribe
  }, [loadProblems])

  useEffect(() => {
    const sidebar = sidebarRef.current
    if (!sidebar) return

    let lastWidth = -1
    const syncWidth = () => {
      const width = Math.round(sidebar.getBoundingClientRect().width)
      if (width === lastWidth) return
      lastWidth = width
      setProblemSidebarWidth(width)
      onWidthChange?.(width)
    }

    syncWidth()
    const observer = new ResizeObserver(syncWidth)
    observer.observe(sidebar)
    return () => observer.disconnect()
  }, [collapsed, onWidthChange])

  if (collapsed) {
    return (
      <div ref={sidebarRef} className="sidebar-collapsed" onClick={() => setCollapsed(false)}>
        <span className="sidebar-collapsed-label">题库</span>
      </div>
    )
  }

  return (
    <div ref={sidebarRef} className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">题库 ({problems.length})</span>
        <button className="sidebar-collapse-btn" onClick={() => setCollapsed(true)} title="收起题库" aria-label="收起题库">
          <Icon name="chevron-left" size={15} />
        </button>
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
                <Icon name="edit" size={13} />
              </button>
              <button
                className="sidebar-item-detail"
                onClick={e => { e.stopPropagation(); onShowDetail(p.id) }}
                title="查看详情"
              >
                <Icon name="more" size={14} />
              </button>
            </div>
          ))
        )}
      </div>


    </div>
  )
}
