import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [url, setUrl] = useState('https://codeforces.com')

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
    </div>
  )
}

export default App
