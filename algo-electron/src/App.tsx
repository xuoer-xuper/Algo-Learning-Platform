import { useState, useEffect } from 'react'
import { ProblemSidebar } from './features/problems/ProblemSidebar'
import { SettingsPage } from './features/settings/SettingsPage'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [showSettings, setShowSettings] = useState(false)

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
