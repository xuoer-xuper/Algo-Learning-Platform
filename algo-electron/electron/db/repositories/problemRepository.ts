import crypto from 'node:crypto'
import { getDb } from '../connection'
import type { ProblemIdentity } from '../../shared/types'
import { nowBeijing, todayBeijing } from '../../shared/time'
import { isBadScrapedTitle, isValidScrapedTitle } from '../../parsers/titleValidation'
import { resolveNavigateUrl } from '../../parsers/navigateUrl'

export function upsertProblem(identity: ProblemIdentity): void {
  const db = getDb()
  const now = nowBeijing()
  const canonicalUrl = resolveNavigateUrl(identity.canonicalUrl)

  const existing = db.prepare(
    'SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ?'
  ).get(identity.platform, identity.platformProblemId) as { id: string } | undefined

  if (existing) {
    db.prepare(`
      UPDATE problems SET
        canonical_url = ?,
        contest_id = COALESCE(?, contest_id),
        problem_index = COALESCE(?, problem_index),
        last_visited_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      canonicalUrl,
      identity.contestId ?? null,
      identity.problemIndex ?? null,
      now,
      now,
      existing.id,
    )
  } else {
    db.prepare(`
      INSERT INTO problems (id, platform, platform_problem_id, canonical_url, status, source_platform, source_problem_id, first_seen_at, last_visited_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'visited', ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      identity.platform,
      identity.platformProblemId,
      canonicalUrl,
      identity.sourcePlatform ?? null,
      identity.sourceProblemId ?? null,
      now, now, now, now,
    )
  }
}

export function updateProblemTitleByUrl(url: string, title: string): void {
  if (!isValidScrapedTitle(title)) return

  const db = getDb()
  const now = nowBeijing()
  const row = db.prepare(
    'SELECT title FROM problems WHERE canonical_url = ?'
  ).get(url) as { title: string | null } | undefined

  if (!row) return

  const shouldUpdate =
    !row.title?.trim() || isBadScrapedTitle(row.title)

  if (!shouldUpdate) return

  db.prepare(`
    UPDATE problems SET title = ?, updated_at = ?
    WHERE canonical_url = ?
  `).run(title.trim(), now, url)
}

export function getRecentProblems(limit = 50, platform?: string, status?: string): any[] {
  const db = getDb()
  let sql = `
    SELECT
      p.id, p.platform, p.platform_problem_id, p.canonical_url, p.title, p.last_visited_at,
      CASE
        WHEN EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id AND s.verdict = 'AC') THEN 'solved'
        WHEN EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id) THEN 'attempted'
        ELSE p.status
      END as status,
      (SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id) as submission_count
    FROM problems p
    WHERE p.deleted_at IS NULL
  `
  const params: any[] = []

  if (platform) {
    sql += ` AND p.platform = ?`
    params.push(platform)
  }

  sql += ` ORDER BY p.last_visited_at DESC LIMIT ?`
  params.push(limit)

  const rows = db.prepare(sql).all(...params) as any[]

  // 如果按状态筛选，需要在应用层过滤（因为 status 是计算字段）
  if (status) {
    return rows.filter(r => r.status === status)
  }
  return rows
}

export function deleteProblem(problemId: string): boolean {
  const db = getDb()

  // 级联删除所有关联数据
  db.prepare('DELETE FROM submissions WHERE problem_id = ?').run(problemId)
  db.prepare('DELETE FROM problem_visits WHERE problem_id = ?').run(problemId)
  db.prepare('DELETE FROM activity_events WHERE problem_id = ?').run(problemId)

  // 硬删题目
  const result = db.prepare('DELETE FROM problems WHERE id = ?').run(problemId)
  return result.changes > 0
}

export function getProblemDetail(problemId: string): any | null {
  const db = getDb()
  const problem = db.prepare(`
    SELECT
      p.*,
      CASE
        WHEN EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id AND s.verdict = 'AC') THEN 'solved'
        WHEN EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id) THEN 'attempted'
        ELSE p.status
      END as status,
      (SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id) as submission_count,
      (SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id AND s.verdict = 'AC') as ac_count
    FROM problems p
    WHERE p.id = ? AND p.deleted_at IS NULL
  `).get(problemId) as any | undefined

  if (!problem) return null

  // 获取提交记录
  const submissions = db.prepare(`
    SELECT * FROM submissions WHERE problem_id = ? ORDER BY submitted_at DESC LIMIT 100
  `).all(problemId)

  return { ...problem, submissions }
}

export function getProblemCount(): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) as count FROM problems WHERE deleted_at IS NULL').get() as { count: number }
  return row.count
}

// 平台分布统计
export function getPlatformDistribution(): { platform: string; count: number }[] {
  const db = getDb()
  return db.prepare(`
    SELECT platform, COUNT(*) as count
    FROM problems WHERE deleted_at IS NULL
    GROUP BY platform ORDER BY count DESC
  `).all() as { platform: string; count: number }[]
}

// 今日刷题数量
export function getTodayVisitedCount(): number {
  const db = getDb()
  const today = todayBeijing()
  const row = db.prepare(`
    SELECT COUNT(DISTINCT problem_id) as count
    FROM problem_visits
    WHERE entered_at LIKE ?
  `).get(today + '%') as { count: number }
  return row.count
}

// 最近活跃时间
export function getLastActiveTime(): string | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT occurred_at FROM activity_events
    ORDER BY occurred_at DESC LIMIT 1
  `).get() as { occurred_at: string } | undefined
  return row?.occurred_at ?? null
}

// 总览统计
export function getOverviewStats(): {
  totalProblems: number
  todayVisited: number
  platformDistribution: { platform: string; count: number }[]
  lastActiveTime: string | null
} {
  return {
    totalProblems: getProblemCount(),
    todayVisited: getTodayVisitedCount(),
    platformDistribution: getPlatformDistribution(),
    lastActiveTime: getLastActiveTime(),
  }
}
