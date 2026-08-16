import { useState, useEffect } from 'react'
import { ConfirmDialog, Icon, IconButton } from '../../components/ui'
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
  /* 待删除脚本 id：仅用于驱动 ConfirmDialog（替代原生 confirm） */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

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

  const toggleSiteSelection = (siteId: string) => {
    if (selectedSiteIds.includes(siteId)) {
      setSelectedSiteIds(selectedSiteIds.filter(id => id !== siteId))
    } else {
      setSelectedSiteIds([...selectedSiteIds, siteId])
    }
  }

  return (
    <div className="scripts-page">
      <div className="scripts-header">
        <h2 className="scripts-title">
          <Icon name="code" size={18} className="scripts-title-icon" />
          本地脚本管理
        </h2>
        <IconButton icon="close" title="关闭" onClick={onClose} />
      </div>

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
          onDelete={setPendingDeleteId}
        />
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="删除脚本"
        description="移除后该脚本不再注入任何站点；不会删除本地源文件。"
        danger
        confirmText="删除"
        onConfirm={() => {
          const id = pendingDeleteId
          setPendingDeleteId(null)
          if (id) deleteUserScript(id).then(loadScripts)
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  )
}
