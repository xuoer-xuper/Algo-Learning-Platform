import type Database from 'better-sqlite3'
import type { DataTable } from '../../src/shared/types/data'

// Frozen from NoteService at 41ef2e6; no production query or service imports.
type OriginalNoteType = 'solution' | 'review' | 'summary'

export function oldUpdateNoteTitleRow(
  db: Database.Database,
  noteId: string,
  title: string,
  now: number,
): Database.RunResult {
  return db
    .prepare('UPDATE notes SET title = ?, updated_at = ? WHERE id = ?')
    .run(title, now, noteId)
}

export function oldUpdateNoteTypeRow(
  db: Database.Database,
  noteId: string,
  noteType: string,
  now: number,
): Database.RunResult {
  return db
    .prepare('UPDATE notes SET note_type = ?, updated_at = ? WHERE id = ?')
    .run(noteType, now, noteId)
}

export function createNotesTitleTypeOracle(deps: {
  getDb: () => Database.Database
  nowMillis: () => number
  emitDataChanged: (tables: readonly DataTable[]) => void
}) {
  const { getDb, nowMillis, emitDataChanged } = deps

  function updateNoteTitle(noteId: string, title: string): boolean {
    const db = getDb()
    const now = nowMillis()
    const result = db
      .prepare(
        `
    UPDATE notes SET title = ?, updated_at = ? WHERE id = ?
  `,
      )
      .run(title, now, noteId)
    if (result.changes > 0) emitDataChanged(['notes'])
    return result.changes > 0
  }

  function updateNoteType(noteId: string, noteType: OriginalNoteType): boolean {
    const db = getDb()
    const now = nowMillis()
    const result = db
      .prepare(
        `
    UPDATE notes SET note_type = ?, updated_at = ? WHERE id = ?
  `,
      )
      .run(noteType, now, noteId)
    if (result.changes > 0) emitDataChanged(['notes'])
    return result.changes > 0
  }

  return { updateNoteTitle, updateNoteType }
}
