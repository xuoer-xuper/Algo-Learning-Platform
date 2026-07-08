import type { KeyboardEvent } from 'react'

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
      <button className="nav-btn" onClick={onHome} title="首页">⌂</button>
      <button className="nav-btn" onClick={onBack} title="后退">←</button>
      <button className="nav-btn" onClick={onForward} title="前进">→</button>
      <button className="nav-btn" onClick={onReload} title="刷新">↻</button>
      <input
        className="url-input"
        type="text"
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入网址..."
      />
      <button className="go-btn" onClick={onNavigate}>前往</button>
      <button className="sync-btn" onClick={onSyncPage} title="抓取当前页面提交记录">↗</button>
      {syncMsg && <span className="sync-msg">{syncMsg}</span>}
      <button className="settings-btn" onClick={onOpenDashboard} title="统计">📊</button>
      <button
        className="settings-btn flex justify-center items-center"
        onClick={onOpenCoachMetrics}
        title="Coach 干预效果指标"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="7" width="16" height="12" rx="3" />
          <circle cx="9" cy="13" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="15" cy="13" r="1.2" fill="currentColor" stroke="none" />
          <path d="M12 3v4" />
          <circle cx="12" cy="2.5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <button className="settings-btn flex justify-center items-center" onClick={onOpenScripts} title="脚本管理">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>
      <button className="settings-btn" onClick={onOpenSettings} title="设置">⚙</button>
    </div>
  )
}
