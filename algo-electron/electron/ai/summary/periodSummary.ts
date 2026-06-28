// P6-007: 阶段学习总结 —— 本地规则引擎
// 基于每日 AI 上下文快照（ai_context_snapshots）生成周/月/自定义周期学习总结
// 总结内容：学习量、平台分布、AC 情况、薄弱标签变化、与上一周期对比
// 所有数据来源于本地快照和统计表，不调用大模型，结果含可追溯依据
import { nowBeijing } from '../../shared/time'
import { getSnapshotByDate, listSnapshots } from '../../db/repositories/aiContextSnapshotRepository'
import {
  getStreakDays, getWrongProblems, getUnreviewedProblems
} from '../../db/repositories/statsRepository'

export type PeriodType = 'weekly' | 'monthly' | 'custom'

export interface PeriodSummaryInput {
  start_date: string // YYYY-MM-DD（含）
  end_date: string   // YYYY-MM-DD（含）
}

export interface PeriodSummary {
  generated_at: string
  rule_version: number
  period: {
    type: PeriodType | 'custom'
    start_date: string
    end_date: string
    days: number
  }
  // 学习量统计
  study_stats: {
    active_days: number
    total_problems_visited: number
    total_problems_solved: number
    total_submissions: number
    total_ac: number
    avg_daily_minutes: number
    streak: { current: number; longest: number }
  }
  // 平台分布
  platform_distribution: { platform: string; count: number }[]
  // 错题情况
  wrong_problems_count: number
  // 待复习题目
  unreviewed_count: number
  // 薄弱标签快照（周期末）
  weak_tags: string[]
  // 与上一周期对比
  comparison: {
    prev_start_date: string
    prev_end_date: string
    changes: {
      metric: string
      current: number
      previous: number
      delta: number
      trend: 'up' | 'down' | 'flat'
    }[]
  } | null
  // 可追溯依据
  evidence: string
  // 来源快照列表
  source_snapshots: { snapshot_date: string; created_at: string }[]
}

const RULE_VERSION = 1

// 将 Date 格式化为本地日期字符串 YYYY-MM-DD（不使用 toISOString，避免时区偏移）
function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 计算周期的上一周期（等长天数，紧接之前）
function getPreviousPeriod(start: string, end: string): { prevStart: string; prevEnd: string } {
  const startDate = new Date(start + 'T00:00:00')
  const endDate = new Date(end + 'T00:00:00')
  const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1
  const prevEnd = new Date(startDate.getTime() - 86400000) // 前一天
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000)
  return {
    prevStart: formatLocalDate(prevStart),
    prevEnd: formatLocalDate(prevEnd),
  }
}

// 从快照列表中提取周期内的快照
function getSnapshotsInPeriod(snapshots: ReturnType<typeof listSnapshots>, startDate: string, endDate: string) {
  return snapshots.filter(s => s.snapshot_date >= startDate && s.snapshot_date <= endDate)
}

// 从快照聚合周期统计
function aggregateFromSnapshots(snapshots: ReturnType<typeof getSnapshotsInPeriod>) {
  let totalVisited = 0
  let totalSolved = 0
  let totalSubmissions = 0
  let totalAc = 0
  let activeDays = 0
  let totalActiveSeconds = 0
  const platformMap = new Map<string, number>()
  const weakTagsSet = new Set<string>()

  // snapshots 按 DESC 排序（最新在前），snapshots[0] 是周期末（最新）快照
  // 平台分布和薄弱标签应取最新快照，而非在循环中覆盖
  for (const snap of snapshots) {
    const ctx = getSnapshotByDate(snap.snapshot_date)
    if (!ctx) continue
    const data = ctx.context

    // 从 daily_stats 取当日活跃数据
    if (data.trends?.daily_stats) {
      for (const d of data.trends.daily_stats) {
        if (d.local_day === snap.snapshot_date) {
          if (d.active_seconds > 0 || d.visited > 0) activeDays++
          totalActiveSeconds += d.active_seconds || 0
          totalVisited += d.visited || 0
          totalSolved += d.solved || 0
          totalSubmissions += d.submissions || 0
          totalAc += d.ac || 0
        }
      }
    }
  }

  // 取最新快照（snapshots[0]）的累计型统计：平台分布、薄弱标签
  if (snapshots.length > 0) {
    const latestCtx = getSnapshotByDate(snapshots[0].snapshot_date)
    if (latestCtx) {
      const latestData = latestCtx.context

      // 平台分布取最新快照的累计值
      if (latestData.trends?.platform_distribution) {
        for (const p of latestData.trends.platform_distribution) {
          platformMap.set(p.platform, p.count)
        }
      }

      // 薄弱标签取最新快照
      if (latestData.tag_stats) {
        for (const t of latestData.tag_stats) {
          if (t.ac_rate < 70 && t.total >= 2) {
            weakTagsSet.add(t.tag)
          }
        }
      }
    }
  }

  return {
    totalVisited,
    totalSolved,
    totalSubmissions,
    totalAc,
    activeDays,
    totalActiveSeconds,
    avgDailyMinutes: snapshots.length > 0 ? Math.round(totalActiveSeconds / snapshots.length / 60) : 0,
    platformDistribution: Array.from(platformMap.entries())
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count),
    weakTags: Array.from(weakTagsSet),
  }
}

export function getPeriodSummary(input: PeriodSummaryInput): PeriodSummary {
  const { start_date, end_date } = input
  const startDate = new Date(start_date + 'T00:00:00')
  const endDate = new Date(end_date + 'T00:00:00')
  const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1

  // 获取周期内所有快照
  const allSnapshots = listSnapshots(90) // 取最近90天
  const periodSnapshots = getSnapshotsInPeriod(allSnapshots, start_date, end_date)

  // 从快照聚合统计
  const aggregated = aggregateFromSnapshots(periodSnapshots)

  // 从 statsRepository 获取当前实时统计作为补充
  const streak = getStreakDays()
  const wrongProblems = getWrongProblems(100)
  const unreviewed = getUnreviewedProblems(30, 100)

  // 上一周期对比
  const { prevStart, prevEnd } = getPreviousPeriod(start_date, end_date)
  const prevSnapshots = getSnapshotsInPeriod(allSnapshots, prevStart, prevEnd)
  const prevAggregated = aggregateFromSnapshots(prevSnapshots)

  let comparison: PeriodSummary['comparison'] = null
  if (prevSnapshots.length > 0) {
    const changes: NonNullable<PeriodSummary['comparison']>['changes'] = []
    const metrics: [string, number, number][] = [
      ['活跃天数', aggregated.activeDays, prevAggregated.activeDays],
      ['刷题数', aggregated.totalVisited, prevAggregated.totalVisited],
      ['AC 数', aggregated.totalSolved, prevAggregated.totalSolved],
      ['提交数', aggregated.totalSubmissions, prevAggregated.totalSubmissions],
    ]
    for (const [metric, current, previous] of metrics) {
      const delta = current - previous
      changes.push({
        metric,
        current,
        previous,
        delta,
        trend: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
      })
    }
    comparison = {
      prev_start_date: prevStart,
      prev_end_date: prevEnd,
      changes,
    }
  }

  // 可追溯依据
  const evidenceParts: string[] = []
  evidenceParts.push(`基于 ${periodSnapshots.length} 个每日快照`)
  if (comparison) {
    evidenceParts.push(`与上一周期（${prevStart} 至 ${prevEnd}）对比`)
  }
  evidenceParts.push(`数据来源于 ai_context_snapshots 和 statsRepository`)

  return {
    generated_at: nowBeijing(),
    rule_version: RULE_VERSION,
    period: {
      type: days === 7 ? 'weekly' : days === 30 || days === 31 ? 'monthly' : 'custom',
      start_date,
      end_date,
      days,
    },
    study_stats: {
      active_days: aggregated.activeDays,
      total_problems_visited: aggregated.totalVisited,
      total_problems_solved: aggregated.totalSolved,
      total_submissions: aggregated.totalSubmissions,
      total_ac: aggregated.totalAc,
      avg_daily_minutes: aggregated.avgDailyMinutes,
      streak,
    },
    platform_distribution: aggregated.platformDistribution,
    wrong_problems_count: wrongProblems.length,
    unreviewed_count: unreviewed.length,
    weak_tags: aggregated.weakTags,
    comparison,
    evidence: evidenceParts.join('，'),
    source_snapshots: periodSnapshots.map(s => ({
      snapshot_date: s.snapshot_date,
      created_at: s.created_at,
    })),
  }
}

// 渲染为 Markdown
export function renderSummaryAsMarkdown(summary: PeriodSummary): string {
  const lines: string[] = []
  lines.push(`# 阶段学习总结`)
  lines.push('')
  lines.push(`> 周期：${summary.period.start_date} 至 ${summary.period.end_date}（${summary.period.days} 天）`)
  lines.push(`> 生成时间：${summary.generated_at}`)
  lines.push('')
  lines.push(`## 学习量`)
  lines.push(`- 活跃天数：${summary.study_stats.active_days} / ${summary.period.days} 天`)
  lines.push(`- 刷题数：${summary.study_stats.total_problems_visited}`)
  lines.push(`- AC 数：${summary.study_stats.total_problems_solved}`)
  lines.push(`- 提交数：${summary.study_stats.total_submissions}（AC ${summary.study_stats.total_ac}）`)
  lines.push(`- 日均学习：${summary.study_stats.avg_daily_minutes} 分钟`)
  lines.push(`- 连续学习：当前 ${summary.study_stats.streak.current} 天，最长 ${summary.study_stats.streak.longest} 天`)
  lines.push('')
  if (summary.platform_distribution.length > 0) {
    lines.push(`## 平台分布`)
    for (const p of summary.platform_distribution) {
      lines.push(`- ${p.platform}：${p.count} 题`)
    }
    lines.push('')
  }
  lines.push(`## 错题与复习`)
  lines.push(`- 错题数：${summary.wrong_problems_count}`)
  lines.push(`- 待复习：${summary.unreviewed_count} 题`)
  if (summary.weak_tags.length > 0) {
    lines.push(`- 薄弱标签：${summary.weak_tags.join('、')}`)
  }
  lines.push('')
  if (summary.comparison) {
    lines.push(`## 与上一周期对比（${summary.comparison.prev_start_date} 至 ${summary.comparison.prev_end_date}）`)
    lines.push(`| 指标 | 本周期 | 上周期 | 变化 |`)
    lines.push(`| --- | --- | --- | --- |`)
    for (const c of summary.comparison.changes) {
      const arrow = c.trend === 'up' ? '↑' : c.trend === 'down' ? '↓' : '→'
      lines.push(`| ${c.metric} | ${c.current} | ${c.previous} | ${arrow} ${c.delta > 0 ? '+' : ''}${c.delta} |`)
    }
    lines.push('')
  }
  lines.push(`> ${summary.evidence}`)
  return lines.join('\n')
}
