import type { ReviewPriority, TagAggregate, TagWeakness } from './types'

export const REVIEW_RECOMMENDATION_RULE_VERSION = 1
export const WEAKNESS_ANALYSIS_RULE_VERSION = 2
export const REVIEW_PLAN_RULE_VERSION = 1
export const WEAKNESS_AC_RATE_THRESHOLD = 70

export function daysSince(timestamp: string, now = Date.now()): number {
  const time = timestamp ? new Date(timestamp).getTime() : 0
  return Math.max(0, Math.floor((now - time) / 86400000))
}

export function scoreReviewCandidate(wrongCount: number, daysSinceAttempt: number, visitCount: number): number {
  const wrongScore = Math.min(wrongCount, 5) * 8
  const forgetScore = Math.min(daysSinceAttempt * 0.5, 25)
  const visitScore = Math.min(visitCount, 3) * 5
  return wrongScore + forgetScore + visitScore
}

export function buildReviewReason(wrongCount: number, daysSinceAttempt: number, visitCount: number): string {
  const reasonParts: string[] = []
  if (wrongCount >= 3) reasonParts.push(`已错误 ${wrongCount} 次`)
  else if (wrongCount >= 1) reasonParts.push(`错误 ${wrongCount} 次`)
  if (daysSinceAttempt >= 7) reasonParts.push(`${daysSinceAttempt} 天未复习`)
  else if (daysSinceAttempt >= 1) reasonParts.push(`${daysSinceAttempt} 天前尝试`)
  if (visitCount >= 2) reasonParts.push(`访问 ${visitCount} 次仍未通过`)

  return reasonParts.length > 0 ? `${reasonParts.join('，')}，建议复习` : '建议复习'
}

export function scoreTagWeakness(acRate: number, wrongSubmissions: number, totalDurationSeconds: number): number {
  const acScore = (100 - acRate) * 0.5
  const wrongScore = Math.min(wrongSubmissions * 0.5, 25)
  const durationScore = Math.min(totalDurationSeconds * 0.01, 25)
  return Math.round(acScore + wrongScore + durationScore)
}

export function buildWeaknessEvidence(stats: TagAggregate, acRate: number): string {
  const evidenceParts: string[] = []
  evidenceParts.push(`${stats.total} 题`)
  evidenceParts.push(`AC ${stats.solved} 题（${acRate}%）`)
  if (stats.wrong_submissions > 0) evidenceParts.push(`错误提交 ${stats.wrong_submissions} 次`)
  if (stats.total_duration_seconds > 60) {
    evidenceParts.push(`累计停留 ${Math.round(stats.total_duration_seconds / 60)} 分钟`)
  }
  return evidenceParts.join('，')
}

export function estimateReviewMinutes(wrongCount: number, daysSinceAttempt: number): number {
  const base = 15
  const wrongBonus = Math.min(wrongCount * 10, 40)
  const forgetBonus = Math.min(daysSinceAttempt * 2, 30)
  return base + wrongBonus + forgetBonus
}

export function determineReviewPriority(
  score: number,
  weaknessTags: TagWeakness[],
  problemTags: string[],
): ReviewPriority {
  const relatedWeakness = weaknessTags.filter(weakness => problemTags.includes(weakness.tag))
  const hasHighWeakness = relatedWeakness.some(weakness => weakness.weakness_score >= 60)

  if (hasHighWeakness || score >= 60) return 1
  if (score >= 35 || relatedWeakness.length > 0) return 2
  return 3
}

/**
 * 计划天数归一。
 *
 * 原先只判 `Number.isFinite(x) && x >= 1`，于是 `1.5` 原样通过，一路走到
 * `maxItems = planDays * 3`（`slice(0, 4.5)`）、标题 `"1.5 天复习计划"`、以及写进
 * `plan_days` 列的小数——SQLite 的 INTEGER 亲和性存不下小数时会退化成 REAL，
 * 那一列于是混进非整数。不报错，只是结果没有意义。
 *
 * `ai:getReviewPlan` 两个渠道已经用 `int({ min: 1, max: 3650 })` 拦在门口，
 * 这里再收一次是给非渠道调用点兜底（默认参数、将来的内部调用）——渠道校验管的是
 * 进程边界，函数自己的前置条件不该指望调用方替它守。
 *
 * 上限对齐渠道的 3650：`maxItems` 是天数乘 3，无界的话就是无界的 `slice`。
 */
const MAX_PLAN_DAYS = 3650

export function normalizePlanDays(planDays: number): number {
  if (!Number.isInteger(planDays) || planDays < 1) return 7
  return Math.min(planDays, MAX_PLAN_DAYS)
}
