import type { ScriptSite, UserScriptRecord } from './types'

interface UserScriptListProps {
  scripts: UserScriptRecord[]
  sites: ScriptSite[]
  errorMsg: string
  onImport: () => void
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
  onImport,
  onOpenFolder,
  onToggle,
  onEdit,
  onDelete,
}: UserScriptListProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="mb-4 flex gap-2">
        <button
          onClick={onImport}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          导入本地脚本文件
        </button>
        <button
          onClick={onOpenFolder}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 flex items-center gap-2"
        >
          打开脚本目录
        </button>
      </div>

      {errorMsg && <div className="text-red-500 mb-2">{errorMsg}</div>}

      <div className="overflow-y-auto overflow-x-hidden flex-1 border rounded" style={{ borderRadius: '8px' }}>
        <table className="w-full text-left border-collapse table-fixed">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-3 border-b w-16 text-center whitespace-nowrap">状态</th>
              <th className="p-3 border-b whitespace-nowrap">名称</th>
              <th className="p-3 border-b w-56 whitespace-nowrap">应用站点</th>
              <th className="p-3 border-b w-40 text-right whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            {scripts.map((script) => {
              const selectedSitesText = formatSelectedSites(script, sites)

              return (
                <tr key={script.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={script.enabled}
                      onChange={(e) => onToggle(script.id, e.target.checked)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="p-3 font-medium">
                    <div className="flex flex-col">
                      <span>{script.name}</span>
                      {Boolean(script.file_path) && <span className="text-xs text-gray-400 truncate" title={String(script.file_path)}>{String(script.file_path)}</span>}
                    </div>
                  </td>
                  <td className="p-3 text-sm text-gray-600 truncate max-w-[150px]" title={selectedSitesText}>
                    {selectedSitesText}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button onClick={() => onEdit(script)} className="text-blue-500 hover:text-blue-700 mr-3">配置</button>
                    <button onClick={() => onDelete(script.id)} className="text-red-500 hover:text-red-700">移除</button>
                  </td>
                </tr>
              )
            })}
            {scripts.length === 0 && (
              <tr>
                <td colSpan={4} className="p-10 text-center text-gray-500">
                  暂无脚本，点击上方按钮导入你的 .js 脚本文件。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
