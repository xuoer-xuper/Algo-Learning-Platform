import type { ImportPreview } from './siteManagementTypes'

interface ImportPreviewPanelProps {
  preview: ImportPreview
  overwriteIds: string[]
  onToggleOverwrite: (id: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export function ImportPreviewPanel({
  preview,
  overwriteIds,
  onToggleOverwrite,
  onConfirm,
  onCancel,
}: ImportPreviewPanelProps) {
  return (
    <div className="import-preview">
      <h4 className="import-preview-title">导入预览</h4>
      {preview.newSites.length > 0 && (
        <div className="import-group">
          <div className="import-group-label">新增站点 ({preview.newSites.length})</div>
          {preview.newSites.map((site) => (
            <div key={site.id} className="import-item">
              <span className="site-name">{site.name}</span>
              <span className="site-domains">{site.domains.join(', ')}</span>
            </div>
          ))}
        </div>
      )}
      {preview.conflicts.length > 0 && (
        <div className="import-group">
          <div className="import-group-label">冲突站点 (勾选覆盖)</div>
          {preview.conflicts.map((conflict) => (
            <div key={conflict.id} className="import-item import-conflict">
              <label className="import-checkbox-label">
                <input
                  type="checkbox"
                  checked={overwriteIds.includes(conflict.id)}
                  onChange={() => onToggleOverwrite(conflict.id)}
                />
                <span className="site-name">{conflict.name}</span>
                <span className="site-domains">{conflict.domains.join(', ')}</span>
              </label>
            </div>
          ))}
        </div>
      )}
      {preview.builtinSkipped.length > 0 && (
        <div className="import-group">
          <div className="import-group-label">内置站点 (跳过)</div>
          {preview.builtinSkipped.map((site) => (
            <div key={site.id} className="import-item import-skipped">
              <span className="site-name">{site.name}</span>
              <span className="site-domains">{site.domains.join(', ')}</span>
            </div>
          ))}
        </div>
      )}
      <div className="import-actions">
        <button className="settings-save-btn" onClick={onConfirm}>
          确认导入
        </button>
        <button className="settings-close" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}
