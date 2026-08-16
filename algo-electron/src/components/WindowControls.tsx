import { useEffect, useState } from 'react'
import {
  closeAppWindow,
  loadWindowMaximized,
  minimizeAppWindow,
  subscribeWindowMaximized,
  toggleAppWindowMaximized,
} from './windowApi'
import { Icon } from './ui'

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
        <Icon name="minimize" size={13} strokeWidth={1.6} />
      </button>
      <button
        type="button"
        className="window-control-btn"
        onClick={toggleAppWindowMaximized}
        title={maximized ? '还原' : '最大化'}
        aria-label={maximized ? '还原' : '最大化'}
      >
        <Icon name={maximized ? 'restore' : 'maximize'} size={12} strokeWidth={1.6} />
      </button>
      <button
        type="button"
        className="window-control-btn window-control-close"
        onClick={closeAppWindow}
        title="关闭"
        aria-label="关闭"
      >
        <Icon name="close" size={13} strokeWidth={1.6} />
      </button>
    </div>
  )
}
