import { useState, useEffect } from 'react'
import { HomePage } from './features/home/HomePage'
import { ProblemSidebar } from './features/problems/ProblemSidebar'
import { ProblemDetail } from './features/problems/ProblemDetail'
import { SettingsPage } from './features/settings/SettingsPage'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null)
  const [syncMsg, setSyncMsg] = useState('')
  const [debugInfo, setDebugInfo] = useState('')

  useEffect(() => {
    const unsubscribe = window.electronAPI.onUrlChanged((newUrl: string) => {
      setUrl(newUrl)
    })
    return unsubscribe
  }, [])

  const handleNavigate = () => {
    let target = url.trim()
    if (!target) return
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target
    }
    window.electronAPI.navigate(target)
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

  const handleDebug = async () => {
    const data = await window.electronAPI.debugPageStructure()
    setDebugInfo(JSON.stringify(data, null, 2))
  }

  const hasUrl = url && url !== 'about:blank'

  return (
    <div className="app-layout">
      <div className="toolbar">
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
        <button className="debug-btn" onClick={handleDebug} title="调试页面结构">🔍</button>
        {syncMsg && <span className="sync-msg">{syncMsg}</span>}
        <button className="settings-btn" onClick={() => setShowSettings(true)} title="设置">⚙</button>
      </div>
      <div className="content-area">
        <ProblemSidebar onSelectProblem={setSelectedProblemId} />
        <div className="main-area">
          {!hasUrl && <HomePage />}
        </div>
      </div>

      {/* 浮窗弹层 */}
      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <SettingsPage onClose={() => setShowSettings(false)} />
          </div>
        </div>
      )}
      {selectedProblemId && (
        <div className="modal-backdrop" onClick={() => setSelectedProblemId(null)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <ProblemDetail problemId={selectedProblemId} onClose={() => setSelectedProblemId(null)} />
          </div>
        </div>
      )}
      {debugInfo && (
        <div className="modal-backdrop" onClick={() => setDebugInfo('')}>
          <div className="modal-panel modal-wide" onClick={e => e.stopPropagation()}>
            <div className="settings-header">
              <span className="settings-title">页面结构调试</span>
              <button className="settings-close" onClick={() => setDebugInfo('')}>✕</button>
            </div>
            <textarea className="debug-textarea" value={debugInfo} readOnly onClick={e => (e.target as HTMLTextAreaElement).select()} />
            <div className="debug-hint">点击文本框可全选复制</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
