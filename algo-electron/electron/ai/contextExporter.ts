// P6-004: AI 上下文导出层
// 聚合本地学习数据，供 AI 工具消费或本地规则引擎使用
// 严格剥离敏感信息：不含 Cookie、绝对文件路径、日志内容
// 时间戳统一使用本地时间（nowBeijing，无时区后缀），与数据库存储格式一致
import { getDb } from '../db/connection'
import { nowBeijing } from '../shared/time'
import {
  getDailyActiveStats, getStreakDays, getPlatformDistribution,
  getWrongProblems, getUnreviewedProblems, getTimeline
} from '../db/repositories/statsRepository'

export const AI_CONTEXT_VERSION = 1

export interface AIContextExport {
  schema_version: number
  exported_at: string
  // 脱敏概览：仅统计数字
  overview: {
    total_problems: number
    solved_problems: number
    attempted_problems: number
    visited_problems: number
    total_submissions: number
    ac_submissions: number
    platforms: { platform: string; count: number }[]
    streak: { current: number; longest: number }
  }
  // 趋势：每日聚合数字，不含 URL/题面
  trends: {
    daily_stats: { local_day: string; active_seconds: number; duration_seconds: number; visited: number; solved: number; submissions: number; ac: number }[]
    platform_distribution: { platform: string; count: number }[]
  }
  // 错题：仅题目标识 + 统计，不含代码/题面
  wrong_problems: {
    platform: string
    platform_problem_id: string
    title: string | null
    wrong_count: number
    last_attempt: string
  }[]
  // 待复习：仅题目标识
  unreviewed_problems: {
    platform: string
    platform_problem_id: string
    title: string | null
    last_visited_at: string
    days_since: number
  }[]
  // 标签维度统计（P6-006 用）：仅标签名 + 频次/AC 率
  tag_stats: {
    tag: string
    total: number
    solved: number
    attempted: number
    ac_rate: number
  }[]
  // 最近活动：仅事件类型 + 平台 + 时间，不含 URL/题面内容
  recent_activity: {
    event_type: string
    occurred_at: string
    platform: string | null
  }[]
}

// 从 problems + submissions 聚合标签维度统计
function aggregateTagStats(): {
  tag: string
  total: number
  solved: number
  attempted: number
  ac_rate: number
}[] {
  const db = getDb()
  // 收集所有题目的 tags_json
  const rows = db.prepare(`
    SELECT p.id, p.tags_json,
      CASE
        WHEN EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id AND s.verdict = 'AC') THEN 'solved'
        WHEN EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id) THEN 'attempted'
        ELSE 'visited'
      END as status
    FROM problems p
    WHERE p.deleted_at IS NULL AND p.tags_json IS NOT NULL AND p.tags_json != '[]' AND p.tags_json != ''
  `).all() as { id: string; tags_json: string | null; status: string }[]

  const tagMap = new Map<string, { total: number; solved: number; attempted: number }>()

  for (const row of rows) {
    let tags: string[] = []
    try {
      const parsed = JSON.parse(row.tags_json || '[]')
      if (Array.isArray(parsed)) tags = parsed.filter((t: any) => typeof t === 'string' && t.trim())
    } catch { continue }

    for (const tag of tags) {
      const key = tag.trim()
      if (!key) continue
      if (!tagMap.has(key)) tagMap.set(key, { total: 0, solved: 0, attempted: 0 })
      const entry = tagMap.get(key)!
      entry.total++
      if (row.status === 'solved') entry.solved++
      else if (row.status === 'attempted') entry.attempted++
    }
  }

  return Array.from(tagMap.entries())
    .map(([tag, v]) => ({
      tag,
      total: v.total,
      solved: v.solved,
      attempted: v.attempted,
      ac_rate: v.total > 0 ? Math.round((v.solved / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
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
  `).get() as { total: number; solved: number; attempted: number; visited: number }

  const submissionStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN verdict = 'AC' THEN 1 ELSE 0 END) as ac
    FROM submissions
  `).get() as { total: number; ac: number }

  const dailyStats = getDailyActiveStats(30).map(d => ({
    local_day: d.local_day,
    active_seconds: d.active_seconds,
    duration_seconds: d.duration_seconds,
    visited: d.visited,
    solved: d.solved,
    submissions: d.submissions,
    ac: d.ac,
  }))

  const streak = getStreakDays()
  const platformDist = getPlatformDistribution()
  const wrong = getWrongProblems(50)
  const unreviewed = getUnreviewedProblems(30, 50)
  const tagStats = aggregateTagStats()
  const timeline = getTimeline(30).map(e => ({
    event_type: e.event_type,
    occurred_at: e.occurred_at,
    platform: e.platform,
  }))

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
      platforms: platformDist,
      streak,
    },
    trends: {
      daily_stats: dailyStats,
      platform_distribution: platformDist,
    },
    wrong_problems: wrong.map(p => ({
      platform: p.platform,
      platform_problem_id: p.platform_problem_id,
      title: p.title,
      wrong_count: p.wrong_count,
      last_attempt: p.last_attempt,
    })),
    unreviewed_problems: unreviewed.map(p => ({
      platform: p.platform,
      platform_problem_id: p.platform_problem_id,
      title: p.title,
      last_visited_at: p.last_visited_at,
      days_since: p.days_since,
    })),
    tag_stats: tagStats,
    recent_activity: timeline,
  }
}

// 渲染为 Markdown 摘要（供复制到外部 AI 工具或本地阅读）
export function renderContextAsMarkdown(ctx: AIContextExport): string {
  const lines: string[] = []
  lines.push(`# 学习数据上下文`)
  lines.push('')
  lines.push(`> 导出时间：${ctx.exported_at} ｜ schema v${ctx.schema_version}`)
  lines.push('')
  lines.push(`## 概览`)
  lines.push(`- 题目总数：${ctx.overview.total_problems}（已通过 ${ctx.overview.solved_problems}，尝试中 ${ctx.overview.attempted_problems}，仅访问 ${ctx.overview.visited_problems}）`)
  lines.push(`- 提交总数：${ctx.overview.total_submissions}（AC ${ctx.overview.ac_submissions}）`)
  lines.push(`- 连续学习：当前 ${ctx.overview.streak.current} 天，最长 ${ctx.overview.streak.longest} 天`)
  lines.push(`- 平台分布：${ctx.overview.platforms.map(p => `${p.platform} ${p.count}`).join('、') || '无'}`)
  lines.push('')
  if (ctx.tag_stats.length > 0) {
    lines.push(`## 标签维度（按题量排序）`)
    lines.push(`| 标签 | 题量 | 已通过 | AC率 |`)
    lines.push(`| --- | --- | --- | --- |`)
    for (const t of ctx.tag_stats.slice(0, 20)) {
      lines.push(`| ${t.tag} | ${t.total} | ${t.solved} | ${t.ac_rate}% |`)
    }
    lines.push('')
  }
  if (ctx.wrong_problems.length > 0) {
    lines.push(`## 错题（${ctx.wrong_problems.length}）`)
    for (const p of ctx.wrong_problems.slice(0, 15)) {
      lines.push(`- [${p.platform} ${p.platform_problem_id}] ${p.title || '无标题'} — 错误 ${p.wrong_count} 次，最近 ${p.last_attempt.replace('T', ' ').slice(0, 16)}`)
    }
    lines.push('')
  }
  if (ctx.unreviewed_problems.length > 0) {
    lines.push(`## 待复习（${ctx.unreviewed_problems.length}）`)
    for (const p of ctx.unreviewed_problems.slice(0, 15)) {
      lines.push(`- [${p.platform} ${p.platform_problem_id}] ${p.title || '无标题'} — ${p.days_since} 天未访问`)
    }
  }
  return lines.join('\n')
}
