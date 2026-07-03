import { useEffect, useState } from 'react'
import { AddSiteForm } from './AddSiteForm'
import { ImportPreviewPanel } from './ImportPreviewPanel'
import {
  confirmImportSites,
  createSiteFromDraft,
  deleteSiteConfig,
  exportSitesConfig,
  importSitesConfig,
  loadSiteById,
  loadSites as loadSiteConfigs,
  toggleSiteEnabled,
} from './settingsApi'
import type {
  ImportPreview,
  ImportPreviewSite,
  NewSiteDraft,
  SiteConfigView,
} from './siteManagementTypes'

const EMPTY_SITE_DRAFT: NewSiteDraft = {
  id: '',
  name: '',
  domains: '',
  homeUrl: '',
  patterns: '',
}

export function SiteManagementPanel() {
  const [sites, setSites] = useState<SiteConfigView[]>([])
  const [exportStatus, setExportStatus] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importOverwriteIds, setImportOverwriteIds] = useState<string[]>([])
  const [importStatus, setImportStatus] = useState('')

  const [showAddModal, setShowAddModal] = useState(false)
  const [newSiteDraft, setNewSiteDraft] = useState<NewSiteDraft>(EMPTY_SITE_DRAFT)
  const [newSiteError, setNewSiteError] = useState('')

  const loadSites = () => {
    loadSiteConfigs().then(setSites)
  }

  useEffect(() => {
    loadSites()
  }, [])

  const handleToggleSite = async (id: string, enabled: boolean) => {
    await toggleSiteEnabled(id, enabled)
    loadSites()
  }

  const handleDeleteSite = async (id: string) => {
    if (!confirm('确定删除该站点？')) return
    await deleteSiteConfig(id)
    loadSites()
  }

  const handleExport = async () => {
    setExportStatus('导出中...')
    try {
      const result = await exportSitesConfig()
      if (result.success) {
        setExportStatus(`已导出 ${result.count} 个站点`)
      } else {
        setExportStatus(result.error || '导出失败')
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      setExportStatus(`错误: ${message}`)
    }
    setTimeout(() => setExportStatus(''), 3000)
  }

  const handleImport = async () => {
    setImportStatus('选择文件...')
    try {
      const result = await importSitesConfig()
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      setImportStatus(`错误: ${message}`)
      setTimeout(() => setImportStatus(''), 3000)
    }
  }

  const resetAddSiteForm = () => {
    setNewSiteDraft(EMPTY_SITE_DRAFT)
    setNewSiteError('')
  }

  const handleConfirmImport = async () => {
    if (!importPreview) return
    const allSites: ImportPreviewSite[] = [...importPreview.newSites, ...importPreview.conflicts.map((c) => c.incoming)]
    try {
      const result = await confirmImportSites(allSites, importOverwriteIds)
      if (result.success) {
        setImportStatus(`导入完成: 新增 ${result.imported}，覆盖 ${result.overwritten}`)
        setImportPreview(null)
        setImportOverwriteIds([])
        loadSites()
      } else {
        setImportStatus(result.error || '导入失败')
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      setImportStatus(`错误: ${message}`)
    }
    setTimeout(() => setImportStatus(''), 3000)
  }

  const toggleOverwrite = (id: string) => {
    setImportOverwriteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleAddSite = async () => {
    setNewSiteError('')
    const id = newSiteDraft.id.trim().toLowerCase()
    const name = newSiteDraft.name.trim()
    const domainsStr = newSiteDraft.domains.trim()
    const homeUrlStr = newSiteDraft.homeUrl.trim()

    if (!id || !name || !domainsStr || !homeUrlStr) {
      setNewSiteError('请填写所有必填字段')
      return
    }

    if (!/^[a-z0-9_-]+$/.test(id)) {
      setNewSiteError('站点 ID 只能包含小写字母、数字、下划线和连字符')
      return
    }

    try {
      const existing = await loadSiteById(id)
      if (existing) {
        setNewSiteError('站点 ID 已存在')
        return
      }

      await createSiteFromDraft(id, name, newSiteDraft)

      resetAddSiteForm()
      setShowAddModal(false)
      loadSites()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      setNewSiteError(`保存失败: ${message}`)
    }
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">站点管理</h3>
      <div className="site-actions-bar">
        <button className="settings-save-btn" onClick={handleExport}>
          导出配置
        </button>
        <button className="settings-save-btn" onClick={handleImport}>
          导入配置
        </button>
        <button className="settings-save-btn" onClick={() => setShowAddModal(true)}>
          添加站点
        </button>
      </div>
      {exportStatus && <div className="sync-status">{exportStatus}</div>}
      {importStatus && <div className="sync-status">{importStatus}</div>}
      {showAddModal && (
        <AddSiteForm
          draft={newSiteDraft}
          error={newSiteError}
          onChange={(patch) => setNewSiteDraft((draft) => ({ ...draft, ...patch }))}
          onSave={handleAddSite}
          onCancel={() => {
            setShowAddModal(false)
            resetAddSiteForm()
          }}
        />
      )}
      {importPreview && (
        <ImportPreviewPanel
          preview={importPreview}
          overwriteIds={importOverwriteIds}
          onToggleOverwrite={toggleOverwrite}
          onConfirm={handleConfirmImport}
          onCancel={() => {
            setImportPreview(null)
            setImportOverwriteIds([])
          }}
        />
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
  )
}
