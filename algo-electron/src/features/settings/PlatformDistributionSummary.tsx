import { PLATFORM_NAMES } from '../../shared/display'

interface PlatformDistributionItem {
  platform: string
  count: number
}

interface PlatformDistributionSummaryProps {
  distribution: PlatformDistributionItem[]
}

export function PlatformDistributionSummary({ distribution }: PlatformDistributionSummaryProps) {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">平台分布</h3>
      {distribution.length > 0 ? (
        <div className="platform-list">
          {distribution.map((item) => (
            <div key={item.platform} className="platform-item">
              <span className="platform-name">{PLATFORM_NAMES[item.platform] || item.platform}</span>
              <span className="platform-count">{item.count} 题</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="settings-empty">暂无数据</div>
      )}
    </div>
  )
}
