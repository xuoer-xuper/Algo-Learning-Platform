import { Button, Icon, IconButton } from '../../components/ui'
import type { ScriptSite, UserScriptRecord } from './types'

interface UserScriptListProps {
  scripts: UserScriptRecord[]
  sites: ScriptSite[]
  errorMsg: string
  updateMsg: string
  checkingUpdates: boolean
  onImport: () => void
  onCheckUpdates: () => void
  onOpenFolder: () => void
  onToggle: (id: string, enabled: boolean) => void
  onEdit: (script: UserScriptRecord) => void
  onDelete: (id: string) => void
}

function formatSelectedSites(script: UserScriptRecord, sites: ScriptSite[]) {
  try {
    const ids = JSON.parse(script.site_ids_json || '[]') as string[]
    if (ids.length > 0) {
      return ids.map((id) => sites.find(site => site.id === id)?.name || id).join(', ')
    }
    return '默认 (按内置 @match)'
  } catch {
    return '错误'
  }
}

export function UserScriptList({
  scripts,
  sites,
  errorMsg,
  updateMsg,
  checkingUpdates,
  onImport,
  onCheckUpdates,
  onOpenFolder,
  onToggle,
  onEdit,
  onDelete,
}: UserScriptListProps) {
  return (
    <div className="scripts-body">
      <div className="scripts-toolbar">
        <Button variant="primary" icon="plus" onClick={onImport}>导入本地脚本文件</Button>
        <Button variant="secondary" icon="refresh" disabled={checkingUpdates} onClick={onCheckUpdates}>
          {checkingUpdates ? '正在检查' : '检查更新'}
        </Button>
        <Button variant="secondary" icon="external" onClick={onOpenFolder}>打开脚本目录</Button>
      </div>

      {errorMsg && <div className="scripts-error">{errorMsg}</div>}
      {updateMsg && <div className="scripts-path" role="status">{updateMsg}</div>}

      <div className="scripts-table-wrap">
        <table className="scripts-table">
          <thead>
            <tr>
              <th className="scripts-col-status">状态</th>
              <th>名称</th>
              <th className="scripts-col-sites">应用站点</th>
              <th className="scripts-col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            {scripts.map((script) => {
              const selectedSitesText = formatSelectedSites(script, sites)

              return (
                <tr key={script.id} className={script.enabled ? 'scripts-row' : 'scripts-row scripts-row-off'}>
                  <td className="scripts-col-status">
                    <input
                      type="checkbox"
                      className="scripts-check"
                      checked={script.enabled}
                      onChange={(e) => onToggle(script.id, e.target.checked)}
                      title={script.enabled ? '停用脚本' : '启用脚本'}
                    />
                  </td>
                  <td>
                    <div className="scripts-name-cell">
                      <span className="scripts-dot" aria-hidden="true" />
                      <div className="scripts-name-text">
                        <span className="scripts-name">{script.name}</span>
                        {script.has_file && (
                          <span className="scripts-path">本地托管</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="scripts-sites" title={selectedSitesText}>
                    {selectedSitesText}
                  </td>
                  <td className="scripts-actions">
                    <Button size="sm" variant="ghost" icon="edit" onClick={() => onEdit(script)}>配置</Button>
                    <IconButton icon="trash" title="移除脚本" danger onClick={() => onDelete(script.id)} />
                  </td>
                </tr>
              )
            })}
            {scripts.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="ui-empty">
                    <Icon name="code" size={26} />
                    <div className="scripts-empty-title">还没有导入任何脚本</div>
                    <div className="scripts-empty-hint">
                      点击上方「导入本地脚本文件」选择 .js 用户脚本，导入后可绑定站点并随时启停；源文件统一存放在脚本目录中。
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
