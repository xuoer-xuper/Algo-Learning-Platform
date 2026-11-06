import { useState } from 'react'
import { Button, IconButton } from '../../components/ui'
import { AppearancePanel } from './AppearancePanel'
import { BackupPanel } from './BackupPanel'
import { CodeforcesSyncPanel } from './CodeforcesSyncPanel'
import { CoachPanel } from './CoachPanel'
import { LearningOverviewPanel } from './LearningOverviewPanel'
import { LlmConfigPanel } from './LlmConfigPanel'
import { PlatformDistributionSummary } from './PlatformDistributionSummary'
import { RealtimeSubmissionPanel } from './RealtimeSubmissionPanel'
import { SearchEnginePanel } from './SearchEnginePanel'
import { SiteManagementPanel } from './SiteManagementPanel'
import { useIpcQuery } from '../../hooks/useIpcQuery'
import { useIpcQueryError } from '../../hooks/useIpcQueryError'
import { errorMessage } from '../../shared/errors'
import { loadRealtimeSubmissionStatus, loadSettingsOverviewStats } from './settingsApi'
import { SETTINGS_SECTIONS, type SettingsSectionId } from './settingsSections'

/*
 * 设置页（B5.1，Chrome 式分区导航）。
 *
 * 原先是 9 个面板堆在两栏里，一页到底 —— 找一个设置得靠滚动加肉眼扫描。现在改成
 * chrome://settings 的形态：左侧分区导航，右侧只渲染当前分区。
 *
 * 三个刻意的选择：
 *
 * 1. **导航不用 `role="tab"`**。视觉上像标签，语义上却会和浏览器标签条撞车——
 *    TabStrip 用的就是 `role="tab"`，UI 契约测试靠 `getByRole('tab')` 计数校验
 *    标签数。这里用 `<nav>` + `aria-current="page"`，与 Chrome 设置页的语义一致。
 * 2. **只渲染当前分区**，不是全渲染再靠滚动定位。九个面板各自在 mount 时读主进程，
 *    全渲染等于每次开设置页就把九条读路径全打一遍。
 * 3. **`.settings-cols` 类名保留**，语义从"配置栏/站点栏"变成"导航栏/内容区"。
 *    响应式契约不变（容器 ≤680px 折叠为单列），Playwright 的折叠断言继续成立。
 */

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<SettingsSectionId>('appearance')
  const overview = useIpcQuery(loadSettingsOverviewStats, [], {
    tables: ['problems', 'submissions', 'stats'],
  })
  const realtime = useIpcQuery(loadRealtimeSubmissionStatus, [])
  const stats = overview.data ?? null
  const realtimeStatus = realtime.data ?? null
  const realtimeStatusText =
    realtime.isLoading || realtime.isRefetching
      ? '刷新中...'
      : realtime.error
        ? `读取失败: ${errorMessage(realtime.error)}`
        : realtimeStatus
          ? ''
          : '实时监听服务未就绪'
  useIpcQueryError(overview.error, '设置页概览读取')
  const loadOverviewStats = async () => {
    await overview.refetch()
  }
  const loadRealtimeStatus = async () => {
    await realtime.refetch()
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2 className="settings-title">设置</h2>
        <IconButton icon="close" title="关闭" className="settings-close" onClick={onClose} />
      </div>

      <div className="settings-cols">
        <nav className="settings-nav" aria-label="设置分区">
          {SETTINGS_SECTIONS.map(({ id, label, icon }) => (
            <Button
              key={id}
              variant="ghost"
              icon={icon}
              className="settings-nav-item"
              data-section={id}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => setSection(id)}
            >
              <span className="settings-nav-label">{label}</span>
            </Button>
          ))}
        </nav>

        <div className="settings-content" data-active-section={section}>
          {section === 'appearance' && <AppearancePanel />}
          {section === 'coach' && <CoachPanel />}
          {section === 'search' && <SearchEnginePanel />}
          {section === 'llm' && <LlmConfigPanel />}
          {section === 'sites' && <SiteManagementPanel />}
          {section === 'sync' && <CodeforcesSyncPanel onStatsRefresh={loadOverviewStats} />}
          {section === 'data' && <BackupPanel />}
          {section === 'overview' && (
            <>
              <LearningOverviewPanel stats={stats} />
              <PlatformDistributionSummary distribution={stats?.platformDistribution ?? []} />
            </>
          )}
          {section === 'diagnostics' && (
            <RealtimeSubmissionPanel
              status={realtimeStatus}
              statusText={realtimeStatusText}
              onRefresh={loadRealtimeStatus}
            />
          )}
        </div>
      </div>
    </div>
  )
}
