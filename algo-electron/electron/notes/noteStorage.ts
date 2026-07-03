import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

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

export function getNotesRoot(): string {
  return path.join(app.getPath('userData'), 'notes')
}

export function ensureNotesRoot(): string {
  const root = getNotesRoot()
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true })
  }
  return root
}

export function createNoteFile(problemId: string, noteId: string, title: string, content: string): string {
  const filePath = getNoteFilePath(problemId, noteId)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `# ${title}\n\n${content}`, 'utf-8')
  return filePath
}

export function writeNoteContent(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf-8')
}

export function readNoteFile(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8')
    }
  } catch {
    return null
  }
  return null
}

export function saveNoteImageAsset(
  noteFilePath: string,
  noteId: string,
  fileName: string,
  mimeType: string,
  data: ArrayBuffer | Uint8Array,
): SaveNoteImageResult {
  const extension = getImageExtension(fileName, mimeType)
  if (!extension) throw new Error('仅支持 png、jpg、gif、webp、bmp 图片')

  const assetsDir = getNoteAssetsDir(noteFilePath, noteId)
  fs.mkdirSync(assetsDir, { recursive: true })

  const assetName = `${Date.now()}-${crypto.randomUUID()}${extension}`
  const assetPath = path.join(assetsDir, assetName)
  const buffer = data instanceof ArrayBuffer
    ? Buffer.from(new Uint8Array(data))
    : Buffer.from(data)
  fs.writeFileSync(assetPath, buffer)

  return { markdownUrl: `assets/${noteId}/${assetName}` }
}

export function resolveNoteAssetPathFromFile(noteFilePath: string, noteId: string, relativeUrl: string): string | null {
  const relativePath = normalizeRelativePath(relativeUrl)
  if (!relativePath) return null

  const noteDir = path.resolve(path.dirname(noteFilePath))
  const assetsDir = path.resolve(getNoteAssetsDir(noteFilePath, noteId))
  const assetPath = path.resolve(noteDir, relativePath)

  // note-asset:// 只能读取当前笔记自己的附件目录，避免 Markdown 相对路径逃逸到用户文件。
  if (!assetPath.startsWith(`${assetsDir}${path.sep}`)) return null
  if (!ALLOWED_IMAGE_EXTENSIONS.has(path.extname(assetPath).toLowerCase())) return null

  return assetPath
}

export function deleteNoteFiles(noteFilePath: string, noteId: string): void {
  try {
    if (fs.existsSync(noteFilePath)) {
      fs.unlinkSync(noteFilePath)
    }
    const assetsDir = getNoteAssetsDir(noteFilePath, noteId)
    if (fs.existsSync(assetsDir)) {
      fs.rmSync(assetsDir, { recursive: true, force: true })
    }
  } catch {
    // DB 删除仍然继续；文件清理失败通常来自用户手动移动或外部编辑器占用。
  }
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
