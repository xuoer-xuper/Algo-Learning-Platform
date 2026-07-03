import crypto from 'node:crypto'
import { getDb } from '../db/connection'
import { nowBeijing } from '../shared/time'
import {
  createNoteFile,
  deleteNoteFiles,
  ensureNotesRoot,
  readNoteFile,
  resolveNoteAssetPathFromFile,
  saveNoteImageAsset,
  writeNoteContent,
} from './noteStorage'
import type { SaveNoteImageResult } from './noteStorage'
import { countWords } from './noteText'
export type { SaveNoteImageResult } from './noteStorage'

export type NoteType = 'solution' | 'review' | 'summary'

export interface Note {
  id: string
  problem_id: string | null
  title: string
  file_path: string
  note_type: NoteType
  content: string
  word_count: number
  created_at: string
  updated_at: string
}

export interface NoteListItem extends Note {}

export interface NoteWithContent extends Note {}

export interface CreateNoteInput {
  problem_id?: string | null
  title: string
  content?: string
  note_type?: NoteType
}

function rowToNote(row: any): Note {
  return {
    id: row.id,
    problem_id: row.problem_id,
    title: row.title,
    file_path: row.file_path,
    note_type: row.note_type as NoteType,
    content: row.content ?? '',
    word_count: row.word_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

// 创建笔记（DB 记录 + Markdown 文件 + DB 内容缓存）
export function createNote(input: CreateNoteInput): Note {
  const db = getDb()
  const now = nowBeijing()
  const id = crypto.randomUUID()
  const problemId = input.problem_id ?? '_standalone'
  const noteType = input.note_type ?? 'solution'
  const content = input.content ?? ''
  const filePath = createNoteFile(problemId, id, input.title, content)

  // DB 缓存的实际正文（不含标题行，标题由 title 字段管理）
  const wordCount = countWords(content)

  db.prepare(`
    INSERT INTO notes (id, problem_id, title, file_path, note_type, content, word_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.problem_id ?? null, input.title, filePath, noteType, content, wordCount, now, now)

  return {
    id,
    problem_id: input.problem_id ?? null,
    title: input.title,
    file_path: filePath,
    note_type: noteType,
    content,
    word_count: wordCount,
    created_at: now,
    updated_at: now,
  }
}

// 按题目获取笔记列表（含 DB 缓存内容，用于预览）
export function getNotesByProblem(problemId: string): Note[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT * FROM notes WHERE problem_id = ? ORDER BY updated_at DESC
  `).all(problemId) as any[]
  return rows.map(rowToNote)
}

// 获取所有笔记
export function getAllNotes(): Note[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT * FROM notes ORDER BY updated_at DESC
  `).all() as any[]
  return rows.map(rowToNote)
}

// 获取单条笔记（优先使用 DB 缓存内容；若缓存为空则回读文件）
export function getNoteWithContent(noteId: string): NoteWithContent | null {
  const db = getDb()
  const row = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(noteId) as any | undefined
  if (!row) return null
  const note = rowToNote(row)

  // 若 DB 缓存为空但文件存在，回读文件（兼容旧数据）
  if (!note.content) {
    note.content = readNoteFile(note.file_path) ?? ''
  }

  return note
}

// 更新笔记标题
export function updateNoteTitle(noteId: string, title: string): boolean {
  const db = getDb()
  const now = nowBeijing()
  const result = db.prepare(`
    UPDATE notes SET title = ?, updated_at = ? WHERE id = ?
  `).run(title, now, noteId)
  return result.changes > 0
}

// 更新笔记内容（同时写文件和 DB 缓存）
export function updateNoteContent(noteId: string, content: string): boolean {
  const db = getDb()
  const note = db.prepare(`SELECT file_path FROM notes WHERE id = ?`).get(noteId) as { file_path: string } | undefined
  if (!note) return false

  try {
    writeNoteContent(note.file_path, content)
    const now = nowBeijing()
    const wordCount = countWords(content)
    db.prepare(`
      UPDATE notes SET content = ?, word_count = ?, updated_at = ? WHERE id = ?
    `).run(content, wordCount, now, noteId)
    return true
  } catch {
    return false
  }
}

export function saveNoteImage(noteId: string, fileName: string, mimeType: string, data: ArrayBuffer | Uint8Array): SaveNoteImageResult {
  const db = getDb()
  const note = db.prepare(`SELECT file_path FROM notes WHERE id = ?`).get(noteId) as { file_path: string } | undefined
  if (!note) throw new Error('笔记不存在')
  return saveNoteImageAsset(note.file_path, noteId, fileName, mimeType, data)
}

export function resolveNoteAssetPath(noteId: string, relativeUrl: string): string | null {
  const db = getDb()
  const note = db.prepare(`SELECT file_path FROM notes WHERE id = ?`).get(noteId) as { file_path: string } | undefined
  if (!note) return null

  return resolveNoteAssetPathFromFile(note.file_path, noteId, relativeUrl)
}

// 更新笔记类型
export function updateNoteType(noteId: string, noteType: NoteType): boolean {
  const db = getDb()
  const now = nowBeijing()
  const result = db.prepare(`
    UPDATE notes SET note_type = ?, updated_at = ? WHERE id = ?
  `).run(noteType, now, noteId)
  return result.changes > 0
}

// 删除笔记（DB 记录 + 文件）
export function deleteNote(noteId: string): boolean {
  const db = getDb()
  const note = db.prepare(`SELECT file_path FROM notes WHERE id = ?`).get(noteId) as { file_path: string } | undefined
  if (!note) return false

  deleteNoteFiles(note.file_path, noteId)

  // 删除 DB 记录
  const result = db.prepare(`DELETE FROM notes WHERE id = ?`).run(noteId)
  return result.changes > 0
}

// 删除题目时获取关联笔记列表（不自动删除，供 UI 确认）
export function getNotesByProblemForDelete(problemId: string): Note[] {
  return getNotesByProblem(problemId)
}

// 强制删除题目关联的所有笔记（用户确认后调用）
export function deleteNotesByProblem(problemId: string): number {
  const notes = getNotesByProblem(problemId)
  let count = 0
  for (const note of notes) {
    if (deleteNote(note.id)) count++
  }
  return count
}

// 打开笔记所在目录
export function openNotesDir(): string {
  return ensureNotesRoot()
}
