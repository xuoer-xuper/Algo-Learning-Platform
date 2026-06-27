import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import { getDb } from '../db/connection'
import { nowBeijing } from '../shared/time'

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

export interface SaveNoteImageResult {
  markdownUrl: string
}

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
}

const ALLOWED_IMAGE_EXTENSIONS = new Set([...Object.values(IMAGE_EXT_BY_MIME), '.jpeg'])

// 笔记文件根目录：{userData}/notes/{problemId}/{noteId}.md
function getNotesRoot(): string {
  return path.join(app.getPath('userData'), 'notes')
}

function getNoteFilePath(problemId: string, noteId: string): string {
  return path.join(getNotesRoot(), problemId, `${noteId}.md`)
}

function getNoteAssetsDir(noteFilePath: string, noteId: string): string {
  return path.join(path.dirname(noteFilePath), 'assets', noteId)
}

function getImageExtension(fileName: string, mimeType: string): string | null {
  const fromMime = IMAGE_EXT_BY_MIME[mimeType.toLowerCase()]
  if (fromMime) return fromMime

  const fromName = path.extname(fileName).toLowerCase()
  if (ALLOWED_IMAGE_EXTENSIONS.has(fromName)) return fromName

  return null
}

function normalizeRelativePath(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (!normalized || normalized.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(normalized)) return null

  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0 || parts.some(part => part === '.' || part === '..')) return null

  return parts.join(path.sep)
}

// 估算字数（中英文混排：英文按词，中文按字）
function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  // 统计中文字符数 + 英文单词数
  const cjk = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length
  const words = (trimmed.match(/[a-zA-Z0-9]+/g) || []).length
  return cjk + words
}

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
  const filePath = getNoteFilePath(problemId, id)
  const noteType = input.note_type ?? 'solution'
  const content = input.content ?? ''

  // 确保目录存在
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // 写入初始内容（带标题）
  const fileContent = `# ${input.title}\n\n${content}`
  fs.writeFileSync(filePath, fileContent, 'utf-8')

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
    try {
      if (fs.existsSync(note.file_path)) {
        note.content = fs.readFileSync(note.file_path, 'utf-8')
      }
    } catch {
      note.content = ''
    }
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
    fs.writeFileSync(note.file_path, content, 'utf-8')
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

// 保存笔记图片附件，Markdown 中写入相对路径，便于外部编辑器打开
export function saveNoteImage(noteId: string, fileName: string, mimeType: string, data: ArrayBuffer | Uint8Array): SaveNoteImageResult {
  const db = getDb()
  const note = db.prepare(`SELECT file_path FROM notes WHERE id = ?`).get(noteId) as { file_path: string } | undefined
  if (!note) throw new Error('笔记不存在')

  const extension = getImageExtension(fileName, mimeType)
  if (!extension) throw new Error('仅支持 png、jpg、gif、webp、bmp 图片')

  const assetsDir = getNoteAssetsDir(note.file_path, noteId)
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true })
  }

  const assetName = `${Date.now()}-${crypto.randomUUID()}${extension}`
  const assetPath = path.join(assetsDir, assetName)
  const relativeUrl = `assets/${noteId}/${assetName}`

  const buffer = data instanceof ArrayBuffer
    ? Buffer.from(new Uint8Array(data))
    : Buffer.from(data)
  fs.writeFileSync(assetPath, buffer)

  return { markdownUrl: relativeUrl }
}

export function resolveNoteAssetPath(noteId: string, relativeUrl: string): string | null {
  const db = getDb()
  const note = db.prepare(`SELECT file_path FROM notes WHERE id = ?`).get(noteId) as { file_path: string } | undefined
  if (!note) return null

  const relativePath = normalizeRelativePath(relativeUrl)
  if (!relativePath) return null

  const noteDir = path.resolve(path.dirname(note.file_path))
  const assetsDir = path.resolve(getNoteAssetsDir(note.file_path, noteId))
  const assetPath = path.resolve(noteDir, relativePath)
  if (!assetPath.startsWith(`${assetsDir}${path.sep}`)) return null
  if (!ALLOWED_IMAGE_EXTENSIONS.has(path.extname(assetPath).toLowerCase())) return null

  return assetPath
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

  // 删除文件
  try {
    if (fs.existsSync(note.file_path)) {
      fs.unlinkSync(note.file_path)
    }
    const assetsDir = getNoteAssetsDir(note.file_path, noteId)
    if (fs.existsSync(assetsDir)) {
      fs.rmSync(assetsDir, { recursive: true, force: true })
    }
  } catch { /* 忽略文件删除失败 */ }

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
  const root = getNotesRoot()
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true })
  }
  return root
}
