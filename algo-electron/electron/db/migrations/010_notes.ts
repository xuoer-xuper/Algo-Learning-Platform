import { Database } from 'better-sqlite3'

export const migration010 = {
  version: 10,
  name: 'notes',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        problem_id TEXT,
        title TEXT NOT NULL,
        file_path TEXT NOT NULL,
        note_type TEXT NOT NULL DEFAULT 'solution',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS notes_problem ON notes(problem_id);
    `)
  },
  down: (db: Database) => {
    db.exec(`
      DROP INDEX IF EXISTS notes_problem;
      DROP TABLE IF EXISTS notes;
    `)
  }
}
