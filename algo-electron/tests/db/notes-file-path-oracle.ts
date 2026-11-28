import type Database from 'better-sqlite3'
import type { DataTable } from '../../src/shared/types/data'
import type { SaveNoteImageResult } from '../../src/shared/types/notes'

// Frozen from NoteService at 299b0e3. No production query, mapper or storage imports.
type OriginalNoteType = 'solution' | 'review' | 'summary'
type OriginalNoteRow = {
  id: string
  problem_id: string | null
  title: string
  file_path: string
  note_type: string
  content: string
  word_count: number
  created_at: number
  updated_at: number
}
type OriginalNote = Omit<OriginalNoteRow, 'note_type'> & { note_type: OriginalNoteType }

export type NotesFilePathOracleDependencies = {
  getDb: () => Database.Database
  nowMillis: () => number
  emitDataChanged: (tables: readonly DataTable[]) => void
  writeNoteContent: (filePath: string, content: string) => void
  deleteNoteFiles: (filePath: string, noteId: string) => void
  saveNoteImageAsset: (
    filePath: string,
    noteId: string,
    fileName: string,
    mimeType: string,
    data: ArrayBuffer | Uint8Array,
  ) => SaveNoteImageResult
  resolveNoteAssetPathFromFile: (
    filePath: string,
    noteId: string,
    relativeUrl: string,
  ) => string | null
  countWords?: (text: string) => number
}

export function originalCountWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const cjk = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length
  const words = (trimmed.match(/[a-zA-Z0-9]+/g) || []).length
  return cjk + words
}

export function oldFindNoteFilePath(
  db: Database.Database,
  noteId: string,
): { file_path: string } | undefined {
  return db
    .prepare<[string], { file_path: string }>(`SELECT file_path FROM notes WHERE id = ?`)
    .get(noteId)
}

export function createNotesFilePathOracle(deps: NotesFilePathOracleDependencies) {
  const {
    getDb,
    nowMillis,
    emitDataChanged,
    writeNoteContent,
    deleteNoteFiles,
    saveNoteImageAsset,
    resolveNoteAssetPathFromFile,
    countWords = originalCountWords,
  } = deps

  function rowToNote(row: OriginalNoteRow): OriginalNote {
    return {
      id: row.id,
      problem_id: row.problem_id,
      title: row.title,
      file_path: row.file_path,
      note_type: row.note_type as OriginalNoteType,
      content: row.content,
      word_count: row.word_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  function getNotesByProblem(problemId: string): OriginalNote[] {
    const db = getDb()
    const rows = db
      .prepare<[string], OriginalNoteRow>(
        `
    SELECT * FROM notes WHERE problem_id = ? ORDER BY updated_at DESC
  `,
      )
      .all(problemId)
    return rows.map(rowToNote)
  }

  function updateNoteContent(noteId: string, content: string): boolean {
    const db = getDb()
    const note = db
      .prepare<[string], { file_path: string }>(`SELECT file_path FROM notes WHERE id = ?`)
      .get(noteId)
    if (!note) return false

    try {
      writeNoteContent(note.file_path, content)
      const now = nowMillis()
      const wordCount = countWords(content)
      db.prepare(
        `
      UPDATE notes SET content = ?, word_count = ?, updated_at = ? WHERE id = ?
    `,
      ).run(content, wordCount, now, noteId)
      emitDataChanged(['notes'])
      return true
    } catch {
      return false
    }
  }

  function saveNoteImage(
    noteId: string,
    fileName: string,
    mimeType: string,
    data: ArrayBuffer | Uint8Array,
  ): SaveNoteImageResult {
    const db = getDb()
    const note = db
      .prepare<[string], { file_path: string }>(`SELECT file_path FROM notes WHERE id = ?`)
      .get(noteId)
    if (!note) throw new Error('\u7b14\u8bb0\u4e0d\u5b58\u5728')
    return saveNoteImageAsset(note.file_path, noteId, fileName, mimeType, data)
  }

  function resolveNoteAssetPath(noteId: string, relativeUrl: string): string | null {
    const db = getDb()
    const note = db
      .prepare<[string], { file_path: string }>(`SELECT file_path FROM notes WHERE id = ?`)
      .get(noteId)
    if (!note) return null

    return resolveNoteAssetPathFromFile(note.file_path, noteId, relativeUrl)
  }

  function deleteNote(noteId: string): boolean {
    const db = getDb()
    const note = db
      .prepare<[string], { file_path: string }>(`SELECT file_path FROM notes WHERE id = ?`)
      .get(noteId)
    if (!note) return false

    deleteNoteFiles(note.file_path, noteId)

    const result = db.prepare(`DELETE FROM notes WHERE id = ?`).run(noteId)
    if (result.changes > 0) emitDataChanged(['notes'])
    return result.changes > 0
  }

  function deleteNotesByProblem(problemId: string): number {
    const notes = getNotesByProblem(problemId)
    let count = 0
    for (const note of notes) {
      if (deleteNote(note.id)) count++
    }
    return count
  }

  return {
    updateNoteContent,
    saveNoteImage,
    resolveNoteAssetPath,
    deleteNote,
    deleteNotesByProblem,
    getNotesByProblem,
  }
}
