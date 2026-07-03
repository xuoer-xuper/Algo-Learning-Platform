import { useEffect, useRef, useState } from 'react'

export function DefaultHomePanel() {
  const [homeUrl, setHomeUrl] = useState('')
  const [saved, setSaved] = useState(false)
  const savedTimerRef = useRef<number | undefined>()

  useEffect(() => {
    window.electronAPI.getDefaultHomeUrl().then(setHomeUrl)
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
    }
  }, [])

  const handleSave = () => {
    let url = homeUrl.trim()
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }
    window.electronAPI.setDefaultHomeUrl(url)
    setHomeUrl(url)
    setSaved(true)

    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
    savedTimerRef.current = window.setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">默认首页</h3>
      <div className="settings-row">
        <input
          className="settings-input"
          type="text"
          value={homeUrl}
          onChange={(e) => setHomeUrl(e.target.value)}
          placeholder="https://codeforces.com"
        />
        <button className="settings-save-btn" onClick={handleSave}>
          {saved ? '已保存' : '保存'}
        </button>
      </div>
    </div>
  )
}
