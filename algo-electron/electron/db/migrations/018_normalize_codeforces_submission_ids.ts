import type Database from 'better-sqlite3'
import { nowBeijing } from '../../shared/time'

interface CodeforcesNumericSubmissionRow {
  id: string
  problem_id: string | null
  platform_submission_id: string
  raw_verdict: string | null
  language: string | null
  runtime_ms: number | null
  memory_kb: number | null
  source_url: string | null
  raw_json: string | null
}

export function normalizeCodeforcesSubmissionIds(db: Database.Database): void {
  const rows = db.prepare(`
    SELECT id, problem_id, platform_submission_id, raw_verdict, language, runtime_ms, memory_kb, source_url, raw_json
    FROM submissions
    WHERE platform = 'codeforces'
      AND platform_submission_id GLOB '[0-9]*'
      AND platform_submission_id NOT GLOB '*[^0-9]*'
  `).all() as CodeforcesNumericSubmissionRow[]

  if (!rows.length) return

  const now = nowBeijing()
  const findDuplicate = db.prepare(`
    SELECT id FROM submissions
    WHERE platform = 'codeforces' AND platform_submission_id = ?
  `)
  const mergeDuplicate = db.prepare(`
    UPDATE submissions
    SET problem_id = COALESCE(problem_id, ?),
        raw_verdict = COALESCE(raw_verdict, ?),
        language = COALESCE(language, ?),
        runtime_ms = COALESCE(runtime_ms, ?),
        memory_kb = COALESCE(memory_kb, ?),
        source_url = COALESCE(source_url, ?),
        raw_json = COALESCE(raw_json, ?),
        updated_at = ?
    WHERE id = ?
  `)
  const deleteRow = db.prepare('DELETE FROM submissions WHERE id = ?')
  const updateId = db.prepare(`
    UPDATE submissions
    SET platform_submission_id = ?,
        updated_at = ?
    WHERE id = ?
  `)

  const transaction = db.transaction(() => {
    for (const row of rows) {
      const normalizedId = `cf-${row.platform_submission_id}`
      const duplicate = findDuplicate.get(normalizedId) as { id: string } | undefined

      if (duplicate) {
        mergeDuplicate.run(
          row.problem_id,
          row.raw_verdict,
          row.language,
          row.runtime_ms,
          row.memory_kb,
          row.source_url,
          row.raw_json,
          now,
          duplicate.id,
        )
        deleteRow.run(row.id)
        continue
      }

      updateId.run(normalizedId, now, row.id)
    }
  })

  transaction()
}

export const migration018 = {
  version: 18,
  name: 'normalize_codeforces_submission_ids',
  up: normalizeCodeforcesSubmissionIds,
}
