import type Database from 'better-sqlite3'

// Frozen content UPDATE from NoteService at 48ba2c0; no production runtime imports.
export function oldUpdateNoteContentRow(
  db: Database.Database,
  noteId: string,
  content: string,
  wordCount: number,
  now: number,
): Database.RunResult {
  return db
    .prepare('UPDATE notes SET content = ?, word_count = ?, updated_at = ? WHERE id = ?')
    .run(content, wordCount, now, noteId)
}
