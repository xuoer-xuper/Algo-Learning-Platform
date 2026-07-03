import type { ReviewPlan } from './types'

export function renderPlanAsMarkdown(plan: ReviewPlan): string {
  const lines: string[] = []
  lines.push(`# ${plan.title}`)
  lines.push('')
  lines.push(`> 生成时间：${plan.generated_at} ｜ 周期 ${plan.plan_days} 天`)
  lines.push('')
  appendPrioritySection(lines, '优先复习（高）', plan, 1, true)
  appendPrioritySection(lines, '建议复习（中）', plan, 2, true)
  appendPrioritySection(lines, '选做（低）', plan, 3, false)

  if (plan.weak_tags_summary.length > 0) {
    lines.push('## 薄弱标签')
    for (const tag of plan.weak_tags_summary) {
      lines.push(`- ${tag.tag}：${tag.total} 题，AC 率 ${tag.ac_rate}%`)
    }
    lines.push('')
  }
  lines.push(`> ${plan.evidence}`)
  return lines.join('\n')
}

function appendPrioritySection(
  lines: string[],
  title: string,
  plan: ReviewPlan,
  priority: 1 | 2 | 3,
  includeReason: boolean,
): void {
  const items = plan.items.filter(item => item.priority === priority)
  if (items.length === 0) return

  lines.push(`## ${title}`)
  for (const item of items) {
    lines.push(`- [${item.platform} ${item.platform_problem_id}] ${item.title || '无标题'} — ${item.estimated_minutes} 分钟`)
    if (includeReason) {
      lines.push(`  - ${item.reason}`)
    }
  }
  lines.push('')
}
