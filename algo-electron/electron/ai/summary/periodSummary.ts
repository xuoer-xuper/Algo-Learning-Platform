// P6-007: 阶段学习总结，本地规则引擎，不调用大模型。
import { nowBeijing } from '../../shared/time'
import { listSnapshots } from '../../db/repositories/aiContextSnapshotRepository'
import {
  getStreakDays,
  getUnreviewedProblems,
  getWrongProblems,
} from '../../db/repositories/statsRepository'
import { aggregateFromSnapshots, getSnapshotsInPeriod } from './periodSummaryAggregation'
import { countInclusiveDays, getPeriodType, getPreviousPeriod } from './periodSummaryDates'
import type { PeriodSummary, PeriodSummaryInput } from './periodSummaryTypes'

export type {
  PeriodSummary,
  PeriodSummaryInput,
  PeriodType,
} from './periodSummaryTypes'
export { renderSummaryAsMarkdown } from './periodSummaryMarkdown'

const RULE_VERSION = 1

export function getPeriodSummary(input: PeriodSummaryInput): PeriodSummary {
  const { start_date, end_date } = input
  const days = countInclusiveDays(start_date, end_date)

  const allSnapshots = listSnapshots(90)
  const periodSnapshots = getSnapshotsInPeriod(allSnapshots, start_date, end_date)
  const aggregated = aggregateFromSnapshots(periodSnapshots)

  const streak = getStreakDays()
  const wrongProblems = getWrongProblems(100)
  const unreviewed = getUnreviewedProblems(30, 100)

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

  const evidenceParts: string[] = [`基于 ${periodSnapshots.length} 个每日快照`]
  if (comparison) {
    evidenceParts.push(`与上一周期（${prevStart} 至 ${prevEnd}）对比`)
  }
  evidenceParts.push('数据来源于 ai_context_snapshots 和 statsRepository')

  return {
    generated_at: nowBeijing(),
    rule_version: RULE_VERSION,
    period: {
      type: getPeriodType(days),
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
