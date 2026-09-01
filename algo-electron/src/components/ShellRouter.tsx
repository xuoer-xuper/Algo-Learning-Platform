import React, { lazy, Suspense } from 'react'
import { HomePage } from '../features/home/HomePage'
import type { TabStripTabInfo } from './tabApi'
import { Button, Icon, Skeleton } from './ui'

const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const Dashboard = lazy(() => import('../features/analytics/Dashboard').then((module) => ({ default: module.Dashboard })))
const UserScriptManager = lazy(() => import('../features/scripts/UserScriptManager').then((module) => ({ default: module.UserScriptManager })))
const UserScriptInstallPage = lazy(() => import('../features/scripts/UserScriptInstallPage').then((module) => ({ default: module.UserScriptInstallPage })))
const CoachMetricsView = lazy(() => import('../features/coach/CoachMetricsView').then((module) => ({ default: module.CoachMetricsView })))
const CredentialsPage = lazy(() => import('../features/settings/CredentialsPage').then((module) => ({ default: module.CredentialsPage })))
const ProblemDetail = lazy(() => import('../features/problems/ProblemDetail').then((module) => ({ default: module.ProblemDetail })))
const NotePanelModal = lazy(() => import('../features/problems/NotePanelModal').then((module) => ({ default: module.NotePanelModal })))

interface ShellRouterProps {
  activeTab: TabStripTabInfo | null
  onNavigate: (url: string) => void
  onCloseActiveTab: () => void
  onReloadActiveTab: () => void
}

/*
 * 懒加载路由的等待态。用骨架而不是"加载中..."一行字：内部页是整屏切换，
 * 一行居中文字读起来像空页面，骨架能表达"这里马上有东西"。
 * `.modal-loading` 保留做居中容器（min-height 240px），骨架撑宽度。
 */
function RouteLoading() {
  return (
    <div className="modal-loading">
      <Skeleton rows={4} className="route-loading-skeleton" label="页面加载中" />
    </div>
  )
}

/*
 * View Transitions 能力检测。Electron 内的 Chromium 支持该 API，但必须做运行时检测：
 * 如果 API 不存在（旧版本或被禁用），直接执行回调，页面切换仍可正常工作，只是没有过渡动画。
 */
function maybeTransition(callback: () => void) {
  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(callback)
  } else {
    callback()
  }
}

export function ShellRouter({
  activeTab,
  onNavigate,
  onCloseActiveTab,
  onReloadActiveTab,
}: ShellRouterProps) {
  const [renderTab, setRenderTab] = React.useState<TabStripTabInfo | null>(activeTab)
  const prevTabIdRef = React.useRef<string | null>(activeTab?.id ?? null)

  /*
   * 内部页切换触发 View Transition。只在标签 id 变化时触发动画，
   * 同一标签的属性变化（如 isCrashed）不触发动画但会立即更新 renderTab。
   */
  React.useEffect(() => {
    const currentId = activeTab?.id ?? null
    if (currentId === prevTabIdRef.current) {
      // 同一标签，直接更新不做动画
      setRenderTab(activeTab)
      return
    }
    maybeTransition(() => {
      setRenderTab(activeTab)
      prevTabIdRef.current = currentId
    })
  }, [activeTab])

  if (!renderTab) return null

  if (renderTab.kind === 'web') {
    if (!renderTab.isCrashed) return null
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
  switch (renderTab.page.type) {
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
      page = <ProblemDetail problemId={renderTab.page.problemId} onClose={close} />
      break
    case 'notes':
      page = <NotePanelModal problemId={renderTab.page.problemId} onClose={close} />
      break
    case 'script-install':
      page = <UserScriptInstallPage installId={renderTab.page.installId} onClose={close} />
      break
    case 'credentials':
      page = <CredentialsPage onClose={close} />
      break
  }

  return (
    <div className={`shell-route shell-route-${renderTab.page.type}`} data-testid="shell-route">
      <Suspense fallback={<RouteLoading />}>{page}</Suspense>
    </div>
  )
}
