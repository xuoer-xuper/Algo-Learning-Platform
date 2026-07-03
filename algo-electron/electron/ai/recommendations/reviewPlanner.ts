// P6-008: 复习计划生成 —— 本地规则引擎
// 基于复习建议（P6-005）+ 薄弱标签分析（P6-006）+ 阶段总结（P6-007）
// 生成短期复习计划，关联具体题目和标签，用户可接受/忽略/调整
// 不调用大模型，结果含可追溯依据
import { getDb } from '../../db/connection'
import { nowBeijing } from '../../shared/time'
import { getReviewRecommendations } from './reviewRecommender'
import { getWeaknessAnalysis } from './weaknessAnalyzer'
import { determineReviewPriority, estimateReviewMinutes, normalizePlanDays, REVIEW_PLAN_RULE_VERSION } from './rules'
import { parseTagsJson } from './tagParsing'
import type { ReviewPlan, ReviewPlanItem } from './types'
export type { ReviewPlan, ReviewPlanItem } from './types'
export { renderPlanAsMarkdown } from './reviewPlanMarkdown'

export function getReviewPlan(planDays = 7): ReviewPlan {
  planDays = normalizePlanDays(planDays)
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

    const problemTags = parseTagsJson(problemRow?.tags_json)

    // 关联薄弱标签
    const relatedWeaknessTags = weaknessResult.weaknesses.filter(w => problemTags.includes(w.tag))

    const priority = determineReviewPriority(rec.score, weaknessResult.weaknesses, problemTags)
    const estimated = estimateReviewMinutes(rec.source.wrong_count, rec.source.days_since_attempt)

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
    rule_version: REVIEW_PLAN_RULE_VERSION,
    plan_days: planDays,
    title: `${planDays} 天复习计划`,
    items: limitedItems,
    weak_tags_summary: weakTagsSummary,
    evidence: evidenceParts.join('，'),
  }
}
