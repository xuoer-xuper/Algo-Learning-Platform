import { useState, useEffect } from 'react'
import { UserScriptEditor } from './UserScriptEditor'
import { UserScriptList } from './UserScriptList'
import {
  deleteUserScript,
  importUserScriptFile,
  loadUserScriptManagerData,
  openUserScriptsFolder,
  saveUserScriptSites,
  toggleUserScript,
} from './scriptsApi'
import type { ScriptSite, UserScriptRecord } from './types'

export function UserScriptManager({ onClose }: { onClose: () => void }) {
  const [scripts, setScripts] = useState<UserScriptRecord[]>([])
  const [sites, setSites] = useState<ScriptSite[]>([])
  const [editingScript, setEditingScript] = useState<UserScriptRecord | null>(null)
  const [editName, setEditName] = useState('')
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  const loadScripts = async () => {
    const data = await loadUserScriptManagerData()
    setScripts(data.scripts)
    setSites(data.sites)
    return data
  }

  useEffect(() => {
    loadScripts()
  }, [])

  const handleEdit = (script: UserScriptRecord) => {
    setEditingScript(script)
    setEditName(script.name)
    try {
      setSelectedSiteIds(JSON.parse(script.site_ids_json || '[]'))
    } catch {
      setSelectedSiteIds([])
    }
    setErrorMsg('')
  }

  const handleImport = async () => {
    try {
      const id = await importUserScriptFile()
      if (id) {
        const data = await loadScripts()
        const newScript = data.scripts.find((s) => s.id === id)
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
      await saveUserScriptSites(editingScript.id, editName, selectedSiteIds)
      setEditingScript(null)
      loadScripts()
    } catch (e: unknown) {
      if (e instanceof Error) setErrorMsg(e.message)
      else setErrorMsg(String(e))
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    await toggleUserScript(id, enabled)
    loadScripts()
  }

  const handleDelete = async (id: string) => {
    if (confirm('确定删除该脚本吗？（不会删除本地源文件）')) {
      await deleteUserScript(id)
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
        <UserScriptEditor
          script={editingScript}
          sites={sites}
          editName={editName}
          selectedSiteIds={selectedSiteIds}
          errorMsg={errorMsg}
          onEditNameChange={setEditName}
          onToggleSite={toggleSiteSelection}
          onCancel={() => setEditingScript(null)}
          onSave={handleSave}
          onOpenFolder={openUserScriptsFolder}
        />
      ) : (
        <UserScriptList
          scripts={scripts}
          sites={sites}
          errorMsg={errorMsg}
          onImport={handleImport}
          onOpenFolder={openUserScriptsFolder}
          onToggle={handleToggle}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
