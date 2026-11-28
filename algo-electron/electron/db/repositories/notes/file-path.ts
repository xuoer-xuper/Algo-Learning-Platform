import type Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { createDrizzleClient } from '../../../../src/main/db/client'
import { notes } from '../../../../src/main/db/schema'

export function findNoteFilePath(
  db: Database.Database,
  noteId: string,
): Pick<typeof notes.$inferSelect, 'file_path'> | undefined {
  return createDrizzleClient(db)
    .select({ file_path: notes.file_path })
    .from(notes)
    .where(eq(notes.id, noteId))
    .get()
}
