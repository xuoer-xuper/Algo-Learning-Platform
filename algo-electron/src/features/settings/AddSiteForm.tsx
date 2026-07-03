import type { NewSiteDraft } from './siteManagementTypes'

interface AddSiteFormProps {
  draft: NewSiteDraft
  error: string
  onChange: (patch: Partial<NewSiteDraft>) => void
  onSave: () => void
  onCancel: () => void
}

export function AddSiteForm({
  draft,
  error,
  onChange,
  onSave,
  onCancel,
}: AddSiteFormProps) {
  return (
    <div className="import-preview" style={{ marginBottom: '8px' }}>
      <h4 className="import-preview-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '10px' }}>
        添加自定义站点
      </h4>
      <div className="import-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="settings-input"
            placeholder="站点 ID (必填, 例: hdu)"
            value={draft.id}
            onChange={(e) => onChange({ id: e.target.value })}
            style={{ flex: 1 }}
          />
          <input
            type="text"
            className="settings-input"
            placeholder="站点名称 (必填, 例: HDU OJ)"
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            style={{ flex: 1.5 }}
          />
        </div>
        <input
          type="text"
          className="settings-input"
          placeholder="首页 URL (必填, 例: https://acm.hdu.edu.cn)"
          value={draft.homeUrl}
          onChange={(e) => onChange({ homeUrl: e.target.value })}
        />
        <input
          type="text"
          className="settings-input"
          placeholder="匹配域名 (必填, 多个以逗号分隔, 例: acm.hdu.edu.cn)"
          value={draft.domains}
          onChange={(e) => onChange({ domains: e.target.value })}
        />
        <input
          type="text"
          className="settings-input"
          placeholder="题目 URL 识别规则 (可选, 多个以逗号分隔, 例: /showproblem.php?pid={id})"
          value={draft.patterns}
          onChange={(e) => onChange({ patterns: e.target.value })}
        />
        {error && (
          <div style={{ color: 'var(--error)', fontSize: '11px', paddingLeft: '4px' }}>
            {error}
          </div>
        )}
      </div>
      <div className="import-actions" style={{ display: 'flex', gap: '8px' }}>
        <button className="settings-save-btn" onClick={onSave}>
          确定保存
        </button>
        <button
          className="site-toggle"
          style={{ height: '32px', padding: '0 16px', fontSize: '13px' }}
          onClick={onCancel}
        >
          取消
        </button>
      </div>
    </div>
  )
}
