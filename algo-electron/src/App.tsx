import { useState, useEffect } from 'react'
import { HomePage } from './features/home/HomePage'
import { ProblemSidebar } from './features/problems/ProblemSidebar'
import { ProblemDetail } from './features/problems/ProblemDetail'
import { NotePanelModal } from './features/problems/NotePanelModal'
import { SettingsPage } from './features/settings/SettingsPage'
import { Dashboard } from './features/analytics/Dashboard'
import { UserScriptManager } from './features/scripts/UserScriptManager'
import { ErrorBoundary } from './components/ErrorBoundary'
import { WindowControls } from './components/WindowControls'
import { ModalLayer } from './components/ModalLayer'
import { TabBar } from './components/TabBar'
import { BrowserToolbar } from './components/BrowserToolbar'
import { useAppModalState } from './hooks/useAppModalState'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [syncMsg, setSyncMsg] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(220)
  const [isHome, setIsHome] = useState(true)
  const {
    showSettings,
    showDashboard,
    showScripts,
    selectedProblemId,
    notesProblemId,
    modalBackdrop,
    openSettings,
    closeSettings,
    openDashboard,
    closeDashboard,
    openScripts,
    closeScripts,
    openProblemDetail,
    closeProblemDetail,
    openNotes,
    closeNotes,
  } = useAppModalState({ isHome })

  useEffect(() => {
    const unsubscribe = window.electronAPI.onUrlChanged((newUrl: string) => {
      setUrl(newUrl)
      setIsHome(!newUrl || newUrl === 'about:blank')
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (isHome) {
      window.electronAPI.hideView()
    } else if (!modalBackdrop) {
      window.electronAPI.showView()
    }
  }, [isHome, modalBackdrop])

  useEffect(() => {
    window.electronAPI.setSidebarWidth(sidebarWidth)
  }, [sidebarWidth])

  const handleNavigate = () => {
    let target = url.trim()
    if (!target) return
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target
    }
    window.electronAPI.navigate(target)
    setIsHome(false)
  }

  const handleSyncPage = async () => {
    setSyncMsg('同步中...')
    const result = await window.electronAPI.syncCurrentPage()
    if (result.error) setSyncMsg(result.error)
    else setSyncMsg(`已同步 ${result.inserted} 条`)
    setTimeout(() => setSyncMsg(''), 4000)
  }

  return (
    <ErrorBoundary>
      <div className="app-layout">
      <div className="titlebar-layer">
        <TabBar onTabUrlChange={(newUrl) => { setUrl(newUrl); setIsHome(!newUrl || newUrl === 'about:blank') }} />
        <WindowControls />
      </div>
      <BrowserToolbar
        url={url}
        syncMsg={syncMsg}
        onUrlChange={setUrl}
        onNavigate={handleNavigate}
        onHome={() => { window.electronAPI.goHome(); setUrl(''); setIsHome(true) }}
        onBack={() => window.electronAPI.goBack()}
        onForward={() => window.electronAPI.goForward()}
        onReload={() => window.electronAPI.reload()}
        onSyncPage={handleSyncPage}
        onOpenDashboard={openDashboard}
        onOpenScripts={openScripts}
        onOpenSettings={openSettings}
      />
      <div className="content-area">
        <ProblemSidebar
          onNavigate={(targetUrl) => { window.electronAPI.navigate(targetUrl); setIsHome(false) }}
          onShowDetail={openProblemDetail}
          onShowNotes={openNotes}
          onWidthChange={setSidebarWidth}
        />
        <main className="flex-1 overflow-auto bg-white p-4">
          {isHome && <HomePage onNavigate={(targetUrl) => { window.electronAPI.navigate(targetUrl); setIsHome(false) }} />}
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
            onNavigate={(targetUrl) => { closeDashboard(); window.electronAPI.navigate(targetUrl); setIsHome(false) }}
          />
        </ModalLayer>
      )}
      {showScripts && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeScripts}>
          <UserScriptManager onClose={closeScripts} />
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
