import { useState, useEffect } from 'react'
import { CodeforcesSyncPanel } from './CodeforcesSyncPanel'
import { DefaultHomePanel } from './DefaultHomePanel'
import {
  LearningOverviewPanel,
  type SettingsOverviewStats,
} from './LearningOverviewPanel'
import { PlatformDistributionSummary } from './PlatformDistributionSummary'
import {
  RealtimeSubmissionPanel,
  type RealtimeSubmissionStatus,
} from './RealtimeSubmissionPanel'
import { SiteManagementPanel } from './SiteManagementPanel'

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<SettingsOverviewStats | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeSubmissionStatus | null>(null)
  const [realtimeStatusText, setRealtimeStatusText] = useState('')

  const loadOverviewStats = async () => {
    const overview = await window.electronAPI.getOverviewStats()
    setStats(overview)
  }

  const loadRealtimeStatus = async () => {
    setRealtimeStatusText('刷新中...')
    try {
      const status = await window.electronAPI.getRealtimeSubmissionStatus()
      setRealtimeStatus(status)
      setRealtimeStatusText(status ? '' : '实时监听服务未就绪')
    } catch (e: any) {
      setRealtimeStatusText(`读取失败: ${e.message}`)
    }
  }

  useEffect(() => {
    loadOverviewStats()
    loadRealtimeStatus()
  }, [])

  return (
      <div className="settings-page">
        <div className="settings-header">
          <h2 className="settings-title">设置</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-cols">
          {/* 左栏：配置类设置 */}
          <div className="settings-col">
            <DefaultHomePanel />
            <LearningOverviewPanel stats={stats} />
            <CodeforcesSyncPanel onStatsRefresh={loadOverviewStats} />
            <RealtimeSubmissionPanel
              status={realtimeStatus}
              statusText={realtimeStatusText}
              onRefresh={loadRealtimeStatus}
            />
            <PlatformDistributionSummary distribution={stats?.platformDistribution ?? []} />
          </div>

          <div className="settings-col">
            <SiteManagementPanel />
          </div>
        </div>
      </div>
  )
}
