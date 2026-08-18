import { lazy, Suspense, useCallback, useState } from 'react'
import { HomePage } from './features/home/HomePage'
import { ProblemSidebar } from './features/problems/ProblemSidebar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { WindowControls } from './components/WindowControls'
import { ModalLayer } from './components/ModalLayer'
import { TabBar } from './components/TabBar'
import { BrowserToolbar } from './components/BrowserToolbar'
import {
  closeBrowserTab,
  dismissUnresponsiveBrowserTab,
  reloadBrowserTab,
  type TabBarTabInfo,
} from './components/tabApi'
import { Button, Icon, NoticeBar } from './components/ui'
import { useAppModalState } from './hooks/useAppModalState'
import { useBrowserNavigation } from './hooks/useBrowserNavigation'
import { useBrowserViewVisibility } from './hooks/useBrowserViewVisibility'
import './App.css'

const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const Dashboard = lazy(() => import('./features/analytics/Dashboard').then((module) => ({ default: module.Dashboard })))
const UserScriptManager = lazy(() => import('./features/scripts/UserScriptManager').then((module) => ({ default: module.UserScriptManager })))
const CoachMetricsView = lazy(() => import('./features/coach/CoachMetricsView').then((module) => ({ default: module.CoachMetricsView })))
const ProblemDetail = lazy(() => import('./features/problems/ProblemDetail').then((module) => ({ default: module.ProblemDetail })))
const NotePanelModal = lazy(() => import('./features/problems/NotePanelModal').then((module) => ({ default: module.NotePanelModal })))

function ModalLoading() {
  return <div className="modal-loading" role="status">加载中...</div>
}

function App() {
  const [activeTab, setActiveTab] = useState<TabBarTabInfo | null>(null)
  const {
    url,
    syncMsg,
    sidebarWidth,
    isHome,
    setUrl,
    setSidebarWidth,
    applyUrlState,
    navigateFromInput,
    navigateTo,
    goHome,
    goBack,
    goForward,
    reload,
    syncCurrentPage,
    showTransientMessage,
  } = useBrowserNavigation()
  const {
    showSettings,
    showDashboard,
    showScripts,
    showCoachMetrics,
    selectedProblemId,
    notesProblemId,
    modalBackdrop,
    openSettings,
    closeSettings,
    openDashboard,
    closeDashboard,
    openScripts,
    closeScripts,
    openCoachMetrics,
    closeCoachMetrics,
    openProblemDetail,
    closeProblemDetail,
    openNotes,
    closeNotes,
  } = useAppModalState({ isHome })
  useBrowserViewVisibility({ isHome, modalBackdrop })

  const handleActiveTabChange = useCallback((tab: TabBarTabInfo | null) => {
    setActiveTab(tab)
  }, [])

  const handleReloadActiveTab = useCallback(() => {
    if (activeTab) reloadBrowserTab(activeTab.id)
  }, [activeTab])

  const handleCloseActiveTab = useCallback(() => {
    if (activeTab) closeBrowserTab(activeTab.id)
  }, [activeTab])

  const handleWaitForActiveTab = useCallback(() => {
    if (activeTab) dismissUnresponsiveBrowserTab(activeTab.id)
  }, [activeTab])

  const showUnresponsiveNotice = Boolean(
    activeTab?.isUnresponsive
    && !activeTab.isUnresponsiveNoticeDismissed
    && !activeTab.isCrashed,
  )

  return (
    <ErrorBoundary>
      <div className="app-layout">
      <div className="titlebar-layer">
        <TabBar
          onTabUrlChange={applyUrlState}
          onActiveTabChange={handleActiveTabChange}
          onNotice={showTransientMessage}
        />
        <WindowControls />
      </div>
      <BrowserToolbar
        url={url}
        syncMsg={syncMsg}
        onUrlChange={setUrl}
        onNavigate={navigateFromInput}
        onHome={goHome}
        onBack={goBack}
        onForward={goForward}
        onReload={reload}
        onSyncPage={syncCurrentPage}
        onOpenDashboard={openDashboard}
        onOpenScripts={openScripts}
        onOpenSettings={openSettings}
        onOpenCoachMetrics={openCoachMetrics}
      />
      {showUnresponsiveNotice && (
        <NoticeBar
          tone="warning"
          title="页面没有响应"
          actions={[
            { label: '重新加载', onClick: handleReloadActiveTab },
            { label: '关闭标签', onClick: handleCloseActiveTab, variant: 'ghost' },
          ]}
          dismissLabel="继续等待"
          onDismiss={handleWaitForActiveTab}
        >
          你可以继续等待，或重新加载这个标签。
        </NoticeBar>
      )}
      <div className="content-area">
        <ProblemSidebar
          onNavigate={navigateTo}
          onShowDetail={openProblemDetail}
          onShowNotes={openNotes}
          onWidthChange={setSidebarWidth}
        />
        <main className="main-content">
          {activeTab?.isCrashed ? (
            <div className="browser-crash-state" role="alert" data-testid="browser-crash-state">
              <Icon name="refresh" size={28} />
              <h1>此页面已停止运行</h1>
              <p>标签仍然保留。重新加载后会尝试恢复当前地址。</p>
              <div className="browser-crash-actions">
                <Button variant="primary" icon="refresh" onClick={handleReloadActiveTab}>重新加载</Button>
                <Button variant="ghost" onClick={handleCloseActiveTab}>关闭标签</Button>
              </div>
            </div>
          ) : isHome ? (
            <HomePage onNavigate={navigateTo} />
          ) : null}
        </main>
      </div>

      {showSettings && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeSettings} size="compact">
          <Suspense fallback={<ModalLoading />}>
            <SettingsPage onClose={closeSettings} />
          </Suspense>
        </ModalLayer>
      )}
      {showDashboard && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeDashboard}>
          <Suspense fallback={<ModalLoading />}>
            <Dashboard
              onClose={closeDashboard}
              onNavigate={(targetUrl) => { closeDashboard(); navigateTo(targetUrl) }}
            />
          </Suspense>
        </ModalLayer>
      )}
      {showScripts && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeScripts}>
          <Suspense fallback={<ModalLoading />}>
            <UserScriptManager onClose={closeScripts} />
          </Suspense>
        </ModalLayer>
      )}
      {showCoachMetrics && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeCoachMetrics}>
          <Suspense fallback={<ModalLoading />}>
            <CoachMetricsView onClose={closeCoachMetrics} />
          </Suspense>
        </ModalLayer>
      )}
      {selectedProblemId && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeProblemDetail} size="compact">
          <Suspense fallback={<ModalLoading />}>
            <ProblemDetail problemId={selectedProblemId} onClose={closeProblemDetail} />
          </Suspense>
        </ModalLayer>
      )}
      {notesProblemId && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeNotes} size="large">
          <Suspense fallback={<ModalLoading />}>
            <NotePanelModal problemId={notesProblemId} onClose={closeNotes} />
          </Suspense>
        </ModalLayer>
      )}
    </div>
    </ErrorBoundary>
  )
}

export default App
