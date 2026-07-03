import { getDb } from '../../connection'
import type { SubmissionRow } from './types'

export function getSubmissionsByProblem(problemId: string): SubmissionRow[] {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM submissions WHERE problem_id = ? ORDER BY submitted_at DESC
  `).all(problemId) as SubmissionRow[]
}

export function getSubmissionsByPlatform(platform: string, limit = 50): SubmissionRow[] {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM submissions WHERE platform = ? ORDER BY submitted_at DESC LIMIT ?
  `).all(platform, limit) as SubmissionRow[]
}
