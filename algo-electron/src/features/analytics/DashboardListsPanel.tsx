import { Empty, ListRow, Skeleton } from '../../components/ui'
import { PLATFORM_NAMES } from '../../shared/display'
import type { DashboardProblemListItem, DashboardRevisitItem, DashboardTimelineEvent } from './types'

/*
 * 四个列表的数据都用 `T[] | null`（B5.2）：`null` = 还没读到，`[]` = 读到了且为空。
 * 改这个类型的直接原因是这块原先把两者都渲染成"暂无数据"——Dashboard 一打开，
 * 四个列表齐刷刷显示"暂无数据"，然后数据到了再跳出来，读起来像"我的记录丢了"。
 */
interface DashboardListsPanelProps {
  timeline: DashboardTimelineEvent[] | null
  wrongProblems: DashboardProblemListItem[] | null
  unreviewed: DashboardProblemListItem[] | null
  revisits: DashboardRevisitItem[] | null
  onNavigate: (url: string) => void
}

interface ProblemListSectionProps<T extends DashboardProblemListItem | DashboardRevisitItem> {
  title: string
  items: T[] | null
  getKey: (item: T) => string | number
  getCountLabel: (item: T) => string
  onNavigate: (url: string) => void
}

function formatTime(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace('T', ' ').slice(0, 19) : ''
}

function formatProblemTitle(item: DashboardProblemListItem | DashboardRevisitItem): string {
  return item.title || item.platform_problem_id || '未命名题目'
}

function ProblemListSection<T extends DashboardProblemListItem | DashboardRevisitItem>({
  title,
  items,
  getKey,
  getCountLabel,
  onNavigate,
}: ProblemListSectionProps<T>) {
  return (
    <div className="dashboard-list-section">
      <h3 className="dashboard-section-title">{title}</h3>
      {items === null ? (
        <Skeleton rows={3} label={`${title}加载中`} />
      ) : items.length === 0 ? (
        <Empty compact>暂无数据</Empty>
      ) : (
        items.map((item) => (
          // 行改为 ui/ListRow：原先是裸 `<div onClick>`，Tab 到不了、回车没目标
          <ListRow
            key={getKey(item)}
            className="dashboard-list-item"
            onActivate={() => onNavigate(item.canonical_url)}
            label={`打开 ${formatProblemTitle(item)}`}
          >
            <span className="dashboard-list-platform">{PLATFORM_NAMES[item.platform] || item.platform}</span>
            <span className="dashboard-list-title">{formatProblemTitle(item)}</span>
            <span className="dashboard-list-count">{getCountLabel(item)}</span>
          </ListRow>
        ))
      )}
    </div>
  )
}

export function DashboardListsPanel({
  timeline,
  wrongProblems,
  unreviewed,
  revisits,
  onNavigate,
}: DashboardListsPanelProps) {
  return (
    <div className="dashboard-lists">
      <div className="dashboard-list-section">
        <h3 className="dashboard-section-title">学习轨迹</h3>
        {timeline === null ? (
          <Skeleton rows={4} label="学习轨迹加载中" />
        ) : timeline.length === 0 ? (
          <Empty compact>暂无数据</Empty>
        ) : (
          <div className="dashboard-timeline">
            {timeline.map((event, index) => (
              <div key={event.id ?? index} className="dashboard-timeline-item">
                <div className="dashboard-timeline-dot" />
                <div className="dashboard-timeline-content">
                  <span className="dashboard-timeline-type">{event.event_type}</span>
                  {event.platform && <span className="dashboard-timeline-platform">{event.platform}</span>}
                  <span className="dashboard-timeline-time">{formatTime(event.occurred_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProblemListSection
        title="错题（未 AC）"
        items={wrongProblems}
        getKey={(item) => item.id}
        getCountLabel={(item) => `${item.wrong_count ?? 0} 次`}
        onNavigate={onNavigate}
      />

      <ProblemListSection
        title="30 天未复习"
        items={unreviewed}
        getKey={(item) => item.id}
        getCountLabel={(item) => `${item.days_since ?? 0} 天前`}
        onNavigate={onNavigate}
      />

      <ProblemListSection
        title="复访最多"
        items={revisits}
        getKey={(item) => item.problem_id}
        getCountLabel={(item) => `${item.visit_count} 次`}
        onNavigate={onNavigate}
      />
    </div>
  )
}
