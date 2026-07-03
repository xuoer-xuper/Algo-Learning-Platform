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

export function normalizePlanDays(planDays: number): number {
  return Number.isFinite(planDays) && planDays >= 1 ? planDays : 7
}
