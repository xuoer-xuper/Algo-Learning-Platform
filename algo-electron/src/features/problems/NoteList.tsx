import {
  NOTE_TYPE_COLORS,
  NOTE_TYPE_LABELS,
  type NoteItem,
} from './notesTypes'

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
          <div className="notes-empty">
            暂无笔记<br />
            点击「新建笔记」创建
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className={`note-item ${activeNoteId === note.id ? 'active' : ''}`}
              onClick={() => onOpenNote(note.id)}
            >
              <div className="note-item-main">
                <span
                  className="note-item-type"
                  style={{
                    backgroundColor: `${NOTE_TYPE_COLORS[note.note_type] || '#585b70'}20`,
                    color: NOTE_TYPE_COLORS[note.note_type] || '#585b70',
                  }}
                >
                  {NOTE_TYPE_LABELS[note.note_type] || note.note_type}
                </span>
                <span className="note-item-title">{note.title}</span>
              </div>
              <div className="note-item-meta">
                <span className="note-item-time">
                  {note.updated_at?.replace('T', ' ').slice(0, 16)}
                </span>
                <span className="note-item-words">
                  {note.word_count > 0 ? `${note.word_count} 字` : ''}
                </span>
                <button
                  type="button"
                  className="note-item-del"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeleteNote(note.id)
                  }}
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
  )
}
