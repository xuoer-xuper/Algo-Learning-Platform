import type Database from 'better-sqlite3'
import { nowBeijing } from '../../shared/time'

export function inferProblemContext(platform: string, platformProblemId: string): { contestId?: string; problemIndex?: string } | null {
  if (platform === 'codeforces') {
    const match = platformProblemId.match(/^(\d+)([A-Za-z]\d*)$/)
    return match ? { contestId: match[1], problemIndex: match[2] } : null
  }

  if (platform === 'nowcoder' || platform === 'vjudge') {
    const match = platformProblemId.match(/^contest-(\d+)-(.+)$/)
    return match ? { contestId: match[1], problemIndex: match[2] } : null
  }

  if (platform === 'pta') {
    const match = platformProblemId.match(/^(\d+)-(\d+)$/)
    return match ? { contestId: match[1], problemIndex: match[2] } : null
  }

  return null
}

/** 回填早期插入时遗漏的 contest_id/problem_index */
export const migration017 = {
  version: 17,
  name: 'backfill_problem_context',
  up: (db: Database.Database) => {
    const rows = db.prepare(`
      SELECT id, platform, platform_problem_id, contest_id, problem_index
      FROM problems
      WHERE deleted_at IS NULL
        AND (contest_id IS NULL OR problem_index IS NULL)
    `).all() as {
      id: string
      platform: string
      platform_problem_id: string
      contest_id: string | null
      problem_index: string | null
    }[]

    const update = db.prepare(`
      UPDATE problems
      SET contest_id = COALESCE(contest_id, ?),
          problem_index = COALESCE(problem_index, ?),
          updated_at = ?
      WHERE id = ?
    `)
    const now = nowBeijing()

    for (const row of rows) {
      const context = inferProblemContext(row.platform, row.platform_problem_id)
      if (!context?.contestId && !context?.problemIndex) continue
      update.run(context.contestId ?? null, context.problemIndex ?? null, now, row.id)
    }
  },
}
