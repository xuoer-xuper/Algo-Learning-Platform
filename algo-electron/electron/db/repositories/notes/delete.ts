import type Database from 'better-sqlite3'
import { eq, sql } from 'drizzle-orm'
import { createDrizzleClient } from '../../../../src/main/db/client'
import { notes } from '../../../../src/main/db/schema'

export function deleteNoteRow(db: Database.Database, noteId: string): Database.RunResult {
  return createDrizzleClient(db)
    .delete(notes)
    .where(eq(notes.id, sql.placeholder('noteId')))
    .prepare()
    .run({ noteId })
}
