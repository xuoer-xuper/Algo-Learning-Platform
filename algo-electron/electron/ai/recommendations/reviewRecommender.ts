// P6-005: 错题复习建议 —— 本地规则引擎
// 依据本地统计数据排序推荐复习题目，不调用大模型，不修改题目状态
// 推荐结果可追溯到具体题目和提交（source 字段）
import { getDb } from '../../db/connection'
import { nowBeijing } from '../../shared/time'
import { buildReviewReason, daysSince, REVIEW_RECOMMENDATION_RULE_VERSION, scoreReviewCandidate } from './rules'
import type { ReviewRecommendation, ReviewRecommendationResult } from './types'
export type { ReviewRecommendation, ReviewRecommendationResult } from './types'

// 单题评分规则（纯本地统计，可解释）：
// 1. 错误次数越多，越需复习（权重 40）
// 2. 距上次尝试越久，遗忘风险越高（权重 0.5/天，上限 25）
// 3. 访问次数越多说明重视，但仍未 AC（权重 15）
// 4. 从未 AC 的题目优先（已 AC 的题目降权到 0）
export function getReviewRecommendations(limit = 10): ReviewRecommendationResult {
  const db = getDb()
  const now = Date.now()

  // SQL 先过滤从未 AC 的题目，避免 LIMIT 配额被已解决题目占用。
  const rows = db.prepare(`
    SELECT
      p.id, p.platform, p.platform_problem_id, p.title, p.canonical_url,
      COUNT(s.id) as wrong_count,
      MAX(s.submitted_at) as last_attempt,
      (SELECT COUNT(*) FROM problem_visits pv WHERE pv.problem_id = p.id) as visit_count
    FROM problems p
    JOIN submissions s ON s.problem_id = p.id
    WHERE p.deleted_at IS NULL
      AND s.verdict != 'AC'
      AND NOT EXISTS (
        SELECT 1 FROM submissions s2
        WHERE s2.problem_id = p.id AND s2.verdict = 'AC'
      )
    GROUP BY p.id
    ORDER BY wrong_count DESC, last_attempt DESC
    LIMIT 100
  `).all() as {
    id: string
    platform: string
    platform_problem_id: string
    title: string | null
    canonical_url: string
    wrong_count: number
    last_attempt: string
    visit_count: number
  }[]

  const recommendations: ReviewRecommendation[] = rows
    .map(r => {
      const daysSinceAttempt = daysSince(r.last_attempt, now)
      const score = scoreReviewCandidate(r.wrong_count, daysSinceAttempt, r.visit_count)
      const reason = buildReviewReason(r.wrong_count, daysSinceAttempt, r.visit_count)

      return {
        problem_id: r.id,
        platform: r.platform,
        platform_problem_id: r.platform_problem_id,
        title: r.title,
        canonical_url: r.canonical_url,
        reason,
        score,
        source: {
          wrong_count: r.wrong_count,
          last_attempt: r.last_attempt,
          days_since_attempt: daysSinceAttempt,
          visit_count: r.visit_count,
          has_ac: false,
        },
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return {
    generated_at: nowBeijing(),
    rule_version: REVIEW_RECOMMENDATION_RULE_VERSION,
    recommendations,
  }
}
