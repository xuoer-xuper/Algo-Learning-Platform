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
export function getVisitedTrend(days?: number): { local_day: string; count: number }[] {
  const db = getDb()
  if (days) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    return db.prepare(`
      SELECT local_day, visited_problem_count as count
      FROM user_daily_stats
      WHERE local_day >= ?
      ORDER BY local_day ASC
    `).all(cutoff) as any[]
  }
  return db.prepare(`
    SELECT local_day, visited_problem_count as count
    FROM user_daily_stats
    ORDER BY local_day ASC
  `).all() as any[]
}

// --- P3-004: AC 数量趋势 ---
export function getAcTrend(days?: number): { local_day: string; count: number }[] {
  const db = getDb()
  if (days) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    return db.prepare(`
      SELECT local_day, solved_problem_count as count
      FROM user_daily_stats
      WHERE local_day >= ?
      ORDER BY local_day ASC
    `).all(cutoff) as any[]
  }
  return db.prepare(`
    SELECT local_day, solved_problem_count as count
    FROM user_daily_stats
    ORDER BY local_day ASC
  `).all() as any[]
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
      COALESCE(COUNT(*), 0) as total,
      COALESCE(SUM(CASE WHEN verdict = 'AC' THEN 1 ELSE 0 END), 0) as ac
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

// --- P3-009: 连续活跃天数 ---
export function getStreakDays(): { current: number; longest: number } {
  const db = getDb()
  const rows = db.prepare(`
    SELECT local_day FROM user_daily_stats
    WHERE active_seconds >= 300 OR submission_count > 0 OR solved_problem_count > 0
    ORDER BY local_day DESC
  `).all() as { local_day: string }[]

  if (rows.length === 0) return { current: 0, longest: 0 }

  // 从最近一天开始往回数连续天数
  let current = 1
  let longest = 1
  let streak = 1

  for (let i = 1; i < rows.length; i++) {
    const prev = new Date(rows[i - 1].local_day)
    const curr = new Date(rows[i].local_day)
    const diff = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24)

    if (diff === 1) {
      streak++
    } else {
      // 第一次断开时记录 current streak
      if (current === 1 && i === 1) current = streak
      longest = Math.max(longest, streak)
      streak = 1
    }
  }

  // 循环结束时更新
  longest = Math.max(longest, streak)
  // 如果从未断开，current = streak
  if (current === 1 && rows.length > 1) current = streak

  return { current, longest }
}

// --- P3-013: 错题列表 ---
export function getWrongProblems(limit = 50): {
  id: string
  platform: string
  platform_problem_id: string
  title: string | null
  wrong_count: number
  last_attempt: string
}[] {
  const db = getDb()
  return db.prepare(`
    SELECT
      p.id,
      p.platform,
      p.platform_problem_id,
      p.title,
      COUNT(s.id) as wrong_count,
      MAX(s.submitted_at) as last_attempt
    FROM problems p
    JOIN submissions s ON s.problem_id = p.id
    WHERE p.deleted_at IS NULL
      AND s.verdict != 'AC'
      AND NOT EXISTS (
        SELECT 1 FROM submissions s2
        WHERE s2.problem_id = p.id AND s2.verdict = 'AC'
      )
    GROUP BY p.id
    ORDER BY last_attempt DESC
    LIMIT ?
  `).all(limit) as any[]
}

// --- P3-014: 长期未复习题目 ---
export function getUnreviewedProblems(days = 30, limit = 50): {
  id: string
  platform: string
  platform_problem_id: string
  title: string | null
  last_visited_at: string
  days_since: number
}[] {
  const db = getDb()
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return db.prepare(`
    SELECT
      id,
      platform,
      platform_problem_id,
      title,
      last_visited_at,
      CAST(julianday('now') - julianday(last_visited_at) AS INTEGER) as days_since
    FROM problems
    WHERE deleted_at IS NULL
      AND last_visited_at < ?
      AND status != 'visited'
    ORDER BY last_visited_at ASC
    LIMIT ?
  `).all(cutoff, limit) as any[]
}

// --- P3-016: 批量重算 ---
export function recomputeAllDailyStats(): number {
  const db = getDb()
  const rows = db.prepare(`
    SELECT DISTINCT substr(entered_at, 1, 10) as day FROM problem_visits
    UNION
    SELECT DISTINCT substr(submitted_at, 1, 10) as day FROM submissions
    UNION
    SELECT DISTINCT substr(occurred_at, 1, 10) as day FROM activity_events
  `).all() as { day: string }[]

  for (const row of rows) {
    if (row.day) recomputeDailyStats(row.day)
  }

  return rows.length
}
