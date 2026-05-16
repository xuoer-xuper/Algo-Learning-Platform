import { useState, useEffect } from 'react'

const PLATFORM_NAMES: Record<string, string> = {
  codeforces: 'Codeforces',
  acwing: 'AcWing',
  nowcoder: '牛客',
  vjudge: 'VJudge',
}

interface OverviewStats {
  totalProblems: number
  todayVisited: number
  platformDistribution: { platform: string; count: number }[]
  lastActiveTime: string | null
}

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [homeUrl, setHomeUrl] = useState('')
  const [saved, setSaved] = useState(false)
  const [cfHandle, setCfHandle] = useState('')
  const [syncStatus, setSyncStatus] = useState<Record<string, string>>({})

  useEffect(() => {
    window.electronAPI.getOverviewStats().then(setStats)
    window.electronAPI.getDefaultHomeUrl().then(setHomeUrl)
  }, [])

  const handleSyncCF = async () => {
    if (!cfHandle.trim()) { setSyncStatus((s) => ({ ...s, cf: '请输入 Handle' })); return }
    setSyncStatus((s) => ({ ...s, cf: '同步中...' }))
    try {
      const result = await window.electronAPI.syncCodeforces(cfHandle.trim())
      if (result.error) setSyncStatus((s) => ({ ...s, cf: `失败: ${result.error}` }))
      else { setSyncStatus((s) => ({ ...s, cf: `成功: ${result.fetched} 条，新增 ${result.inserted} 条` })); window.electronAPI.getOverviewStats().then(setStats) }
    } catch (e: any) { setSyncStatus((s) => ({ ...s, cf: `错误: ${e.message}` })) }
  }

  const handleSave = () => {
    let url = homeUrl.trim()
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }
    window.electronAPI.setDefaultHomeUrl(url)
    setHomeUrl(url)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
      <div className="settings-page">
        <div className="settings-header">
          <h2 className="settings-title">设置</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

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

        <div className="settings-section">
          <h3 className="settings-section-title">学习概览</h3>
          {stats ? (
            <div className="stats-grid">
              <div className="stats-card">
                <div className="stats-value">{stats.totalProblems}</div>
                <div className="stats-label">总题数</div>
              </div>
              <div className="stats-card">
                <div className="stats-value">{stats.todayVisited}</div>
                <div className="stats-label">今日访问</div>
              </div>
              <div className="stats-card stats-card-wide">
                <div className="stats-label">最近活跃</div>
                <div className="stats-value stats-value-sm">
                  {stats.lastActiveTime ? stats.lastActiveTime.replace('T', ' ').slice(0, 19) : '暂无'}
                </div>
              </div>
            </div>
          ) : (
            <div className="settings-empty">加载中...</div>
          )}
        </div>

        <div className="settings-section">
          <h3 className="settings-section-title">提交同步</h3>
          <div className="sync-row">
            <input className="settings-input" type="text" value={cfHandle} onChange={(e) => setCfHandle(e.target.value)} placeholder="Codeforces Handle" />
            <button className="settings-save-btn" onClick={handleSyncCF}>同步 CF</button>
          </div>
          {syncStatus.cf && <div className="sync-status">{syncStatus.cf}</div>}
          <div className="sync-hint">AcWing / 牛客 / VJudge：在浏览器打开提交页面后点工具栏 ↗ 抓取</div>
        </div>

        <div className="settings-section">
          <h3 className="settings-section-title">平台分布</h3>
          {stats && stats.platformDistribution.length > 0 ? (
            <div className="platform-list">
              {stats.platformDistribution.map((p) => (
                <div key={p.platform} className="platform-item">
                  <span className="platform-name">{PLATFORM_NAMES[p.platform] || p.platform}</span>
                  <span className="platform-count">{p.count} 题</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="settings-empty">暂无数据</div>
          )}
        </div>
      </div>
  )
}
