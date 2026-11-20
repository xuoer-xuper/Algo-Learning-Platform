import { and, asc, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm'
import { getDb } from '../../connection'
import { createDrizzleClient } from '../../../../src/main/db/client'
import { submissions } from '../../../../src/main/db/schema'
import type { ProblemFirstAcRow, SubmissionRow } from './types'

const submissionColumns = {
  ...getTableColumns(submissions),
  submitted_at: sql<number>`${submissions.submitted_at}`,
  created_at: sql<number>`${submissions.created_at}`,
  updated_at: sql<number>`${submissions.updated_at}`,
  deleted_at: sql<number | null>`${submissions.deleted_at}`,
}

export function getSubmissionsByProblem(problemId: string): SubmissionRow[] {
  const db = createDrizzleClient(getDb())
  return db
    .select(submissionColumns)
    .from(submissions)
    .where(eq(submissions.problem_id, problemId))
    .orderBy(desc(submissions.submitted_at))
    .all()
}

/**
 * 列出某道题的全部提交（按提交时间升序），供阶段 4 时间轴复盘使用。
 * 与 getSubmissionsByProblem 的区别仅在排序方向，便于时间轴顺序渲染。
 */
export function getSubmissionsByProblemAsc(problemId: string): SubmissionRow[] {
  const db = createDrizzleClient(getDb())
  return db
    .select(submissionColumns)
    .from(submissions)
    .where(eq(submissions.problem_id, problemId))
    .orderBy(asc(submissions.submitted_at))
    .all()
}

export function getSubmissionsByPlatform(platform: string, limit = 50): SubmissionRow[] {
  const db = createDrizzleClient(getDb())
  return (
    db
      .select(submissionColumns)
      .from(submissions)
      .where(eq(submissions.platform, platform))
      .orderBy(desc(submissions.submitted_at))
      // Preserve native LIMIT binding/errors, including NaN and negative fractions.
      .limit(sql.placeholder('limit'))
      .all({ limit })
  )
}

/**
 * 批量查询一组题目的首次 AC 提交时间。
 * 供阶段 4 指标页"干预后同题 AC 转化率"使用：
 * 对每个有干预记录的 problem_id，判断是否存在 AC 且 AC 时间晚于最早干预时间。
 *
 * @param problemIds 需要查询的 problem_id 列表（来自 coach_interventions）
 * @returns 每道题的 { problem_id, first_ac_at }，无 AC 的题目不返回
 */
export function getFirstAcByProblemIds(problemIds: string[]): ProblemFirstAcRow[] {
  if (problemIds.length === 0) return []
  const db = createDrizzleClient(getDb())
  return (
    db
      .select({
        problem_id: submissions.problem_id,
        first_ac_at: sql<number>`MIN(${submissions.submitted_at})`,
      })
      .from(submissions)
      // AC stays a literal so only input IDs count toward SQLite's bind limit.
      .where(and(sql`${submissions.verdict} = 'AC'`, inArray(submissions.problem_id, problemIds)))
      .groupBy(submissions.problem_id)
      .all()
  )
}
