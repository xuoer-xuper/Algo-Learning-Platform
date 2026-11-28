import type Database from 'better-sqlite3'

// Frozen final DELETE from NoteService at 26be448; no production runtime imports.
export function oldDeleteNoteRow(db: Database.Database, noteId: string): Database.RunResult {
  return db.prepare('DELETE FROM notes WHERE id = ?').run(noteId)
}
