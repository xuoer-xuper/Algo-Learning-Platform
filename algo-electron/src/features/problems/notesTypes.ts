export const NOTE_TYPE_LABELS: Record<string, string> = {
  solution: '题解',
  review: '复习笔记',
  summary: '总结',
}

/**
 * 笔记类型的配色不在这里。徽标底色由 src/styles/notes.css 的
 * .note-item-type--{type} 用 --color-*-soft token 给出，未知类型走基类的
 * --bg-surface 兜底。原先此处有一份 NOTE_TYPE_COLORS 硬编码 hex，
 * 是 Catppuccin 深色值当浅色卡片上的文字色用，徽标对比度只有 1.2~1.9:1。
 */

export interface NoteItem {
  id: string
  title: string
  note_type: string
  content: string
  word_count: number
  updated_at: string
}
