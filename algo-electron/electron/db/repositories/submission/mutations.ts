import crypto from 'node:crypto'
import { getDb } from '../../connection'
import type { SubmissionData } from '../../../shared/types'
import { nowBeijing } from '../../../shared/time'
import type { SubmissionRow } from './types'

export function upsertSubmission(data: SubmissionData): boolean {
  const db = getDb()
  const now = nowBeijing()

  const existing = db.prepare(
    'SELECT id FROM submissions WHERE platform = ? AND platform_submission_id = ?',
  ).get(data.platform, data.platformSubmissionId) as Pick<SubmissionRow, 'id'> | undefined

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
    now,
    now,
  )

  return true
}
