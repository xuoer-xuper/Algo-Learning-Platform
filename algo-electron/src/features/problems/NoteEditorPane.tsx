import { MilkdownEditor } from './MilkdownEditor'

interface NoteEditorPaneProps {
  activeNoteId: string | null
  editorTitle: string
  editorType: string
  editorInitial: string
  saving: boolean
  dirty: boolean
  onTitleChange: (title: string) => void
  onTypeChange: (noteType: string) => void
  onEditorChange: (markdown: string) => void
}

export function NoteEditorPane({
  activeNoteId,
  editorTitle,
  editorType,
  editorInitial,
  saving,
  dirty,
  onTitleChange,
  onTypeChange,
  onEditorChange,
}: NoteEditorPaneProps) {
  return (
    <div className="note-editor-area">
      {activeNoteId ? (
        <>
          <div className="note-editor-header">
            <input
              className="note-editor-title"
              value={editorTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="笔记标题"
            />
            <select
              className="note-editor-type"
              value={editorType}
              onChange={(e) => onTypeChange(e.target.value)}
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
              onChange={onEditorChange}
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
  )
}
