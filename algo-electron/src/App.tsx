import { HomePage } from './features/home/HomePage'
import { ProblemSidebar } from './features/problems/ProblemSidebar'
import { ProblemDetail } from './features/problems/ProblemDetail'
import { NotePanelModal } from './features/problems/NotePanelModal'
import { SettingsPage } from './features/settings/SettingsPage'
import { Dashboard } from './features/analytics/Dashboard'
import { UserScriptManager } from './features/scripts/UserScriptManager'
import { CoachMetricsView } from './features/coach/CoachMetricsView'
import { ErrorBoundary } from './components/ErrorBoundary'
import { WindowControls } from './components/WindowControls'
import { ModalLayer } from './components/ModalLayer'
import { TabBar } from './components/TabBar'
import { BrowserToolbar } from './components/BrowserToolbar'
import { useAppModalState } from './hooks/useAppModalState'
import { useBrowserNavigation } from './hooks/useBrowserNavigation'
import { useBrowserViewVisibility } from './hooks/useBrowserViewVisibility'
import './App.css'

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
          <SettingsPage onClose={closeSettings} />
        </ModalLayer>
      )}
      {showDashboard && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeDashboard}>
          <Dashboard
            onClose={closeDashboard}
            onNavigate={(targetUrl) => { closeDashboard(); navigateTo(targetUrl) }}
          />
        </ModalLayer>
      )}
      {showScripts && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeScripts}>
          <UserScriptManager onClose={closeScripts} />
        </ModalLayer>
      )}
      {showCoachMetrics && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeCoachMetrics}>
          <CoachMetricsView onClose={closeCoachMetrics} />
        </ModalLayer>
      )}
      {selectedProblemId && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeProblemDetail}>
          <ProblemDetail problemId={selectedProblemId} onClose={closeProblemDetail} />
        </ModalLayer>
      )}
      {notesProblemId && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeNotes} size="large">
          <NotePanelModal problemId={notesProblemId} onClose={closeNotes} />
        </ModalLayer>
      )}
    </div>
    </ErrorBoundary>
  )
}

export default App
