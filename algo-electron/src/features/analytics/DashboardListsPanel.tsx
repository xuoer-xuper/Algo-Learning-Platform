import { PLATFORM_NAMES } from '../../shared/display'

export interface DashboardTimelineEvent {
  id?: string | number
  event_type: string
  platform?: string | null
  occurred_at?: string | null
}

export interface DashboardProblemListItem {
  id: string | number
  platform: string
  title?: string | null
  platform_problem_id?: string | null
  canonical_url: string
  wrong_count?: number
  days_since?: number
}

export interface DashboardRevisitItem {
  problem_id: string | number
  platform: string
  title?: string | null
  platform_problem_id?: string | null
  canonical_url: string
  visit_count: number
}

interface DashboardListsPanelProps {
  timeline: DashboardTimelineEvent[]
  wrongProblems: DashboardProblemListItem[]
  unreviewed: DashboardProblemListItem[]
  revisits: DashboardRevisitItem[]
  onNavigate: (url: string) => void
}

interface ProblemListSectionProps<T extends DashboardProblemListItem | DashboardRevisitItem> {
  title: string
  items: T[]
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
      {items.length === 0 ? (
        <div className="dashboard-empty">暂无数据</div>
      ) : (
        items.map((item) => (
          <div key={getKey(item)} className="dashboard-list-item" onClick={() => onNavigate(item.canonical_url)}>
            <span className="dashboard-list-platform">{PLATFORM_NAMES[item.platform] || item.platform}</span>
            <span className="dashboard-list-title">{formatProblemTitle(item)}</span>
            <span className="dashboard-list-count">{getCountLabel(item)}</span>
          </div>
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
        {timeline.length === 0 ? (
          <div className="dashboard-empty">暂无数据</div>
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
