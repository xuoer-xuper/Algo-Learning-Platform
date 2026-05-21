import { useState, useEffect, useCallback } from 'react'
import { HomePage } from './features/home/HomePage'
import { ProblemSidebar } from './features/problems/ProblemSidebar'
import { ProblemDetail } from './features/problems/ProblemDetail'
import { SettingsPage } from './features/settings/SettingsPage'
import { Dashboard } from './features/analytics/Dashboard'
import { WindowControls } from './components/WindowControls'
import { ModalLayer } from './components/ModalLayer'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null)
  const [syncMsg, setSyncMsg] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(220)
  const [isHome, setIsHome] = useState(true)
  const [modalBackdrop, setModalBackdrop] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = window.electronAPI.onUrlChanged((newUrl: string) => {
      setUrl(newUrl)
      setIsHome(!newUrl || newUrl === 'about:blank')
    })
    return unsubscribe
  }, [])

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNavigate()
  }

  const handleSyncPage = async () => {
    setSyncMsg('同步中...')
    const result = await window.electronAPI.syncCurrentPage()
    if (result.error) setSyncMsg(result.error)
    else setSyncMsg(`已同步 ${result.inserted} 条`)
    setTimeout(() => setSyncMsg(''), 4000)
  }

  const openModal = useCallback(async () => {
    if (!isHome) {
      const preview = await window.electronAPI.captureBrowserPreview()
      setModalBackdrop(preview)
      window.electronAPI.hideBrowserView()
    } else {
      setModalBackdrop(null)
    }
  }, [isHome])

  const closeModal = useCallback(() => {
    setModalBackdrop(null)
    if (!isHome) {
      window.electronAPI.showBrowserView()
    }
  }, [isHome])

  const closeSettings = () => {
    closeModal()
    setShowSettings(false)
  }

  const closeProblemDetail = () => {
    closeModal()
    setSelectedProblemId(null)
  }

  const closeDashboard = () => {
    closeModal()
    setShowDashboard(false)
  }

  return (
    <div className="app-layout">
      <div className="toolbar toolbar-drag">
        <button className="nav-btn" onClick={() => { window.electronAPI.goHome(); setUrl(''); setIsHome(true) }} title="首页">⌂</button>
        <button className="nav-btn" onClick={() => window.electronAPI.goBack()} title="后退">←</button>
        <button className="nav-btn" onClick={() => window.electronAPI.goForward()} title="前进">→</button>
        <button className="nav-btn" onClick={() => window.electronAPI.reload()} title="刷新">↻</button>
        <input
          className="url-input"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入网址..."
        />
        <button className="go-btn" onClick={handleNavigate}>前往</button>
        <button className="sync-btn" onClick={handleSyncPage} title="抓取当前页面提交记录">↗</button>
        {syncMsg && <span className="sync-msg">{syncMsg}</span>}
        <button className="settings-btn" onClick={async () => { await openModal(); setShowDashboard(true) }} title="统计">📊</button>
        <button className="settings-btn" onClick={async () => { await openModal(); setShowSettings(true) }} title="设置">⚙</button>
        <WindowControls />
      </div>
      <div className="content-area">
        <ProblemSidebar
          onNavigate={(targetUrl) => { window.electronAPI.navigate(targetUrl); setIsHome(false) }}
          onShowDetail={async (id) => { await openModal(); setSelectedProblemId(id) }}
          onWidthChange={setSidebarWidth}
        />
        <div className="main-area">
          {isHome && <HomePage onNavigate={(targetUrl) => { window.electronAPI.navigate(targetUrl); setIsHome(false) }} />}
        </div>
      </div>

      {showSettings && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeSettings}>
          <SettingsPage onClose={closeSettings} />
        </ModalLayer>
      )}
      {showDashboard && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeDashboard}>
          <Dashboard onClose={closeDashboard} />
        </ModalLayer>
      )}
      {selectedProblemId && (
        <ModalLayer backdrop={modalBackdrop} sidebarWidth={sidebarWidth} onClose={closeProblemDetail}>
          <ProblemDetail problemId={selectedProblemId} onClose={closeProblemDetail} />
        </ModalLayer>
      )}
    </div>
  )
}

export default App
