import type { ScriptSite, UserScriptRecord } from './types'

interface UserScriptEditorProps {
  script: UserScriptRecord
  sites: ScriptSite[]
  editName: string
  selectedSiteIds: string[]
  errorMsg: string
  onEditNameChange: (value: string) => void
  onToggleSite: (siteId: string) => void
  onCancel: () => void
  onSave: () => void
  onOpenFolder: () => void
}

export function UserScriptEditor({
  script,
  sites,
  editName,
  selectedSiteIds,
  errorMsg,
  onEditNameChange,
  onToggleSite,
  onCancel,
  onSave,
  onOpenFolder,
}: UserScriptEditorProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">配置脚本: {editName}</h3>
        <div className="space-x-2">
          <button onClick={onCancel} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">取消</button>
          <button onClick={onSave} className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600">保存设置</button>
        </div>
      </div>

      {errorMsg && <div className="text-red-500 mb-2">{errorMsg}</div>}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">脚本名称</label>
          <input
            className="w-full border rounded p-2"
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">脚本路径</label>
          <div className="flex items-center gap-2">
            <input
              className="w-full border rounded p-2 bg-gray-50 text-gray-500 text-sm"
              value={String(script.file_path || '（旧版存库脚本，无本地路径）')}
              readOnly
            />
            {Boolean(script.file_path) && (
              <button
                onClick={onOpenFolder}
                className="shrink-0 px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm"
              >
                打开目录
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">选择应用该脚本的站点（勾选后将自动覆盖原始 @match 规则）</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {sites.map((site) => (
              <label key={site.id} className="flex items-center gap-2 p-3 border rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  className="cursor-pointer"
                  checked={selectedSiteIds.includes(site.id)}
                  onChange={() => onToggleSite(site.id)}
                />
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{site.name || site.id}</span>
                  <span className="text-xs text-gray-500 truncate max-w-[120px]">{site.home_url}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
