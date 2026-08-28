import { useCallback, useState, useEffect, useRef } from 'react'
import { ConfirmDialog, Icon, IconButton } from '../../components/ui'
import { errorMessage } from '../../shared/errors'
import { UserScriptEditor } from './UserScriptEditor'
import { UserScriptList } from './UserScriptList'
import {
  deleteUserScript,
  checkUserScriptUpdates,
  describeUserScriptCodeView,
  describeUserScriptOpenEditorResult,
  getUserScriptCode,
  importUserScriptFile,
  loadUserScriptManagerData,
  openUserScriptEditor,
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
  const [scriptCode, setScriptCode] = useState<string | null>(null)
  const [codeNotice, setCodeNotice] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)
  const codeRequestRef = useRef(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [updateMsg, setUpdateMsg] = useState('')
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  /* 待删除脚本 id：仅用于驱动 ConfirmDialog（替代原生 confirm） */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const loadScripts = useCallback(async () => {
    const data = await loadUserScriptManagerData()
    setScripts(data.scripts)
    setSites(data.sites)
    return data
  }, [])

  // loadScripts 会向外抛：调用方要么已在 try 里，要么在这里落到 errorMsg。
  const loadScriptsGuarded = useCallback(() => {
    void loadScripts().catch((error: unknown) => setErrorMsg(errorMessage(error)))
  }, [loadScripts])

  useEffect(() => {
    loadScriptsGuarded()
  }, [loadScriptsGuarded])

  const handleEdit = (script: UserScriptRecord) => {
    setEditingScript(script)
    setEditName(script.name)
    try {
      setSelectedSiteIds(JSON.parse(script.site_ids_json || '[]'))
    } catch {
      setSelectedSiteIds([])
    }
    setErrorMsg('')
    setScriptCode(null)
    setCodeNotice('')
    setCodeLoading(true)
    const requestId = codeRequestRef.current + 1
    codeRequestRef.current = requestId
    void getUserScriptCode(script.id)
      .then(result => {
        if (requestId !== codeRequestRef.current) return
        setScriptCode(result.status === 'ok' ? result.code : null)
        setCodeNotice(describeUserScriptCodeView(result) ?? '')
      })
      .catch(() => {
        if (requestId !== codeRequestRef.current) return
        setScriptCode(null)
        setCodeNotice('源码读取失败，请稍后重试。')
      })
      .finally(() => {
        if (requestId === codeRequestRef.current) setCodeLoading(false)
      })
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
      setErrorMsg(errorMessage(e))
    }
  }

  const handleSave = async () => {
    try {
      if (!editingScript) return
      await saveUserScriptSites(editingScript.id, editName, selectedSiteIds)
      setEditingScript(null)
      await loadScripts()
    } catch (e: unknown) {
      setErrorMsg(errorMessage(e))
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await toggleUserScript(id, enabled)
      await loadScripts()
    } catch (error: unknown) {
      setErrorMsg(errorMessage(error))
    }
  }

  const handleCheckUpdates = async () => {
    if (checkingUpdates) return
    setCheckingUpdates(true)
    setErrorMsg('')
    setUpdateMsg('')
    try {
      const summary = await checkUserScriptUpdates()
      if (!summary) throw new Error('更新服务尚未就绪。')
      await loadScripts()
      setUpdateMsg(`已检查 ${summary.checked} 个脚本，更新 ${summary.updated} 个，失败 ${summary.failed} 个。`)
    } catch (e: unknown) {
      setErrorMsg(errorMessage(e))
    } finally {
      setCheckingUpdates(false)
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
          onOpenEditor={() => {
            void openUserScriptEditor(editingScript.id).then(result => {
              setErrorMsg(describeUserScriptOpenEditorResult(result) ?? '')
            })
          }}
          code={scriptCode}
          codeNotice={codeNotice}
          codeLoading={codeLoading}
        />
      ) : (
        <UserScriptList
          scripts={scripts}
          sites={sites}
          errorMsg={errorMsg}
          updateMsg={updateMsg}
          checkingUpdates={checkingUpdates}
          onImport={handleImport}
          onCheckUpdates={handleCheckUpdates}
          onOpenFolder={openUserScriptsFolder}
          onToggle={handleToggle}
          onEdit={handleEdit}
          onDelete={setPendingDeleteId}
        />
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="删除脚本"
        description="移除后该脚本不再注入任何站点；只清理应用托管副本，不删除原始源文件。"
        danger
        confirmText="删除"
        onConfirm={() => {
          const id = pendingDeleteId
          setPendingDeleteId(null)
          if (id) {
            void deleteUserScript(id)
              .then(loadScripts)
              .catch((error: unknown) => setErrorMsg(errorMessage(error)))
          }
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  )
}
