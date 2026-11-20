import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import type { SubmissionData } from '../../electron/shared/types'
import { nowMillis } from '../../electron/shared/time'
import { emitDataChanged } from '../../electron/shared/dataEvents'

// Frozen pre-A3b1 function: do not share production builders or row projections.
export function runOriginalSubmissionUpsert(db: Database.Database, data: SubmissionData): boolean {
  const now = nowMillis()

  const existing = db
    .prepare<[string, string], { id: string | null }>(
      'SELECT id FROM submissions WHERE platform = ? AND platform_submission_id = ?',
    )
    .get(data.platform, data.platformSubmissionId)

  if (existing) return false

  db.prepare(
    `
    INSERT INTO submissions (id, problem_id, platform, platform_submission_id, verdict, raw_verdict, language, submitted_at, runtime_ms, memory_kb, source_url, raw_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
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

  emitDataChanged(['submissions', 'problems', 'stats'])
  return true
}
