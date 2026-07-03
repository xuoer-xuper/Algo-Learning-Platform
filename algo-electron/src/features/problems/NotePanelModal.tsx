import { useState, useEffect, useCallback } from 'react'
import { NoteEditorPane } from './NoteEditorPane'
import { NoteList } from './NoteList'
import type { NoteItem } from './notesTypes'
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

interface Props {
  problemId: string
  onClose: () => void
}

export function NotePanelModal({ problemId, onClose }: Props) {
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [editorTitle, setEditorTitle] = useState('')
  const [editorType, setEditorType] = useState<string>('solution')
  const [editorInitial, setEditorInitial] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const loadNotes = useCallback(async () => {
    const list = await listNotesByProblem(problemId)
    setNotes(list)
  }, [problemId])

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  const {
    flushPendingTitle,
    scheduleSaveTitle,
    clearPendingTitleForNote,
  } = useDebouncedNoteTitleSave({ onSaved: loadNotes })

  const handleNewNote = async () => {
    if (dirty && activeNoteId) {
      if (!confirm('当前笔记未保存，是否放弃修改？')) return
    }
    // 切换前先 flush 当前笔记的未保存标题
    await flushPendingTitle(true)
    const note = await createProblemNote(problemId)
    await loadNotes()
    await openNote(note.id, '')
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
      await updateNoteType(activeNoteId, noteType)
      await loadNotes()
    }
  }

  const handleTitleChange = (title: string) => {
    setEditorTitle(title)
    setDirty(true)
    if (activeNoteId) scheduleSaveTitle(activeNoteId, title)
  }

  const handleDelete = async (noteId: string) => {
    if (!confirm('确定删除这条笔记吗？笔记文件将被永久删除。')) return
    clearPendingTitleForNote(noteId)
    await deleteNote(noteId)
    if (activeNoteId === noteId) {
      setActiveNoteId(null)
      setEditorTitle('')
      setEditorInitial('')
    }
    await loadNotes()
  }

  const handleOpenDir = () => {
    openNotesDirectory()
  }

  return (
    <div className="notes-modal">
      <div className="notes-modal-header">
        <h2 className="notes-modal-title">📝 本地笔记</h2>
        <div className="notes-modal-actions">
          <button
            type="button"
            className="notes-modal-btn notes-modal-btn-icon"
            onClick={handleOpenDir}
            title="打开笔记目录"
          >
            📂
          </button>
          <button
            type="button"
            className="notes-modal-btn notes-modal-btn-primary"
            onClick={handleNewNote}
          >
            + 新建笔记
          </button>
          <button
            type="button"
            className="notes-modal-close"
            onClick={onClose}
            title="关闭"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="notes-modal-body">
        <NoteList
          notes={notes}
          activeNoteId={activeNoteId}
          onOpenNote={openNote}
          onDeleteNote={handleDelete}
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
    </div>
  )
}
