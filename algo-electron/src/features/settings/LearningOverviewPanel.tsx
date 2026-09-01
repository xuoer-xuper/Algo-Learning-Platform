import type { SettingsOverviewStats } from './settingsTypes'
import { Card, Skeleton } from '../../components/ui'

interface LearningOverviewPanelProps {
  stats: SettingsOverviewStats | null
}

function formatLastActive(value: string | null): string {
  return value ? value.replace('T', ' ').slice(0, 19) : '暂无'
}

export function LearningOverviewPanel({ stats }: LearningOverviewPanelProps) {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">学习概览</h3>
      {stats ? (
        <div className="stats-grid">
          <Card padded={false} className="stats-card">
            <div className="stats-value">{stats.totalProblems}</div>
            <div className="stats-label">总题数</div>
          </Card>
          <Card padded={false} className="stats-card">
            <div className="stats-value">{stats.todayVisited}</div>
            <div className="stats-label">今日访问</div>
          </Card>
          <Card padded={false} className="stats-card stats-card-wide">
            <div className="stats-label">最近活跃</div>
            <div className="stats-value stats-value-sm">{formatLastActive(stats.lastActiveTime)}</div>
          </Card>
        </div>
      ) : (
        // 改前这里用的是 `.settings-empty`（空态类）渲染"加载中..." —— 加载与空
        // 共用一个类名，正是 B5.2 要收掉的那种含混。
        <Skeleton rows={3} label="学习概览加载中" />
      )}
    </div>
  )
}
