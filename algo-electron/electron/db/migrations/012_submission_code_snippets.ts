import { Database } from 'better-sqlite3'

// P6-003: 提交记录关联代码片段或文件路径
// 不强制复制用户本地代码，支持内联片段或外部文件路径引用
export const migration012 = {
  version: 12,
  name: 'submission_code_snippets',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS submission_code_snippets (
        id TEXT PRIMARY KEY,
        submission_id TEXT,
        problem_id TEXT,
        language TEXT,
        summary TEXT NOT NULL,
        code_snippet TEXT,
        file_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE SET NULL,
        FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS snippets_submission ON submission_code_snippets(submission_id);`)
    db.exec(`CREATE INDEX IF NOT EXISTS snippets_problem ON submission_code_snippets(problem_id);`)
  },
  down: (db: Database) => {
    db.exec(`DROP TABLE IF EXISTS submission_code_snippets`)
  }
}
