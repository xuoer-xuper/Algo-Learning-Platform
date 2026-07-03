import type { AIContextExport } from './contextTypes'

export function renderContextAsMarkdown(ctx: AIContextExport): string {
  const lines: string[] = []
  lines.push('# 学习数据上下文')
  lines.push('')
  lines.push(`> 导出时间：${ctx.exported_at} ｜ schema v${ctx.schema_version}`)
  lines.push('')
  lines.push('## 概览')
  lines.push(`- 题目总数：${ctx.overview.total_problems}（已通过 ${ctx.overview.solved_problems}，尝试中 ${ctx.overview.attempted_problems}，仅访问 ${ctx.overview.visited_problems}）`)
  lines.push(`- 提交总数：${ctx.overview.total_submissions}（AC ${ctx.overview.ac_submissions}）`)
  lines.push(`- 连续学习：当前 ${ctx.overview.streak.current} 天，最长 ${ctx.overview.streak.longest} 天`)
  lines.push(`- 平台分布：${ctx.overview.platforms.map(platform => `${platform.platform} ${platform.count}`).join('、') || '无'}`)
  lines.push('')
  appendTagStats(lines, ctx)
  appendWrongProblems(lines, ctx)
  appendUnreviewedProblems(lines, ctx)
  return lines.join('\n')
}

function appendTagStats(lines: string[], ctx: AIContextExport): void {
  if (ctx.tag_stats.length === 0) return
  lines.push('## 标签维度（按题量排序）')
  lines.push('| 标签 | 题量 | 已通过 | AC率 |')
  lines.push('| --- | --- | --- | --- |')
  for (const tag of ctx.tag_stats.slice(0, 20)) {
    lines.push(`| ${tag.tag} | ${tag.total} | ${tag.solved} | ${tag.ac_rate}% |`)
  }
  lines.push('')
}

function appendWrongProblems(lines: string[], ctx: AIContextExport): void {
  if (ctx.wrong_problems.length === 0) return
  lines.push(`## 错题（${ctx.wrong_problems.length}）`)
  for (const problem of ctx.wrong_problems.slice(0, 15)) {
    lines.push(`- [${problem.platform} ${problem.platform_problem_id}] ${problem.title || '无标题'} — 错误 ${problem.wrong_count} 次，最近 ${problem.last_attempt.replace('T', ' ').slice(0, 16)}`)
  }
  lines.push('')
}

function appendUnreviewedProblems(lines: string[], ctx: AIContextExport): void {
  if (ctx.unreviewed_problems.length === 0) return
  lines.push(`## 待复习（${ctx.unreviewed_problems.length}）`)
  for (const problem of ctx.unreviewed_problems.slice(0, 15)) {
    lines.push(`- [${problem.platform} ${problem.platform_problem_id}] ${problem.title || '无标题'} — ${problem.days_since} 天未访问`)
  }
}
