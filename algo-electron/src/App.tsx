import { useState, useEffect } from 'react'
import { ProblemSidebar } from './features/problems/ProblemSidebar'
import { SettingsPage } from './features/settings/SettingsPage'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

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

  return (
    <div className="app-layout">
      <div className="toolbar">
        <button className="nav-btn" onClick={() => window.electronAPI.goBack()} title="后退">
          ←
        </button>
        <button className="nav-btn" onClick={() => window.electronAPI.goForward()} title="前进">
          →
        </button>
        <button className="nav-btn" onClick={() => window.electronAPI.reload()} title="刷新">
          ↻
        </button>
        <input
          className="url-input"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入网址..."
        />
        <button className="go-btn" onClick={handleNavigate}>
          前往
        </button>
        <button className="sync-btn" onClick={handleSyncPage} title="抓取当前页面提交记录">
          ↗
        </button>
        {syncMsg && <span className="sync-msg">{syncMsg}</span>}
        <button className="settings-btn" onClick={() => setShowSettings(true)} title="设置">
          ⚙
        </button>
      </div>
      <div className="content-area">
        <ProblemSidebar />
      </div>
      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export default App
