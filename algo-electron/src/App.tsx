import { lazy, Suspense } from 'react'
import { HomePage } from './features/home/HomePage'
import { ProblemSidebar } from './features/problems/ProblemSidebar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { WindowControls } from './components/WindowControls'
import { ModalLayer } from './components/ModalLayer'
import { TabBar } from './components/TabBar'
import { BrowserToolbar } from './components/BrowserToolbar'
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

  return (
    <ErrorBoundary>
      <div className="app-layout">
      <div className="titlebar-layer">
        <TabBar onTabUrlChange={applyUrlState} />
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
      <div className="content-area">
        <ProblemSidebar
          onNavigate={navigateTo}
          onShowDetail={openProblemDetail}
          onShowNotes={openNotes}
          onWidthChange={setSidebarWidth}
        />
        <main className="main-content">
          {isHome && <HomePage onNavigate={navigateTo} />}
        </main>
      </div>

      {showSettings && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeSettings}>
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
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeProblemDetail}>
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
