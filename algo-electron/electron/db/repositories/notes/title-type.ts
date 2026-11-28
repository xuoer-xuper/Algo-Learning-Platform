import type Database from 'better-sqlite3'
import { eq, sql } from 'drizzle-orm'
import { createDrizzleClient } from '../../../../src/main/db/client'
import { notes } from '../../../../src/main/db/schema'

export function updateNoteTitleRow(
  db: Database.Database,
  noteId: string,
  title: string,
  now: number,
): Database.RunResult {
  return createDrizzleClient(db)
    .update(notes)
    .set({
      title: sql`${sql.placeholder('title')}`,
      updated_at: sql`${sql.placeholder('now')}`,
    })
    .where(eq(notes.id, sql.placeholder('noteId')))
    .prepare()
    .run({ title, now, noteId })
}

export function updateNoteTypeRow(
  db: Database.Database,
  noteId: string,
  noteType: (typeof notes.$inferSelect)['note_type'],
  now: number,
): Database.RunResult {
  return createDrizzleClient(db)
    .update(notes)
    .set({
      note_type: sql`${sql.placeholder('noteType')}`,
      updated_at: sql`${sql.placeholder('now')}`,
    })
    .where(eq(notes.id, sql.placeholder('noteId')))
    .prepare()
    .run({ noteType, now, noteId })
}
