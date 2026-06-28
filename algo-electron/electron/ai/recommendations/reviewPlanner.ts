// P6-008: 复习计划生成 —— 本地规则引擎
// 基于复习建议（P6-005）+ 薄弱标签分析（P6-006）+ 阶段总结（P6-007）
// 生成短期复习计划，关联具体题目和标签，用户可接受/忽略/调整
// 不调用大模型，结果含可追溯依据
import { getDb } from '../../db/connection'
import { nowBeijing } from '../../shared/time'
import { getReviewRecommendations } from './reviewRecommender'
import { getWeaknessAnalysis, TagWeakness } from './weaknessAnalyzer'

export interface ReviewPlanItem {
  // 关联题目
  problem_id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  // 关联标签
  related_tags: string[]
  // 优先级 1（高）~ 3（低）
  priority: 1 | 2 | 3
  // 预估复习时间（分钟）
  estimated_minutes: number
  // 推荐理由
  reason: string
  // 可追溯依据
  source: {
    wrong_count: number
    days_since_attempt: number
    weakness_tags: string[]
    weakness_scores: number[]
  }
}

export interface ReviewPlan {
  generated_at: string
  rule_version: number
  // 计划周期（天）
  plan_days: number
  // 计划标题
  title: string
  // 复习项列表
  items: ReviewPlanItem[]
  // 薄弱标签汇总
  weak_tags_summary: { tag: string; ac_rate: number; total: number }[]
  // 可追溯依据
  evidence: string
}

const RULE_VERSION = 1

// 根据错误次数和遗忘时间估算复习时间
function estimateMinutes(wrongCount: number, daysSinceAttempt: number): number {
  // 基础 15 分钟 + 错误次数 * 10 分钟 + 遗忘天数 * 2 分钟
  const base = 15
  const wrongBonus = Math.min(wrongCount * 10, 40)
  const forgetBonus = Math.min(daysSinceAttempt * 2, 30)
  return base + wrongBonus + forgetBonus
}

// 根据评分和薄弱标签关联度确定优先级
function determinePriority(
  score: number,
  weaknessTags: TagWeakness[],
  problemTags: string[]
): 1 | 2 | 3 {
  // 检查题目是否关联薄弱标签
  const relatedWeakness = weaknessTags.filter(w => problemTags.includes(w.tag))
  const hasHighWeakness = relatedWeakness.some(w => w.weakness_score >= 60)

  if (hasHighWeakness || score >= 60) return 1
  if (score >= 35 || relatedWeakness.length > 0) return 2
  return 3
}

export function getReviewPlan(planDays = 7): ReviewPlan {
  // 校验计划周期，防止负数导致 slice 行为异常
  if (!Number.isFinite(planDays) || planDays < 1) planDays = 7
  // 获取复习建议（取较多候选，再筛选）
  const reviewResult = getReviewRecommendations(30)
  const weaknessResult = getWeaknessAnalysis(20)

  const db = getDb()

  // 为每条推荐补充标签信息
  const items: ReviewPlanItem[] = reviewResult.recommendations.map(rec => {
    // 查询题目标签
    const problemRow = db.prepare(
      `SELECT tags_json FROM problems WHERE id = ? AND deleted_at IS NULL`
    ).get(rec.problem_id) as { tags_json: string | null } | undefined

    let problemTags: string[] = []
    if (problemRow?.tags_json) {
      try {
        const parsed = JSON.parse(problemRow.tags_json)
        if (Array.isArray(parsed)) problemTags = parsed.filter((t: any) => typeof t === 'string')
      } catch { /* ignore */ }
    }

    // 关联薄弱标签
    const relatedWeaknessTags = weaknessResult.weaknesses.filter(w => problemTags.includes(w.tag))

    const priority = determinePriority(rec.score, weaknessResult.weaknesses, problemTags)
    const estimated = estimateMinutes(rec.source.wrong_count, rec.source.days_since_attempt)

    const reasonParts: string[] = [rec.reason]
    if (relatedWeaknessTags.length > 0) {
      reasonParts.push(`关联薄弱标签：${relatedWeaknessTags.map(w => w.tag).join('、')}`)
    }

    return {
      problem_id: rec.problem_id,
      platform: rec.platform,
      platform_problem_id: rec.platform_problem_id,
      title: rec.title,
      canonical_url: rec.canonical_url,
      related_tags: problemTags,
      priority,
      estimated_minutes: estimated,
      reason: reasonParts.join('；'),
      source: {
        wrong_count: rec.source.wrong_count,
        days_since_attempt: rec.source.days_since_attempt,
        weakness_tags: relatedWeaknessTags.map(w => w.tag),
        weakness_scores: relatedWeaknessTags.map(w => w.weakness_score),
      },
    }
  })

  // 按优先级排序，同一优先级按预估时间降序
  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return b.estimated_minutes - a.estimated_minutes
  })

  // 根据计划周期限制项目数量（每天最多 3 道复习题）
  const maxItems = planDays * 3
  const limitedItems = items.slice(0, maxItems)

  // 薄弱标签汇总
  const weakTagsSummary = weaknessResult.weaknesses.slice(0, 10).map(w => ({
    tag: w.tag,
    ac_rate: w.ac_rate,
    total: w.total,
  }))

  // 可追溯依据
  const evidenceParts: string[] = []
  evidenceParts.push(`基于复习建议（${reviewResult.recommendations.length} 条候选）`)
  evidenceParts.push(`薄弱标签分析（${weaknessResult.weaknesses.length} 个薄弱标签）`)
  evidenceParts.push(`计划周期 ${planDays} 天，每日上限 3 题`)
  evidenceParts.push(`数据来源于 reviewRecommender + weaknessAnalyzer`)

  return {
    generated_at: nowBeijing(),
    rule_version: RULE_VERSION,
    plan_days: planDays,
    title: `${planDays} 天复习计划`,
    items: limitedItems,
    weak_tags_summary: weakTagsSummary,
    evidence: evidenceParts.join('，'),
  }
}

// 渲染为 Markdown
export function renderPlanAsMarkdown(plan: ReviewPlan): string {
  const lines: string[] = []
  lines.push(`# ${plan.title}`)
  lines.push('')
  lines.push(`> 生成时间：${plan.generated_at} ｜ 周期 ${plan.plan_days} 天`)
  lines.push('')
  const p1 = plan.items.filter(i => i.priority === 1)
  const p2 = plan.items.filter(i => i.priority === 2)
  const p3 = plan.items.filter(i => i.priority === 3)
  if (p1.length > 0) {
    lines.push(`## 优先复习（高）`)
    for (const item of p1) {
      lines.push(`- [${item.platform} ${item.platform_problem_id}] ${item.title || '无标题'} — ${item.estimated_minutes} 分钟`)
      lines.push(`  - ${item.reason}`)
    }
    lines.push('')
  }
  if (p2.length > 0) {
    lines.push(`## 建议复习（中）`)
    for (const item of p2) {
      lines.push(`- [${item.platform} ${item.platform_problem_id}] ${item.title || '无标题'} — ${item.estimated_minutes} 分钟`)
      lines.push(`  - ${item.reason}`)
    }
    lines.push('')
  }
  if (p3.length > 0) {
    lines.push(`## 选做（低）`)
    for (const item of p3) {
      lines.push(`- [${item.platform} ${item.platform_problem_id}] ${item.title || '无标题'} — ${item.estimated_minutes} 分钟`)
    }
    lines.push('')
  }
  if (plan.weak_tags_summary.length > 0) {
    lines.push(`## 薄弱标签`)
    for (const t of plan.weak_tags_summary) {
      lines.push(`- ${t.tag}：${t.total} 题，AC 率 ${t.ac_rate}%`)
    }
    lines.push('')
  }
  lines.push(`> ${plan.evidence}`)
  return lines.join('\n')
}
