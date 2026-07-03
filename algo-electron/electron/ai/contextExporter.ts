// P6-004: AI 上下文导出层。该入口负责聚合脱敏本地学习数据，供规则引擎或外部 AI 工具消费。
import { getDb } from '../db/connection'
import { nowBeijing } from '../shared/time'
import {
  getDailyActiveStats,
  getPlatformDistribution,
  getStreakDays,
  getTimeline,
  getUnreviewedProblems,
  getWrongProblems,
} from '../db/repositories/statsRepository'
import { aggregateContextTagStats } from './contextTagStats'
import type { AIContextExport } from './contextTypes'

export { renderContextAsMarkdown } from './contextMarkdown'
export type { AIContextExport } from './contextTypes'

export const AI_CONTEXT_VERSION = 1

interface ProblemOverviewRow {
  total: number
  solved: number
  attempted: number
  visited: number
}

interface SubmissionOverviewRow {
  total: number
  ac: number
}

export function exportAIContext(): AIContextExport {
  const db = getDb()

  const overview = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'solved' THEN 1 ELSE 0 END) as solved,
      SUM(CASE WHEN status = 'attempted' THEN 1 ELSE 0 END) as attempted,
      SUM(CASE WHEN status = 'visited' THEN 1 ELSE 0 END) as visited
    FROM problems WHERE deleted_at IS NULL
  `).get() as ProblemOverviewRow

  const submissionStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN verdict = 'AC' THEN 1 ELSE 0 END) as ac
    FROM submissions
  `).get() as SubmissionOverviewRow

  const dailyStats = getDailyActiveStats(30).map(day => ({
    local_day: day.local_day,
    active_seconds: day.active_seconds,
    duration_seconds: day.duration_seconds,
    visited: day.visited,
    solved: day.solved,
    submissions: day.submissions,
    ac: day.ac,
  }))

  const platformDistribution = getPlatformDistribution()

  return {
    schema_version: AI_CONTEXT_VERSION,
    exported_at: nowBeijing(),
    overview: {
      total_problems: overview.total || 0,
      solved_problems: overview.solved || 0,
      attempted_problems: overview.attempted || 0,
      visited_problems: overview.visited || 0,
      total_submissions: submissionStats.total || 0,
      ac_submissions: submissionStats.ac || 0,
      platforms: platformDistribution,
      streak: getStreakDays(),
    },
    trends: {
      daily_stats: dailyStats,
      platform_distribution: platformDistribution,
    },
    wrong_problems: getWrongProblems(50).map(problem => ({
      platform: problem.platform,
      platform_problem_id: problem.platform_problem_id,
      title: problem.title,
      wrong_count: problem.wrong_count,
      last_attempt: problem.last_attempt,
    })),
    unreviewed_problems: getUnreviewedProblems(30, 50).map(problem => ({
      platform: problem.platform,
      platform_problem_id: problem.platform_problem_id,
      title: problem.title,
      last_visited_at: problem.last_visited_at,
      days_since: problem.days_since,
    })),
    tag_stats: aggregateContextTagStats(),
    recent_activity: getTimeline(30).map(event => ({
      event_type: event.event_type,
      occurred_at: event.occurred_at,
      platform: event.platform,
    })),
  }
}
