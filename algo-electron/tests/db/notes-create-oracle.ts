import type Database from 'better-sqlite3'
import type { DataTable } from '../../src/shared/types/data'
import { originalCountWords } from './notes-file-path-oracle'

// Frozen create-only implementation from NoteService at 4fe73b3.
type OriginalNoteType = 'solution' | 'review' | 'summary'
type OriginalCreateNoteInput = {
  problem_id?: string | null
  title: string
  content?: string
  note_type?: OriginalNoteType
}
type OriginalCreateNoteValues = {
  id: string
  problemId: string | null
  title: string
  filePath: string
  noteType: string
  content: string
  wordCount: number
  now: number
}

export function oldPrepareCreateNoteInsert(db: Database.Database): {
  run(values: OriginalCreateNoteValues): Database.RunResult
} {
  const prepared = db.prepare(
    `INSERT INTO notes (id, problem_id, title, file_path, note_type, content, word_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  return {
    run: (values) =>
      prepared.run(
        values.id,
        values.problemId,
        values.title,
        values.filePath,
        values.noteType,
        values.content,
        values.wordCount,
        values.now,
        values.now,
      ),
  }
}

export type NotesCreateOracleDependencies = {
  getDb: () => Database.Database
  nowMillis: () => number
  randomUUID: () => string
  emitDataChanged: (tables: readonly DataTable[]) => void
  createNoteFile: (problemId: string, noteId: string, title: string, content: string) => string
  countWords?: (text: string) => number
}

export function createNotesCreateOracle(deps: NotesCreateOracleDependencies) {
  const {
    getDb,
    nowMillis,
    randomUUID,
    emitDataChanged,
    createNoteFile,
    countWords = originalCountWords,
  } = deps

  function createNote(input: OriginalCreateNoteInput) {
    const db = getDb()
    const now = nowMillis()
    const id = randomUUID()
    const problemId = input.problem_id ?? '_standalone'
    const noteType = input.note_type ?? 'solution'
    const content = input.content ?? ''
    const filePath = createNoteFile(problemId, id, input.title, content)
    const wordCount = countWords(content)

    db.prepare(
      `
    INSERT INTO notes (id, problem_id, title, file_path, note_type, content, word_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(
      id,
      input.problem_id ?? null,
      input.title,
      filePath,
      noteType,
      content,
      wordCount,
      now,
      now,
    )

    emitDataChanged(['notes'])
    return {
      id,
      problem_id: input.problem_id ?? null,
      title: input.title,
      file_path: filePath,
      note_type: noteType,
      content,
      word_count: wordCount,
      created_at: now,
      updated_at: now,
    }
  }

  return { createNote }
}
