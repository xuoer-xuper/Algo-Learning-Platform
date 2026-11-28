import type Database from 'better-sqlite3'
import { eq, sql } from 'drizzle-orm'
import { createDrizzleClient } from '../../../../src/main/db/client'
import { notes } from '../../../../src/main/db/schema'

export function updateNoteContentRow(
  db: Database.Database,
  noteId: string,
  content: string,
  wordCount: number,
  now: number,
): Database.RunResult {
  const orm = createDrizzleClient(db)
  // Preserve native argument order despite the schema-ordered UPDATE assignments.
  const values = orm.$with('note_write_values').as(
    orm
      .select({
        content: sql`${sql.placeholder('content')}`.as('content'),
        wordCount: sql`${sql.placeholder('wordCount')}`.as('word_count'),
        now: sql`${sql.placeholder('now')}`.as('updated_at'),
        noteId: sql`${sql.placeholder('noteId')}`.as('note_id'),
      })
      .from(sql`(select 1)`),
  )
  return orm
    .with(values)
    .update(notes)
    .set({
      content: sql`(select ${values.content} from ${values})`,
      word_count: sql`(select ${values.wordCount} from ${values})`,
      updated_at: sql`(select ${values.now} from ${values})`,
    })
    .where(eq(notes.id, sql`(select ${values.noteId} from ${values})`))
    .prepare()
    .run({ content, wordCount, now, noteId })
}
