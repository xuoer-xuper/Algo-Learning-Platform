import crypto from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../../connection'
import { createDrizzleClient } from '../../../../src/main/db/client'
import { submissions } from '../../../../src/main/db/schema'
import type { SubmissionData } from '../../../shared/types'
import { nowMillis } from '../../../shared/time'
import { emitDataChanged } from '../../../shared/dataEvents'

export function upsertSubmission(data: SubmissionData): boolean {
  const db = getDb()
  const now = nowMillis()
  const orm = createDrizzleClient(db)
  const findExisting = orm
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.platform, sql.placeholder('platform')),
        eq(submissions.platform_submission_id, sql.placeholder('platformSubmissionId')),
      ),
    )
    .prepare()
  const existing = findExisting.get({
    platform: data.platform,
    platformSubmissionId: data.platformSubmissionId,
  })

  if (existing) return false

  // Prepare before UUID/input evaluation, and preserve raw numeric timestamps.
  const insert = orm
    .insert(submissions)
    .values({
      id: sql.placeholder('id'),
      problem_id: sql.placeholder('problemId'),
      platform: sql.placeholder('platform'),
      platform_submission_id: sql.placeholder('platformSubmissionId'),
      verdict: sql.placeholder('verdict'),
      raw_verdict: sql.placeholder('rawVerdict'),
      language: sql.placeholder('language'),
      submitted_at: sql`${sql.placeholder('submittedAt')}`,
      runtime_ms: sql.placeholder('runtimeMs'),
      memory_kb: sql.placeholder('memoryKb'),
      source_url: sql.placeholder('sourceUrl'),
      raw_json: sql.placeholder('rawJson'),
      created_at: sql`${sql.placeholder('now')}`,
      updated_at: sql`${sql.placeholder('now')}`,
    })
    .prepare()
  insert.run({
    id: crypto.randomUUID(),
    problemId: data.problemId ?? null,
    platform: data.platform,
    platformSubmissionId: data.platformSubmissionId,
    verdict: data.verdict,
    rawVerdict: data.rawVerdict ?? null,
    language: data.language ?? null,
    submittedAt: data.submittedAt,
    runtimeMs: data.runtimeMs ?? null,
    memoryKb: data.memoryKb ?? null,
    sourceUrl: data.sourceUrl ?? null,
    rawJson: data.rawJson ?? null,
    now,
  })

  emitDataChanged(['submissions', 'problems', 'stats'])
  return true
}
