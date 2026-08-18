import type { MouseEvent, RefObject } from 'react'
import { showBrowserAppMenu } from '../hooks/browserShellApi'
import { Omnibox } from './Omnibox'
import type { OmniboxController } from './useOmnibox'
import { Icon } from './ui'

interface BrowserToolbarProps {
  omnibox: OmniboxController
  omniboxInputRef: RefObject<HTMLInputElement | null>
  syncMsg: string
  onHome: () => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onSyncPage: () => void
}

export function BrowserToolbar({
  omnibox,
  omniboxInputRef,
  syncMsg,
  onHome,
  onBack,
  onForward,
  onReload,
  onSyncPage,
}: BrowserToolbarProps) {
  const handleShowAppMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    showBrowserAppMenu({
      x: Math.round(bounds.left),
      y: Math.round(bounds.bottom),
    })
  }

  return (
    <div className="toolbar">
      <button className="nav-btn" onClick={onHome} title="首页" aria-label="首页">
        <Icon name="home" />
      </button>
      <button className="nav-btn" onClick={onBack} title="后退" aria-label="后退">
        <Icon name="arrow-left" />
      </button>
      <button className="nav-btn" onClick={onForward} title="前进" aria-label="前进">
        <Icon name="arrow-right" />
      </button>
      <button className="nav-btn" onClick={onReload} title="刷新" aria-label="刷新">
        <Icon name="refresh" size={15} />
      </button>
      <Omnibox controller={omnibox} inputRef={omniboxInputRef} />
      <div className="toolbar-divider" />
      <button className="sync-btn" onClick={onSyncPage} title="抓取当前页面提交记录" aria-label="抓取当前页面提交记录">
        <Icon name="capture" size={15} />
      </button>
      {syncMsg && <span className="sync-msg">{syncMsg}</span>}
      <button
        className="settings-btn"
        onClick={handleShowAppMenu}
        title="更多"
        aria-label="更多"
        aria-haspopup="menu"
      >
        <Icon name="more" />
      </button>
    </div>
  )
}
