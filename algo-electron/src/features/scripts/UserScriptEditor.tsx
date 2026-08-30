import { Button, Input, Textarea } from '../../components/ui'
import type { ScriptSite, UserScriptRecord } from './types'

interface UserScriptEditorProps {
  script: UserScriptRecord
  sites: ScriptSite[]
  editName: string
  selectedSiteIds: string[]
  code: string | null
  codeNotice: string
  codeLoading: boolean
  errorMsg: string
  onEditNameChange: (value: string) => void
  onToggleSite: (siteId: string) => void
  onCancel: () => void
  onSave: () => void
  onOpenFolder: () => void
  onOpenEditor: () => void
}

export function UserScriptEditor({
  script,
  sites,
  editName,
  selectedSiteIds,
  code,
  codeNotice,
  codeLoading,
  errorMsg,
  onEditNameChange,
  onToggleSite,
  onCancel,
  onSave,
  onOpenFolder,
  onOpenEditor,
}: UserScriptEditorProps) {
  return (
    <div className="scripts-body">
      <div className="scripts-editor-head">
        <h3 className="scripts-editor-title">配置脚本: {editName}</h3>
        <div className="scripts-editor-actions">
          <Button variant="ghost" onClick={onCancel}>取消</Button>
          <Button variant="primary" icon="check" onClick={onSave}>保存设置</Button>
        </div>
      </div>

      {errorMsg && <div className="scripts-error">{errorMsg}</div>}

      <div className="scripts-form">
        <div className="scripts-field">
          <label className="scripts-label" htmlFor="scripts-name-input">脚本名称</label>
          <Input
            id="scripts-name-input"
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
          />
        </div>

        <div className="scripts-field">
          <label className="scripts-label" htmlFor="scripts-path-input">脚本来源</label>
          <div className="scripts-path-row">
            <Input
              id="scripts-path-input"
              className="scripts-path-input mono"
              value={script.has_file ? '本地托管脚本' : '数据库托管脚本'}
              readOnly
            />
            {script.has_file && <Button variant="secondary" icon="external" onClick={onOpenFolder}>打开目录</Button>}
            {script.has_file && <Button variant="secondary" icon="edit" onClick={onOpenEditor}>系统编辑器</Button>}
          </div>
        </div>

        <div className="scripts-field">
          <label className="scripts-label" htmlFor="scripts-code-view">脚本源码（只读）</label>
          {codeNotice && <span className="scripts-field-hint">{codeNotice}</span>}
          <Textarea
            id="scripts-code-view"
            className="mono"
            value={codeLoading ? '正在读取源码...' : (code ?? '')}
            readOnly
            rows={12}
            spellCheck={false}
          />
        </div>

        <div className="scripts-field">
          <span className="scripts-label">应用站点</span>
          <span className="scripts-field-hint">勾选后将自动覆盖脚本内置的 @match 规则；不勾选则按脚本自带规则注入。</span>
          <div className="scripts-site-grid">
            {sites.map((site) => (
              <label
                key={site.id}
                className={selectedSiteIds.includes(site.id) ? 'scripts-site-item scripts-site-item-on' : 'scripts-site-item'}
              >
                <input
                  type="checkbox"
                  className="scripts-check"
                  checked={selectedSiteIds.includes(site.id)}
                  onChange={() => onToggleSite(site.id)}
                />
                <span className="scripts-site-meta">
                  <span className="scripts-site-name">{site.name || site.id}</span>
                  {Boolean(site.homeUrl) && <span className="scripts-site-url">{site.homeUrl}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
