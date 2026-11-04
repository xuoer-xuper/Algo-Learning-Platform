import { useState, useCallback } from 'react'
import { NoteEditorPane } from './NoteEditorPane'
import { NoteList } from './NoteList'
import {
  createProblemNote,
  deleteNote,
  listNotesByProblem,
  loadNote,
  openNotesDirectory,
  updateNoteContent,
  updateNoteType,
} from './problemsApi'
import { useDebouncedNoteTitleSave } from './useDebouncedNoteTitleSave'
import { Button, ConfirmDialog, Icon, IconButton } from '../../components/ui'
import { useIpcQuery } from '../../hooks/useIpcQuery'
import { useIpcQueryError } from '../../hooks/useIpcQueryError'

interface Props {
  problemId: string
  onClose: () => void
}

export function NotePanelModal({ problemId, onClose }: Props) {
  const query = useIpcQuery(() => listNotesByProblem(problemId), [problemId], { tables: ['notes'] })
  const notes = query.data ?? []
  useIpcQueryError(query.error, '笔记列表读取')
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [editorTitle, setEditorTitle] = useState('')
  const [editorType, setEditorType] = useState<string>('solution')
  const [editorInitial, setEditorInitial] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  // B1.4：原生 confirm 改为 ConfirmDialog 的本地开关
  const [discardOpen, setDiscardOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const refetchNotes = query.refetch
  const loadNotes = useCallback(async () => {
    await refetchNotes()
  }, [refetchNotes])

  const { flushPendingTitle, scheduleSaveTitle, clearPendingTitleForNote } =
    useDebouncedNoteTitleSave({ onSaved: loadNotes })

  const createNewNote = async () => {
    setDiscardOpen(false)
    // 切换前先 flush 当前笔记的未保存标题
    await flushPendingTitle(true)
    const note = await createProblemNote(problemId)
    await loadNotes()
    await openNote(note.id, '')
  }

  const handleNewNote = () => {
    if (dirty && activeNoteId) {
      // 有未保存修改：先经确认对话框再新建
      setDiscardOpen(true)
      return
    }
    void createNewNote()
  }

  const openNote = async (noteId: string, fallbackContent?: string) => {
    // 切换笔记前 flush 当前笔记的未保存标题，避免丢失
    await flushPendingTitle(true)
    const note = await loadNote(noteId)
    if (!note) return
    // milkdown 是非受控编辑器，切换笔记需重置状态
    setActiveNoteId(noteId)
    setEditorTitle(note.title)
    setEditorType(note.note_type)
    setEditorInitial(note.content || fallbackContent || '')
    setDirty(false)
  }

  const handleEditorChange = async (markdown: string) => {
    if (!activeNoteId) return
    setSaving(true)
    try {
      await updateNoteContent(activeNoteId, markdown)
      setDirty(false)
      await loadNotes()
    } finally {
      setSaving(false)
    }
  }

  const handleTypeChange = async (noteType: string) => {
    setEditorType(noteType)
    if (activeNoteId) {
      // noteType 来自 NoteEditorPane 的下拉框，选项就是 noteType 闭集的三项；
      // e.target.value 的 string 在这个 DOM 边界收窄（note_type 列收成枚举见 R5）。
      await updateNoteType(activeNoteId, noteType as Parameters<typeof updateNoteType>[1])
      await loadNotes()
    }
  }

  const handleTitleChange = (title: string) => {
    setEditorTitle(title)
    setDirty(true)
    if (activeNoteId) scheduleSaveTitle(activeNoteId, title)
  }

  // 删除确认后的真正删除动作（入口是列表项的删除键 → setPendingDeleteId）
  const confirmDeleteNote = async () => {
    const noteId = pendingDeleteId
    setPendingDeleteId(null)
    if (!noteId) return
    clearPendingTitleForNote(noteId)
    await deleteNote(noteId)
    if (activeNoteId === noteId) {
      setActiveNoteId(null)
      setEditorTitle('')
      setEditorInitial('')
    }
    await loadNotes()
  }

  const closeDialogs = () => {
    setDiscardOpen(false)
    setPendingDeleteId(null)
  }

  const handleOpenDir = () => {
    void openNotesDirectory()
  }

  return (
    <div className="notes-modal">
      <div className="notes-modal-header">
        <h2 className="notes-modal-title">
          <Icon name="note" size={16} />
          本地笔记
        </h2>
        <div className="notes-modal-actions">
          <IconButton icon="external" title="打开笔记目录" onClick={handleOpenDir} />
          <Button variant="primary" icon="plus" onClick={handleNewNote}>
            新建笔记
          </Button>
          <IconButton icon="close" title="关闭" className="notes-modal-close" onClick={onClose} />
        </div>
      </div>

      <div className="notes-modal-body">
        <NoteList
          notes={notes}
          activeNoteId={activeNoteId}
          onOpenNote={openNote}
          onDeleteNote={setPendingDeleteId}
        />

        <NoteEditorPane
          activeNoteId={activeNoteId}
          editorTitle={editorTitle}
          editorType={editorType}
          editorInitial={editorInitial}
          saving={saving}
          dirty={dirty}
          onTitleChange={handleTitleChange}
          onTypeChange={handleTypeChange}
          onEditorChange={handleEditorChange}
        />
      </div>

      {/* 新建时放弃未保存修改的确认 */}
      <ConfirmDialog
        open={discardOpen}
        title="放弃未保存的修改？"
        description="当前笔记的修改尚未保存，新建笔记将放弃这些修改。"
        confirmText="放弃并新建"
        danger
        onConfirm={createNewNote}
        onCancel={closeDialogs}
      />

      {/* 删除单条笔记的确认 */}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="删除该笔记？"
        description="笔记文件将被永久删除，不可恢复。"
        confirmText="删除"
        danger
        onConfirm={confirmDeleteNote}
        onCancel={closeDialogs}
      />
    </div>
  )
}
