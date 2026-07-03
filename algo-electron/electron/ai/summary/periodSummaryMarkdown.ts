import type { PeriodSummary } from './periodSummaryTypes'

export function renderSummaryAsMarkdown(summary: PeriodSummary): string {
  const lines: string[] = []
  lines.push('# 阶段学习总结')
  lines.push('')
  lines.push(`> 周期：${summary.period.start_date} 至 ${summary.period.end_date}（${summary.period.days} 天）`)
  lines.push(`> 生成时间：${summary.generated_at}`)
  lines.push('')
  lines.push('## 学习量')
  lines.push(`- 活跃天数：${summary.study_stats.active_days} / ${summary.period.days} 天`)
  lines.push(`- 刷题数：${summary.study_stats.total_problems_visited}`)
  lines.push(`- AC 数：${summary.study_stats.total_problems_solved}`)
  lines.push(`- 提交数：${summary.study_stats.total_submissions}（AC ${summary.study_stats.total_ac}）`)
  lines.push(`- 日均学习：${summary.study_stats.avg_daily_minutes} 分钟`)
  lines.push(`- 连续学习：当前 ${summary.study_stats.streak.current} 天，最长 ${summary.study_stats.streak.longest} 天`)
  lines.push('')
  if (summary.platform_distribution.length > 0) {
    lines.push('## 平台分布')
    for (const platform of summary.platform_distribution) {
      lines.push(`- ${platform.platform}：${platform.count} 题`)
    }
    lines.push('')
  }
  lines.push('## 错题与复习')
  lines.push(`- 错题数：${summary.wrong_problems_count}`)
  lines.push(`- 待复习：${summary.unreviewed_count} 题`)
  if (summary.weak_tags.length > 0) {
    lines.push(`- 薄弱标签：${summary.weak_tags.join('、')}`)
  }
  lines.push('')
  if (summary.comparison) {
    lines.push(`## 与上一周期对比（${summary.comparison.prev_start_date} 至 ${summary.comparison.prev_end_date}）`)
    lines.push('| 指标 | 本周期 | 上周期 | 变化 |')
    lines.push('| --- | --- | --- | --- |')
    for (const change of summary.comparison.changes) {
      const arrow = change.trend === 'up' ? '↑' : change.trend === 'down' ? '↓' : '→'
      lines.push(`| ${change.metric} | ${change.current} | ${change.previous} | ${arrow} ${change.delta > 0 ? '+' : ''}${change.delta} |`)
    }
    lines.push('')
  }
  lines.push(`> ${summary.evidence}`)
  return lines.join('\n')
}
