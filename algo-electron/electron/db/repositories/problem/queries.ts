import { and, asc, count, desc, eq, exists, getTableColumns, isNull, sql } from 'drizzle-orm'
import { getDb } from '../../connection'
import { createDrizzleClient } from '../../../../src/main/db/client'
import { problems, problemVisits, submissions } from '../../../../src/main/db/schema'
import type { ProblemDetail, ProblemVisitRow, RecentProblem } from './types'

export function getRecentProblems(limit = 50, platform?: string, status?: string): RecentProblem[] {
  const db = createDrizzleClient(getDb())
  const matchingSubmissions = eq(submissions.problem_id, problems.id)
  const rows = db
    .select({
      id: problems.id,
      platform: problems.platform,
      platform_problem_id: problems.platform_problem_id,
      canonical_url: problems.canonical_url,
      title: problems.title,
      last_visited_at: sql<number | null>`${problems.last_visited_at}`,
      status: sql<string>`CASE
        WHEN ${exists(
          db
            .select({ value: sql`1` })
            .from(submissions)
            .where(and(matchingSubmissions, eq(submissions.verdict, 'AC'))),
        )} THEN 'solved'
        WHEN ${exists(
          db
            .select({ value: sql`1` })
            .from(submissions)
            .where(matchingSubmissions),
        )} THEN 'attempted'
        ELSE ${problems.status}
      END`,
      submission_count: sql<number>`(${db.select({ value: count() }).from(submissions).where(matchingSubmissions)})`,
    })
    .from(problems)
    .where(and(isNull(problems.deleted_at), platform ? eq(problems.platform, platform) : undefined))
    .orderBy(desc(problems.last_visited_at))
    // A placeholder preserves native LIMIT errors; numeric NaN would omit LIMIT.
    .limit(sql.placeholder('limit'))
    .all({ limit })

  return status ? rows.filter((row) => row.status === status) : rows
}

export function getProblemDetail(problemId: string): ProblemDetail | null {
  const db = createDrizzleClient(getDb())
  const matchingSubmissions = eq(submissions.problem_id, problems.id)
  const acceptedSubmissions = and(matchingSubmissions, eq(submissions.verdict, 'AC'))
  const problem = db
    .select({
      ...getTableColumns(problems),
      // The unchanged equality proves this bound text equals the selected ID.
      id: sql<string>`${problemId}`,
      first_seen_at: sql<number>`${problems.first_seen_at}`,
      last_visited_at: sql<number | null>`${problems.last_visited_at}`,
      first_solved_at: sql<number | null>`${problems.first_solved_at}`,
      created_at: sql<number>`${problems.created_at}`,
      updated_at: sql<number>`${problems.updated_at}`,
      deleted_at: sql<number | null>`${problems.deleted_at}`,
      status: sql<string>`CASE
        WHEN ${exists(
          db
            .select({ value: sql`1` })
            .from(submissions)
            .where(acceptedSubmissions),
        )} THEN 'solved'
        WHEN ${exists(
          db
            .select({ value: sql`1` })
            .from(submissions)
            .where(matchingSubmissions),
        )} THEN 'attempted'
        ELSE ${problems.status}
      END`,
      submission_count: sql<number>`(${db.select({ value: count() }).from(submissions).where(matchingSubmissions)})`,
      ac_count: sql<number>`(${db.select({ value: count() }).from(submissions).where(acceptedSubmissions)})`,
    })
    .from(problems)
    .where(and(eq(problems.id, problemId), isNull(problems.deleted_at)))
    .get()

  if (!problem) return null

  const submissionRows = db
    .select({
      ...getTableColumns(submissions),
      submitted_at: sql<number>`${submissions.submitted_at}`,
      created_at: sql<number>`${submissions.created_at}`,
      updated_at: sql<number>`${submissions.updated_at}`,
      deleted_at: sql<number | null>`${submissions.deleted_at}`,
    })
    .from(submissions)
    .where(eq(submissions.problem_id, problemId))
    .orderBy(desc(submissions.submitted_at))
    .limit(100)
    .all()

  return { ...problem, submissions: submissionRows }
}

/**
 * 列出某道题的全部访问记录（按进入时间升序），供阶段 4 时间轴复盘使用。
 * 数据全部来自现有 problem_visits 表，不新增采集。
 */
export function listProblemVisitsByProblem(problemId: string): ProblemVisitRow[] {
  const db = createDrizzleClient(getDb())
  return db
    .select({
      id: problemVisits.id,
      problem_id: problemVisits.problem_id,
      session_id: problemVisits.session_id,
      platform: problemVisits.platform,
      url: problemVisits.url,
      entered_at: sql<number>`${problemVisits.entered_at}`,
      left_at: sql<number | null>`${problemVisits.left_at}`,
      duration_seconds: problemVisits.duration_seconds,
      active_seconds: problemVisits.active_seconds,
      leave_reason: problemVisits.leave_reason,
    })
    .from(problemVisits)
    .where(eq(problemVisits.problem_id, problemId))
    .orderBy(asc(problemVisits.entered_at))
    .all()
}

/**
 * 根据 platform + platform_problem_id 查询 problem_id（Issue #3）。
 * 返回 null 表示该题尚未入库（未访问过 / 解析失败）。
 */
export function findProblemIdByPlatformKey(
  platform: string,
  platformProblemId: string,
): string | null {
  const db = createDrizzleClient(getDb())
  const row = db
    .select({ id: problems.id })
    .from(problems)
    .where(
      and(
        eq(problems.platform, platform),
        eq(problems.platform_problem_id, platformProblemId),
        isNull(problems.deleted_at),
      ),
    )
    .get()
  return row?.id ?? null
}
