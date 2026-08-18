import { lazy, Suspense } from 'react'
import { HomePage } from '../features/home/HomePage'
import type { TabStripTabInfo } from './tabApi'
import { Button, Icon } from './ui'

const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const Dashboard = lazy(() => import('../features/analytics/Dashboard').then((module) => ({ default: module.Dashboard })))
const UserScriptManager = lazy(() => import('../features/scripts/UserScriptManager').then((module) => ({ default: module.UserScriptManager })))
const UserScriptInstallPage = lazy(() => import('../features/scripts/UserScriptInstallPage').then((module) => ({ default: module.UserScriptInstallPage })))
const CoachMetricsView = lazy(() => import('../features/coach/CoachMetricsView').then((module) => ({ default: module.CoachMetricsView })))
const ProblemDetail = lazy(() => import('../features/problems/ProblemDetail').then((module) => ({ default: module.ProblemDetail })))
const NotePanelModal = lazy(() => import('../features/problems/NotePanelModal').then((module) => ({ default: module.NotePanelModal })))

interface ShellRouterProps {
  activeTab: TabStripTabInfo | null
  onNavigate: (url: string) => void
  onCloseActiveTab: () => void
  onReloadActiveTab: () => void
}

function RouteLoading() {
  return <div className="modal-loading" role="status">加载中...</div>
}

function UnavailableInternalPage() {
  return <div className="ui-empty">页面暂不可用</div>
}

export function ShellRouter({
  activeTab,
  onNavigate,
  onCloseActiveTab,
  onReloadActiveTab,
}: ShellRouterProps) {
  if (!activeTab) return null

  if (activeTab.kind === 'web') {
    if (!activeTab.isCrashed) return null
    return (
      <div className="browser-crash-state" role="alert" data-testid="browser-crash-state">
        <Icon name="refresh" size={28} />
        <h1>此页面已停止运行</h1>
        <p>标签仍然保留。重新加载后会尝试恢复当前地址。</p>
        <div className="browser-crash-actions">
          <Button variant="primary" icon="refresh" onClick={onReloadActiveTab}>重新加载</Button>
          <Button variant="ghost" onClick={onCloseActiveTab}>关闭标签</Button>
        </div>
      </div>
    )
  }

  const close = onCloseActiveTab
  let page: React.ReactNode
  switch (activeTab.page.type) {
    case 'home':
      page = <HomePage onNavigate={onNavigate} />
      break
    case 'settings':
      page = <SettingsPage onClose={close} />
      break
    case 'dashboard':
      page = <Dashboard onClose={close} onNavigate={onNavigate} />
      break
    case 'scripts':
      page = <UserScriptManager onClose={close} />
      break
    case 'coach-metrics':
      page = <CoachMetricsView onClose={close} />
      break
    case 'problem-detail':
      page = <ProblemDetail problemId={activeTab.page.problemId} onClose={close} />
      break
    case 'notes':
      page = <NotePanelModal problemId={activeTab.page.problemId} onClose={close} />
      break
    case 'script-install':
      page = <UserScriptInstallPage installId={activeTab.page.installId} onClose={close} />
      break
    case 'credentials':
      page = <UnavailableInternalPage />
      break
  }

  return (
    <div className={`shell-route shell-route-${activeTab.page.type}`} data-testid="shell-route">
      <Suspense fallback={<RouteLoading />}>{page}</Suspense>
    </div>
  )
}
