import type Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { createDrizzleClient } from '../../../../src/main/db/client'
import { notes } from '../../../../src/main/db/schema'

export type CreateNoteValues = {
  id: string
  problemId: string | null
  title: string
  filePath: string
  noteType: (typeof notes.$inferSelect)['note_type']
  content: string
  wordCount: number
  now: number
}

export function prepareCreateNoteInsert(db: Database.Database): {
  run(values: CreateNoteValues): Database.RunResult
} {
  const orm = createDrizzleClient(db)
  // Preserve raw binding order, and prepare before the caller evaluates its input getters.
  const values = orm.$with('note_create_values').as(
    orm
      .select({
        id: sql`${sql.placeholder('id')}`.as('id'),
        problemId: sql`${sql.placeholder('problemId')}`.as('problem_id'),
        title: sql`${sql.placeholder('title')}`.as('title'),
        filePath: sql`${sql.placeholder('filePath')}`.as('file_path'),
        noteType: sql`${sql.placeholder('noteType')}`.as('note_type'),
        content: sql`${sql.placeholder('content')}`.as('content'),
        wordCount: sql`${sql.placeholder('wordCount')}`.as('word_count'),
        createdAt: sql`${sql.placeholder('now')}`.as('created_at'),
        updatedAt: sql`${sql.placeholder('now')}`.as('updated_at'),
      })
      .from(sql`(select 1)`),
  )
  const prepared = orm
    .with(values)
    .insert(notes)
    .select(
      orm
        .select({
          id: values.id,
          problem_id: values.problemId,
          title: values.title,
          file_path: values.filePath,
          note_type: values.noteType,
          created_at: values.createdAt,
          updated_at: values.updatedAt,
          content: values.content,
          word_count: values.wordCount,
          deleted_at: sql`null`.as('deleted_at'),
        })
        .from(values),
    )
    .prepare()
  return { run: (values) => prepared.run(values) }
}
