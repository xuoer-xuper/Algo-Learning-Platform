import {
  NOTE_TYPE_LABELS,
  type NoteItem,
} from './notesTypes'
import { Empty, IconButton } from '../../components/ui'

/**
 * 徽标类名与文字。note_type 来自数据库，可能是 NOTE_TYPE_LABELS 之外的值，
 * 不能直接拼进类名；未知类型只留基类（底色走 --bg-surface 兜底）并原样显示。
 */
function noteTypeBadge(noteType: string): { className: string, label: string } {
  const label = NOTE_TYPE_LABELS[noteType]
  return label === undefined
    ? { className: 'note-item-type', label: noteType }
    : { className: `note-item-type note-item-type--${noteType}`, label }
}

interface NoteListProps {
  notes: NoteItem[]
  activeNoteId: string | null
  onOpenNote: (noteId: string) => void
  onDeleteNote: (noteId: string) => void
}

export function NoteList({
  notes,
  activeNoteId,
  onOpenNote,
  onDeleteNote,
}: NoteListProps) {
  return (
    <div className="notes-sidebar">
      <div className="notes-sidebar-header">
        笔记列表 ({notes.length})
      </div>
      <div className="notes-list">
        {notes.length === 0 ? (
          // 改前是 `<br />` 硬折行；hint 槽位本来就是给这句次要说明的
          <Empty hint="点击「新建笔记」创建">暂无笔记</Empty>
        ) : (
          notes.map((note) => {
            const badge = noteTypeBadge(note.note_type)
            return (
            <div
              key={note.id}
              className={`note-item ${activeNoteId === note.id ? 'active' : ''}`}
              onClick={() => onOpenNote(note.id)}
            >
              <div className="note-item-main">
                <span className={badge.className}>{badge.label}</span>
                <span className="note-item-title">{note.title}</span>
              </div>
              <div className="note-item-meta">
                <span className="note-item-time">
                  {note.updated_at?.replace('T', ' ').slice(0, 16)}
                </span>
                <span className="note-item-words">
                  {note.word_count > 0 ? `${note.word_count} 字` : ''}
                </span>
                <IconButton
                  icon="trash"
                  size={12}
                  danger
                  className="note-item-del"
                  title="删除笔记"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeleteNote(note.id)
                  }}
                />
              </div>
            </div>
            )
          })
        )}
      </div>
    </div>
  )
}
