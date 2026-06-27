import { useState, useEffect, useCallback, useRef } from 'react'
import { MilkdownEditor } from './MilkdownEditor'

const NOTE_TYPE_LABELS: Record<string, string> = {
  solution: '题解',
  review: '复习笔记',
  summary: '总结',
}

const NOTE_TYPE_COLORS: Record<string, string> = {
  solution: '#a6e3a1',
  review: '#f9e2af',
  summary: '#89b4fa',
}

interface NoteItem {
  id: string
  title: string
  note_type: string
  content: string
  word_count: number
  updated_at: string
}

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
  // 标题防抖保存
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleRef = useRef('')
  titleRef.current = editorTitle

  const loadNotes = useCallback(async () => {
    const list = await window.electronAPI.listNotesByProblem(problemId)
    setNotes(list)
  }, [problemId])

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  // 防抖保存标题
  const scheduleSaveTitle = useCallback((noteId: string, title: string) => {
    if (titleTimer.current) clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(async () => {
      const finalTitle = title.trim() || '未命名笔记'
      await window.electronAPI.updateNoteTitle(noteId, finalTitle)
      await loadNotes()
    }, 600)
  }, [loadNotes])

  const handleNewNote = async () => {
    if (dirty && activeNoteId) {
      if (!confirm('当前笔记未保存，是否放弃修改？')) return
    }
    const note = await window.electronAPI.createNote(problemId, '未命名笔记', '', 'solution')
    await loadNotes()
    await openNote(note.id, '')
  }

  const openNote = async (noteId: string, fallbackContent?: string) => {
    const note = await window.electronAPI.getNote(noteId)
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
      await window.electronAPI.updateNoteContent(activeNoteId, markdown)
      setDirty(false)
      await loadNotes()
    } finally {
      setSaving(false)
    }
  }

  const handleTypeChange = async (noteType: string) => {
    setEditorType(noteType)
    if (activeNoteId) {
      await window.electronAPI.updateNoteType(activeNoteId, noteType)
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
    await window.electronAPI.deleteNote(noteId)
    if (activeNoteId === noteId) {
      setActiveNoteId(null)
      setEditorTitle('')
      setEditorInitial('')
    }
    await loadNotes()
  }

  const handleOpenDir = () => {
    window.electronAPI.openNotesDir()
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
        <div className="notes-sidebar">
          <div className="notes-sidebar-header">
            笔记列表 ({notes.length})
          </div>
          <div className="notes-list">
            {notes.length === 0 ? (
              <div className="notes-empty">
                暂无笔记<br />
                点击「新建笔记」创建
              </div>
            ) : (
              notes.map((n) => (
                <div
                  key={n.id}
                  className={`note-item ${activeNoteId === n.id ? 'active' : ''}`}
                  onClick={() => openNote(n.id)}
                >
                  <div className="note-item-main">
                    <span
                      className="note-item-type"
                      style={{
                        backgroundColor: `${NOTE_TYPE_COLORS[n.note_type] || '#585b70'}20`,
                        color: NOTE_TYPE_COLORS[n.note_type] || '#585b70',
                      }}
                    >
                      {NOTE_TYPE_LABELS[n.note_type] || n.note_type}
                    </span>
                    <span className="note-item-title">{n.title}</span>
                  </div>
                  <div className="note-item-meta">
                    <span className="note-item-time">
                      {n.updated_at?.replace('T', ' ').slice(0, 16)}
                    </span>
                    <span className="note-item-words">
                      {n.word_count > 0 ? `${n.word_count} 字` : ''}
                    </span>
                    <button
                      type="button"
                      className="note-item-del"
                      onClick={(e) => { e.stopPropagation(); handleDelete(n.id) }}
                      title="删除笔记"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="note-editor-area">
          {activeNoteId ? (
            <>
              <div className="note-editor-header">
                <input
                  className="note-editor-title"
                  value={editorTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="笔记标题"
                />
                <select
                  className="note-editor-type"
                  value={editorType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                >
                  <option value="solution">题解</option>
                  <option value="review">复习笔记</option>
                  <option value="summary">总结</option>
                </select>
                <span className="note-save-status">
                  {saving ? '保存中…' : dirty ? '编辑中 *' : '已保存'}
                </span>
              </div>
              <div className="note-editor-container">
                <MilkdownEditor
                  key={activeNoteId}
                  noteId={activeNoteId}
                  initialValue={editorInitial}
                  onChange={handleEditorChange}
                  placeholder="开始编写题解…（输入 ## 自动生成标题）"
                />
              </div>
            </>
          ) : (
            <div className="note-editor-placeholder">
              <div className="note-editor-placeholder-icon">📝</div>
              <div>选择左侧笔记查看，或点击「新建笔记」创建</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
