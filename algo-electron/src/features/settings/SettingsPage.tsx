import { useState, useEffect } from 'react'

const PLATFORM_NAMES: Record<string, string> = {
  codeforces: 'Codeforces',
  acwing: 'AcWing',
  nowcoder: '牛客',
  vjudge: 'VJudge',
  pta: 'PTA',
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
  const [ratingHandle, setRatingHandle] = useState('')
  const [ratingInfo, setRatingInfo] = useState<any>(null)
  const [ratingStatus, setRatingStatus] = useState('')
  const [syncStatus, setSyncStatus] = useState<Record<string, string>>({})
  const [sites, setSites] = useState<any[]>([])
  const [exportStatus, setExportStatus] = useState('')
  const [importPreview, setImportPreview] = useState<any>(null)
  const [importOverwriteIds, setImportOverwriteIds] = useState<string[]>([])
  const [importStatus, setImportStatus] = useState('')

  const loadSites = () => {
    window.electronAPI.getAllSites().then(setSites)
  }

  useEffect(() => {
    window.electronAPI.getOverviewStats().then(setStats)
    window.electronAPI.getDefaultHomeUrl().then(setHomeUrl)
    window.electronAPI.getAccounts('codeforces').then((accounts: any[]) => {
      if (accounts.length > 0) {
        const acc = accounts[0]
        setRatingHandle(acc.handle)
        setRatingInfo(acc)
      }
    })
    loadSites()
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

  const handleSyncRating = async () => {
    if (!ratingHandle.trim()) { setRatingStatus('请输入 Handle'); return }
    setRatingStatus('同步中...')
    try {
      await window.electronAPI.bindHandle('codeforces', ratingHandle.trim())
      const result = await window.electronAPI.syncCodeforcesRating(ratingHandle.trim())
      if (result.success) {
        setRatingStatus(`同步成功，peak: ${result.peak}`)
        const acc = await window.electronAPI.getAccount('codeforces', ratingHandle.trim())
        setRatingInfo(acc)
      } else {
        setRatingStatus(`失败: ${result.error}`)
      }
    } catch (e: any) {
      setRatingStatus(`错误: ${e.message}`)
    }
  }

  const handleToggleSite = async (id: string, enabled: boolean) => {
    await window.electronAPI.toggleSite(id, enabled)
    loadSites()
  }

  const handleDeleteSite = async (id: string) => {
    if (!confirm('确定删除该站点？')) return
    await window.electronAPI.deleteSite(id)
    loadSites()
  }

  const handleExport = async () => {
    setExportStatus('导出中...')
    try {
      const result = await window.electronAPI.exportSitesConfig()
      if (result.success) {
        setExportStatus(`已导出 ${result.count} 个站点`)
      } else {
        setExportStatus(result.error || '导出失败')
      }
    } catch (e: any) {
      setExportStatus(`错误: ${e.message}`)
    }
    setTimeout(() => setExportStatus(''), 3000)
  }

  const handleImport = async () => {
    setImportStatus('选择文件...')
    try {
      const result = await window.electronAPI.importSitesConfig()
      if (!result.success) {
        setImportStatus(result.error || '导入取消')
        setTimeout(() => setImportStatus(''), 3000)
        return
      }
      if (result.preview) {
        setImportPreview(result.preview)
        setImportOverwriteIds([])
        setImportStatus('')
      }
    } catch (e: any) {
      setImportStatus(`错误: ${e.message}`)
      setTimeout(() => setImportStatus(''), 3000)
    }
  }

  const handleConfirmImport = async () => {
    if (!importPreview) return
    const allSites = [...importPreview.newSites, ...importPreview.conflicts.map((c: any) => c.incoming)]
    try {
      const result = await window.electronAPI.confirmImportSites(allSites, importOverwriteIds)
      if (result.success) {
        setImportStatus(`导入完成: 新增 ${result.imported}，覆盖 ${result.overwritten}`)
        setImportPreview(null)
        setImportOverwriteIds([])
        loadSites()
      } else {
        setImportStatus(result.error || '导入失败')
      }
    } catch (e: any) {
      setImportStatus(`错误: ${e.message}`)
    }
    setTimeout(() => setImportStatus(''), 3000)
  }

  const toggleOverwrite = (id: string) => {
    setImportOverwriteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
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
          <h3 className="settings-section-title">Codeforces Rating</h3>
          <div className="sync-row">
            <input className="settings-input" type="text" value={ratingHandle} onChange={(e) => setRatingHandle(e.target.value)} placeholder="Codeforces Handle" />
            <button className="settings-save-btn" onClick={handleSyncRating}>同步 Rating</button>
          </div>
          {ratingStatus && <div className="sync-status">{ratingStatus}</div>}
          {ratingInfo && (
            <div className="rating-info">
              <span className="rating-current">当前: {ratingInfo.current_rating ?? '-'}</span>
              <span className="rating-peak">最高: {ratingInfo.peak_rating ?? '-'}</span>
            </div>
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
          <h3 className="settings-section-title">站点管理</h3>
          <div className="site-actions-bar">
            <button className="settings-save-btn" onClick={handleExport}>
              导出配置
            </button>
            <button className="settings-save-btn" onClick={handleImport}>
              导入配置
            </button>
          </div>
          {exportStatus && <div className="sync-status">{exportStatus}</div>}
          {importStatus && <div className="sync-status">{importStatus}</div>}
          {importPreview && (
            <div className="import-preview">
              <h4 className="import-preview-title">导入预览</h4>
              {importPreview.newSites.length > 0 && (
                <div className="import-group">
                  <div className="import-group-label">新增站点 ({importPreview.newSites.length})</div>
                  {importPreview.newSites.map((s: any) => (
                    <div key={s.id} className="import-item">
                      <span className="site-name">{s.name}</span>
                      <span className="site-domains">{s.domains.join(', ')}</span>
                    </div>
                  ))}
                </div>
              )}
              {importPreview.conflicts.length > 0 && (
                <div className="import-group">
                  <div className="import-group-label">冲突站点 (勾选覆盖)</div>
                  {importPreview.conflicts.map((c: any) => (
                    <div key={c.id} className="import-item import-conflict">
                      <label className="import-checkbox-label">
                        <input
                          type="checkbox"
                          checked={importOverwriteIds.includes(c.id)}
                          onChange={() => toggleOverwrite(c.id)}
                        />
                        <span className="site-name">{c.name}</span>
                        <span className="site-domains">{c.domains.join(', ')}</span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
              {importPreview.builtinSkipped.length > 0 && (
                <div className="import-group">
                  <div className="import-group-label">内置站点 (跳过)</div>
                  {importPreview.builtinSkipped.map((s: any) => (
                    <div key={s.id} className="import-item import-skipped">
                      <span className="site-name">{s.name}</span>
                      <span className="site-domains">{s.domains.join(', ')}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="import-actions">
                <button className="settings-save-btn" onClick={handleConfirmImport}>
                  确认导入
                </button>
                <button className="settings-close" onClick={() => { setImportPreview(null); setImportOverwriteIds([]) }}>
                  取消
                </button>
              </div>
            </div>
          )}
          <div className="site-list">
            {sites.map((s) => (
              <div key={s.id} className="site-item">
                <div className="site-info">
                  <span className="site-name">{s.name}</span>
                  <span className="site-domains">{s.domains.join(', ')}</span>
                </div>
                <div className="site-actions">
                  <button
                    className={`site-toggle ${s.enabled ? 'enabled' : ''}`}
                    onClick={() => handleToggleSite(s.id, !s.enabled)}
                  >
                    {s.enabled ? '已启用' : '已禁用'}
                  </button>
                  {!s.isBuiltin && (
                    <button className="site-delete" onClick={() => handleDeleteSite(s.id)}>删除</button>
                  )}
                </div>
              </div>
            ))}
          </div>
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
