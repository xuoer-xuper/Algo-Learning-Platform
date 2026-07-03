import type { SettingsOverviewStats } from './settingsTypes'

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
          <div className="stats-card">
            <div className="stats-value">{stats.totalProblems}</div>
            <div className="stats-label">总题数</div>
          </div>
          <div className="stats-card">
            <div className="stats-value">{stats.todayVisited}</div>
            <div className="stats-label">今日访问</div>
          </div>
          <div className="stats-card stats-card-wide">
            <div className="stats-label">最近活跃</div>
            <div className="stats-value stats-value-sm">{formatLastActive(stats.lastActiveTime)}</div>
          </div>
        </div>
      ) : (
        <div className="settings-empty">加载中...</div>
      )}
    </div>
  )
}
