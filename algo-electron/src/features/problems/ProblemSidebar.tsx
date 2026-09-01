import { useState, useEffect, useCallback, useRef } from 'react'
import { PLATFORM_LABELS, STATUS_COLORS } from '../../shared/display'
import { Empty, IconButton, ListRow, Select, Skeleton } from '../../components/ui'
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
  // null = 还没读到（渲染骨架），[] = 读到了且确实没有（渲染空态）。
  // B5.2 之前这里是 useState<...[]>([])，于是加载中和"你没有记录"长得一模一样。
  const [problems, setProblems] = useState<SidebarProblemRecord[] | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [filterPlatform, setFilterPlatform] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const sidebarRef = useRef<HTMLDivElement>(null)
  const hasFilter = filterPlatform !== '' || filterStatus !== ''

  const loadProblems = useCallback(async () => {
    try {
      const list = await loadRecentProblems(200, filterPlatform || undefined, filterStatus || undefined)
      setProblems(list)
    } catch (error: unknown) {
      // 读失败必须落到"读到了且为空"，否则骨架会一直转下去，看起来像卡死。
      // 空态与「筛选无结果」现在已经分开，剩下的混淆面只有失败与真空。
      setProblems([])
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

  /*
   * 折叠态与展开态共用一个根节点（B5.2）。
   *
   * 改这里的原因就是过渡动画：原先 `collapsed` 走的是提前 return，两个分支是
   * 两棵不同的子树，浏览器没有"同一个元素的宽度变了"这件事可以插值，加多少
   * transition 都不会动。合成一个根节点后 28px ↔ clamp(180px,22cqi,220px)
   * 才是同一个元素的宽度变化。
   */
  if (collapsed) {
    return (
      <div ref={sidebarRef} className="sidebar sidebar-is-collapsed">
        <ListRow
          onActivate={() => setCollapsed(false)}
          className="sidebar-expand"
          label="展开题库"
          title="展开题库"
        >
          <span className="sidebar-collapsed-label">题库</span>
        </ListRow>
      </div>
    )
  }

  return (
    <div ref={sidebarRef} className="sidebar">
      <div className="sidebar-header">
        {/* 加载中不报数：`(0)` 会被读成"题库是空的" */}
        <span className="sidebar-title">题库{problems === null ? '' : ` (${problems.length})`}</span>
        <IconButton
          icon="chevron-left"
          size={15}
          className="sidebar-collapse-btn"
          title="收起题库"
          onClick={() => setCollapsed(true)}
        />
      </div>

      <div className="sidebar-filters">
        <Select size="sm" className="sidebar-select" value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}>
          <option value="">全部平台</option>
          <option value="codeforces">Codeforces</option>
          <option value="acwing">AcWing</option>
          <option value="nowcoder">牛客</option>
          <option value="vjudge">VJudge</option>
          <option value="pta">PTA</option>
          <option value="luogu">洛谷</option>
          <option value="leetcode-cn">LeetCode</option>
        </Select>
        <Select size="sm" className="sidebar-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="solved">已通过</option>
          <option value="attempted">尝试中</option>
          <option value="visited">已访问</option>
        </Select>
      </div>

      <div className="sidebar-list">
        {problems === null ? (
          <Skeleton rows={8} className="sidebar-skeleton" label="题库加载中" />
        ) : problems.length === 0 ? (
          /*
           * 筛选无结果与真的没有记录分开说。原代码有一行注释承认"侧栏空态与
           * 「筛选无结果」长得一样"，但只是把它记下来，没有分开——于是筛掉全部
           * 结果时用户看到的是"暂无记录"，会以为题库被清空了。
           */
          hasFilter ? (
            <Empty compact hint="调整上方筛选条件可以看到更多">没有符合筛选条件的题目</Empty>
          ) : (
            <Empty compact hint="浏览题目页面后会自动记录在这里">暂无记录</Empty>
          )
        ) : (
          problems.map((p) => (
            /*
             * 行本身不再可点：主操作收进 ListRow（键盘可达），两个图标按钮作为
             * 兄弟节点留在外面。这样 role="button" 里不含可交互元素，ARIA 合法，
             * 也不必再用 stopPropagation 去拦冒泡——没有父级 onClick 可拦了。
             */
            <div key={p.id} className="sidebar-item">
              <ListRow
                className="sidebar-item-main"
                onActivate={() => onNavigate(p.canonical_url)}
                label={`打开 ${p.title || p.platform_problem_id}`}
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
              </ListRow>
              {p.submission_count ? (
                <span className="sidebar-item-count">{p.submission_count}</span>
              ) : null}
              {/* IconButton 的 title 必填并同时写 aria-label：原来只有 title，读屏取不到名字 */}
              <IconButton
                icon="edit"
                size={13}
                className="sidebar-item-notes"
                title="本地笔记"
                onClick={() => onShowNotes(p.id)}
              />
              <IconButton
                icon="more"
                size={14}
                className="sidebar-item-detail"
                title="查看详情"
                onClick={() => onShowDetail(p.id)}
              />
            </div>
          ))
        )}
      </div>


    </div>
  )
}
