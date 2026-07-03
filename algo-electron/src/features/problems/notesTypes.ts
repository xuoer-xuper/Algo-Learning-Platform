export const NOTE_TYPE_LABELS: Record<string, string> = {
  solution: '题解',
  review: '复习笔记',
  summary: '总结',
}

export const NOTE_TYPE_COLORS: Record<string, string> = {
  solution: '#a6e3a1',
  review: '#f9e2af',
  summary: '#89b4fa',
}

export interface NoteItem {
  id: string
  title: string
  note_type: string
  content: string
  word_count: number
  updated_at: string
}
