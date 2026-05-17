import { useEffect, useState } from 'react'

export function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.electronAPI.isWindowMaximized().then(setMaximized)
    return window.electronAPI.onWindowMaximized(setMaximized)
  }, [])

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-control-btn"
        onClick={() => window.electronAPI.minimizeWindow()}
        title="最小化"
        aria-label="最小化"
      >
        &#8212;
      </button>
      <button
        type="button"
        className="window-control-btn"
        onClick={() => window.electronAPI.maximizeWindow()}
        title={maximized ? '还原' : '最大化'}
        aria-label={maximized ? '还原' : '最大化'}
      >
        {maximized ? '\u2750' : '\u25A1'}
      </button>
      <button
        type="button"
        className="window-control-btn window-control-close"
        onClick={() => window.electronAPI.closeWindow()}
        title="关闭"
        aria-label="关闭"
      >
        &#10005;
      </button>
    </div>
  )
}
