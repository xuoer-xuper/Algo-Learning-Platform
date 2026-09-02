import React, { lazy, Suspense } from 'react'
import { flushSync } from 'react-dom'
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
 * 上一次仍在进行的过渡。换页比动画快时（连开一批标签、连续点导航）必须显式收掉：
 * 过渡活着期间 Chromium 会在整页之上挂一棵 `::view-transition` 顶层伪元素树并吞掉输入
 * —— `elementFromPoint` 返回 `<html>`（伪元素归属根元素），尽管每层真实祖先都可见且
 * pointer-events: auto，于是界面点不动、拖不动。
 */
let liveTransition: ViewTransition | null = null

/*
 * 上一次过渡的开始时刻。比一次动画还快的连续换页属于"突发"，此时动画本来就看不见，
 * 但每次过渡都要挂一次顶层伪元素树，而实测那棵树会在 finished 之后、
 * `document.activeViewTransition` 已经是 null 的情况下继续挂约 200ms 才被拆掉
 * （Chromium 行为，promise 侧无法提前得知）。这 200ms 里整页吞输入。
 * 所以突发换页直接不做动画：省掉的是一帧都看不到的动画，换来的是全程可点。
 */
let lastTransitionStart = 0

/* 与 --duration-base(160ms) 同量级，略放宽以覆盖过渡收尾。 */
const TRANSITION_BURST_WINDOW_MS = 200

function now(): number {
  return typeof performance === 'object' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/*
 * View Transitions 能力检测。Electron 内的 Chromium 支持该 API，但必须做运行时检测：
 * 不存在时（旧版本或被禁用）直接执行回调，页面切换照常，只是没有过渡动画。
 *
 * 其余三点都不能省：
 *   1. 开新过渡前 skipTransition() 掉旧的。规范说新过渡会跳过旧过渡，但"被跳过"不等于
 *      "已落幕"，那棵伪元素树仍可能挂着。
 *   2. 三个 promise 全部接住。被跳过时以 AbortError（"Transition was skipped"）拒绝，
 *      是预期行为；漏一个就成 unhandled rejection 冒到 window 上变成页面错误。
 *   3. finished 落地后清掉 liveTransition，别把已完成的过渡留在模块变量里。
 */
function maybeTransition(callback: () => void) {
  if (typeof document.startViewTransition !== 'function') {
    callback()
    return
  }

  const startedAt = now()
  if (startedAt - lastTransitionStart < TRANSITION_BURST_WINDOW_MS) {
    liveTransition?.skipTransition()
    liveTransition = null
    lastTransitionStart = startedAt
    callback()
    return
  }

  liveTransition?.skipTransition()
  lastTransitionStart = startedAt

  const transition = document.startViewTransition(callback)
  liveTransition = transition

  const ignore = () => {}
  const settle = () => { if (liveTransition === transition) liveTransition = null }
  transition.ready.catch(ignore)
  transition.updateCallbackDone.catch(ignore)
  transition.finished.then(settle, settle)
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
      /*
       * 必须 flushSync。startViewTransition 的回调返回即视为"新状态已就位"，
       * 而 React 的并发更新默认排到回调之后才提交 —— Chromium 于是把旧 DOM 当成新状态
       * 拍了第二张快照，那棵 `::view-transition` 顶层伪元素树就不会正常落幕，一直盖在
       * 整页之上吞掉输入（连开一批标签后界面点不动、标签拖不动，就是这个）。
       */
      flushSync(() => {
        setRenderTab(activeTab)
      })
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
