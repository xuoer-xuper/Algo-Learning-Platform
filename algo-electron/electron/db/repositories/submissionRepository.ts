import crypto from 'node:crypto'
import { getDb } from '../connection'
import type { SubmissionData } from '../../shared/types'
import { nowBeijing } from '../../shared/time'

export function upsertSubmission(data: SubmissionData): boolean {
  const db = getDb()
  const now = nowBeijing()

  const existing = db.prepare(
    'SELECT id FROM submissions WHERE platform = ? AND platform_submission_id = ?'
  ).get(data.platform, data.platformSubmissionId) as { id: string } | undefined

  if (existing) return false

  db.prepare(`
    INSERT INTO submissions (id, problem_id, platform, platform_submission_id, verdict, raw_verdict, language, submitted_at, runtime_ms, memory_kb, source_url, raw_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    data.problemId ?? null,
    data.platform,
    data.platformSubmissionId,
    data.verdict,
    data.rawVerdict ?? null,
    data.language ?? null,
    data.submittedAt,
    data.runtimeMs ?? null,
    data.memoryKb ?? null,
    data.sourceUrl ?? null,
    data.rawJson ?? null,
    now, now,
  )

  return true
}

export function getSubmissionsByProblem(problemId: string): any[] {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM submissions WHERE problem_id = ? ORDER BY submitted_at DESC
  `).all(problemId)
}

export function getSubmissionsByPlatform(platform: string, limit = 50): any[] {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM submissions WHERE platform = ? ORDER BY submitted_at DESC LIMIT ?
  `).all(platform, limit)
}

// 更新首次 AC
export function updateFirstAc(problemId: string): void {
  const db = getDb()
  const now = nowBeijing()

  const firstAc = db.prepare(`
    SELECT submitted_at FROM submissions
    WHERE problem_id = ? AND verdict = 'AC'
    ORDER BY submitted_at ASC LIMIT 1
  `).get(problemId) as { submitted_at: string } | undefined

  if (firstAc) {
    db.prepare(`
      UPDATE problems SET status = 'solved', first_solved_at = ?, updated_at = ?
      WHERE id = ? AND (first_solved_at IS NULL OR first_solved_at > ?)
    `).run(firstAc.submitted_at, now, problemId, firstAc.submitted_at)
  }
}
