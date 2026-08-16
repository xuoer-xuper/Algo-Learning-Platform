import type { KeyboardEvent } from 'react'
import { Icon } from './ui'

interface BrowserToolbarProps {
  url: string
  syncMsg: string
  onUrlChange: (url: string) => void
  onNavigate: () => void
  onHome: () => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onSyncPage: () => void
  onOpenDashboard: () => void
  onOpenScripts: () => void
  onOpenSettings: () => void
  onOpenCoachMetrics: () => void
}

export function BrowserToolbar({
  url,
  syncMsg,
  onUrlChange,
  onNavigate,
  onHome,
  onBack,
  onForward,
  onReload,
  onSyncPage,
  onOpenDashboard,
  onOpenScripts,
  onOpenSettings,
  onOpenCoachMetrics,
}: BrowserToolbarProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') onNavigate()
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
      <input
        className="url-input"
        type="text"
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入网址..."
      />
      <button className="go-btn" onClick={onNavigate}>前往</button>
      <div className="toolbar-divider" />
      <button className="sync-btn" onClick={onSyncPage} title="抓取当前页面提交记录" aria-label="抓取当前页面提交记录">
        <Icon name="capture" size={15} />
      </button>
      {syncMsg && <span className="sync-msg">{syncMsg}</span>}
      <button className="settings-btn" onClick={onOpenDashboard} title="统计" aria-label="统计">
        <Icon name="chart" />
      </button>
      <button className="settings-btn" onClick={onOpenCoachMetrics} title="Coach 干预效果指标" aria-label="Coach 干预效果指标">
        <Icon name="bot" />
      </button>
      <button className="settings-btn" onClick={onOpenScripts} title="脚本管理" aria-label="脚本管理">
        <Icon name="code" size={15} />
      </button>
      <button className="settings-btn" onClick={onOpenSettings} title="设置" aria-label="设置">
        <Icon name="settings" />
      </button>
    </div>
  )
}
