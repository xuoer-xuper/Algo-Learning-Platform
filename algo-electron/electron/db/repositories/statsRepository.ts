import { getDb } from '../connection'
import { nowBeijing, todayBeijing } from '../../shared/time'

// --- P3-002: 每日活跃时长 ---
export function getDailyActiveStats(days = 30): { local_day: string; active_seconds: number; duration_seconds: number }[] {
  const db = getDb()
  return db.prepare(`
    SELECT local_day, active_seconds, duration_seconds
    FROM user_daily_stats
    ORDER BY local_day DESC
    LIMIT ?
  `).all(days) as any[]
}

// --- P3-003: 刷题数量趋势 ---
export function getVisitedTrend(days = 30): { local_day: string; count: number }[] {
  const db = getDb()
  return db.prepare(`
    SELECT local_day, visited_problem_count as count
    FROM user_daily_stats
    ORDER BY local_day DESC
    LIMIT ?
  `).all(days) as any[]
}

// --- P3-004: AC 数量趋势 ---
export function getAcTrend(days = 30): { local_day: string; count: number }[] {
  const db = getDb()
  return db.prepare(`
    SELECT local_day, solved_problem_count as count
    FROM user_daily_stats
    ORDER BY local_day DESC
    LIMIT ?
  `).all(days) as any[]
}

// --- P3-005: 提交数量趋势 ---
export function getSubmissionTrend(days = 30): { local_day: string; total: number; ac: number }[] {
  const db = getDb()
  return db.prepare(`
    SELECT local_day, submission_count as total, ac_submission_count as ac
    FROM user_daily_stats
    ORDER BY local_day DESC
    LIMIT ?
  `).all(days) as any[]
}

// --- P3-006: 平台分布 ---
export function getPlatformDistribution(): { platform: string; count: number }[] {
  const db = getDb()
  return db.prepare(`
    SELECT platform, COUNT(*) as count
    FROM problems WHERE deleted_at IS NULL
    GROUP BY platform ORDER BY count DESC
  `).all() as any[]
}

// --- P3-007: 单题停留时间分析 ---
export function getProblemVisitStats(problemId: string): {
  total_visits: number
  total_duration: number
  total_active: number
  avg_duration: number
} {
  const db = getDb()
  return db.prepare(`
    SELECT
      COUNT(*) as total_visits,
      COALESCE(SUM(duration_seconds), 0) as total_duration,
      COALESCE(SUM(active_seconds), 0) as total_active,
      COALESCE(AVG(duration_seconds), 0) as avg_duration
    FROM problem_visits
    WHERE problem_id = ?
  `).get(problemId) as any
}

// --- P3-008: 学习轨迹时间线 ---
export function getTimeline(limit = 50): {
  id: string
  event_type: string
  occurred_at: string
  platform: string | null
  url: string | null
  problem_id: string | null
}[] {
  const db = getDb()
  return db.prepare(`
    SELECT id, event_type, occurred_at, platform, url, problem_id
    FROM activity_events
    ORDER BY occurred_at DESC
    LIMIT ?
  `).all(limit) as any[]
}

// --- P3-011: 最近活跃时间 ---
export function getLastActiveTime(): string | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT occurred_at FROM activity_events
    ORDER BY occurred_at DESC LIMIT 1
  `).get() as { occurred_at: string } | undefined
  return row?.occurred_at ?? null
}

// --- P3-012: 题目复访次数统计 ---
export function getRevisitStats(limit = 50): {
  problem_id: string
  platform: string
  platform_problem_id: string
  title: string | null
  visit_count: number
  last_visit: string
}[] {
  const db = getDb()
  return db.prepare(`
    SELECT
      p.id as problem_id,
      p.platform,
      p.platform_problem_id,
      p.title,
      COUNT(pv.id) as visit_count,
      MAX(pv.entered_at) as last_visit
    FROM problems p
    JOIN problem_visits pv ON pv.problem_id = p.id
    WHERE p.deleted_at IS NULL
    GROUP BY p.id
    HAVING visit_count > 1
    ORDER BY visit_count DESC
    LIMIT ?
  `).all(limit) as any[]
}

// --- 聚合：写入 user_daily_stats ---
export function recomputeDailyStats(date?: string): void {
  const db = getDb()
  const targetDate = date || todayBeijing()
  const now = nowBeijing()

  // 从 problem_visits 统计
  const visits = db.prepare(`
    SELECT
      COALESCE(SUM(duration_seconds), 0) as duration,
      COALESCE(SUM(active_seconds), 0) as active,
      COUNT(DISTINCT problem_id) as visited
    FROM problem_visits
    WHERE entered_at LIKE ?
  `).get(targetDate + '%') as any

  // 从 submissions 统计
  const subs = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN verdict = 'AC' THEN 1 ELSE 0 END) as ac
    FROM submissions
    WHERE submitted_at LIKE ?
  `).get(targetDate + '%') as any

  // 从 problems 统计首次 AC
  const solved = db.prepare(`
    SELECT COUNT(*) as count
    FROM problems
    WHERE first_solved_at LIKE ? AND deleted_at IS NULL
  `).get(targetDate + '%') as any

  // 平台分布
  const platforms = db.prepare(`
    SELECT platform, COUNT(*) as count
    FROM problem_visits pv
    WHERE pv.entered_at LIKE ?
    GROUP BY platform
  `).all(targetDate + '%') as any[]

  const platformDist = platforms.length > 0 ? JSON.stringify(platforms) : null

  db.prepare(`
    INSERT INTO user_daily_stats (local_day, active_seconds, duration_seconds, visited_problem_count, solved_problem_count, submission_count, ac_submission_count, platform_distribution_json, recomputed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(local_day) DO UPDATE SET
      active_seconds = excluded.active_seconds,
      duration_seconds = excluded.duration_seconds,
      visited_problem_count = excluded.visited_problem_count,
      solved_problem_count = excluded.solved_problem_count,
      submission_count = excluded.submission_count,
      ac_submission_count = excluded.ac_submission_count,
      platform_distribution_json = excluded.platform_distribution_json,
      recomputed_at = excluded.recomputed_at,
      updated_at = excluded.updated_at
  `).run(targetDate, visits.active, visits.duration, visits.visited, solved.count, subs.total, subs.ac, platformDist, now, now, now)
}
