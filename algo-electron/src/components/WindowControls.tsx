import { useEffect, useState } from 'react'
import {
  closeAppWindow,
  loadWindowMaximized,
  minimizeAppWindow,
  subscribeWindowMaximized,
  toggleAppWindowMaximized,
} from './windowApi'

export function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    loadWindowMaximized().then(setMaximized)
    return subscribeWindowMaximized(setMaximized)
  }, [])

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-control-btn"
        onClick={minimizeAppWindow}
        title="最小化"
        aria-label="最小化"
      >
        &#8212;
      </button>
      <button
        type="button"
        className="window-control-btn"
        onClick={toggleAppWindowMaximized}
        title={maximized ? '还原' : '最大化'}
        aria-label={maximized ? '还原' : '最大化'}
      >
        {maximized ? '\u2750' : '\u25A1'}
      </button>
      <button
        type="button"
        className="window-control-btn window-control-close"
        onClick={closeAppWindow}
        title="关闭"
        aria-label="关闭"
      >
        &#10005;
      </button>
    </div>
  )
}
