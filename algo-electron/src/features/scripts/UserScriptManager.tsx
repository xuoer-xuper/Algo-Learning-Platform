import { useState, useEffect } from 'react'

export function UserScriptManager({ onClose }: { onClose: () => void }) {
  const [scripts, setScripts] = useState<Array<Record<string, unknown>>>([])
  const [sites, setSites] = useState<any[]>([])
  const [editingScript, setEditingScript] = useState<Record<string, unknown> | null>(null)
  const [editName, setEditName] = useState('')
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  const loadScripts = async () => {
    const [list, siteList] = await Promise.all([
      window.electronAPI.scriptsGetAll(),
      window.electronAPI.getAllSites()
    ])
    setScripts(list)
    setSites(siteList)
  }

  useEffect(() => {
    loadScripts()
  }, [])

  const handleEdit = (script: Record<string, unknown>) => {
    setEditingScript(script)
    setEditName(script.name as string)
    try {
      setSelectedSiteIds(JSON.parse((script.site_ids_json as string) || '[]'))
    } catch {
      setSelectedSiteIds([])
    }
    setErrorMsg('')
  }

  const handleImport = async () => {
    try {
      const id = await window.electronAPI.scriptsImportFile()
      if (id) {
        await loadScripts()
        const newScript = (await window.electronAPI.scriptsGetAll()).find((s: any) => s.id === id)
        if (newScript) {
          handleEdit(newScript)
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error) setErrorMsg(e.message)
      else setErrorMsg(String(e))
    }
  }

  const handleSave = async () => {
    try {
      if (!editingScript) return
      await window.electronAPI.scriptsSave(editingScript.id as string, {
        name: editName,
        site_ids_json: JSON.stringify(selectedSiteIds)
      })
      setEditingScript(null)
      loadScripts()
    } catch (e: unknown) {
      if (e instanceof Error) setErrorMsg(e.message)
      else setErrorMsg(String(e))
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    await window.electronAPI.scriptsToggle(id, enabled)
    loadScripts()
  }

  const handleDelete = async (id: string) => {
    if (confirm('确定删除该脚本吗？（不会删除本地源文件）')) {
      await window.electronAPI.scriptsDelete(id)
      loadScripts()
    }
  }

  const toggleSiteSelection = (siteId: string) => {
    if (selectedSiteIds.includes(siteId)) {
      setSelectedSiteIds(selectedSiteIds.filter(id => id !== siteId))
    } else {
      setSelectedSiteIds([...selectedSiteIds, siteId])
    }
  }

  return (
    <div className="bg-white shadow p-6 w-full mx-auto flex flex-col relative text-gray-800" style={{ borderRadius: '12px', maxWidth: '960px', maxHeight: '80vh' }}>
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600" title="关闭">✕</button>
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
        本地脚本管理
      </h2>

      {editingScript ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">配置脚本: {editName}</h3>
            <div className="space-x-2">
              <button onClick={() => setEditingScript(null)} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">取消</button>
              <button onClick={handleSave} className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600">保存设置</button>
            </div>
          </div>
          
          {errorMsg && <div className="text-red-500 mb-2">{errorMsg}</div>}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">脚本名称</label>
              <input 
                className="w-full border rounded p-2"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">脚本路径</label>
              <div className="flex items-center gap-2">
                <input 
                  className="w-full border rounded p-2 bg-gray-50 text-gray-500 text-sm"
                  value={String(editingScript.file_path || '（旧版存库脚本，无本地路径）')}
                  readOnly
                />
                {Boolean(editingScript.file_path) && (
                  <button 
                    onClick={() => window.electronAPI.scriptsOpenFolder()}
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
                      onChange={() => toggleSiteSelection(site.id)}
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
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="mb-4 flex gap-2">
            <button
              onClick={handleImport}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              导入本地脚本文件
            </button>
            <button
              onClick={() => window.electronAPI.scriptsOpenFolder()}
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
                {scripts.map(s => {
                  let selectedSitesText = ''
                  try {
                    const ids = JSON.parse((s.site_ids_json as string) || '[]')
                    if (ids.length > 0) {
                      selectedSitesText = ids.map((id: string) => sites.find(site => site.id === id)?.name || id).join(', ')
                    } else {
                      selectedSitesText = '默认 (按内置 @match)'
                    }
                  } catch {
                    selectedSitesText = '错误'
                  }

                  return (
                    <tr key={s.id as string} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={s.enabled as boolean}
                          onChange={(e) => handleToggle(s.id as string, e.target.checked)}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="p-3 font-medium">
                        <div className="flex flex-col">
                          <span>{String(s.name)}</span>
                          {Boolean(s.file_path) && <span className="text-xs text-gray-400 truncate" title={String(s.file_path)}>{String(s.file_path)}</span>}
                        </div>
                      </td>
                      <td className="p-3 text-sm text-gray-600 truncate max-w-[150px]" title={selectedSitesText}>
                        {String(selectedSitesText)}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button onClick={() => handleEdit(s)} className="text-blue-500 hover:text-blue-700 mr-3">配置</button>
                        <button onClick={() => handleDelete(s.id as string)} className="text-red-500 hover:text-red-700">移除</button>
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
      )}
    </div>
  )
}
