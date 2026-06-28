// P6-005: 错题复习建议 —— 本地规则引擎
// 依据本地统计数据排序推荐复习题目，不调用大模型，不修改题目状态
// 推荐结果可追溯到具体题目和提交（source 字段）
import { getDb } from '../../db/connection'
import { nowBeijing } from '../../shared/time'

export interface ReviewRecommendation {
  problem_id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  // 推荐理由（本地统计依据）
  reason: string
  // 规则评分，用于排序
  score: number
  // 可追溯依据
  source: {
    wrong_count: number
    last_attempt: string
    days_since_attempt: number
    visit_count: number
    has_ac: boolean
  }
}

export interface ReviewRecommendationResult {
  generated_at: string
  rule_version: number
  recommendations: ReviewRecommendation[]
}

const RULE_VERSION = 1

// 单题评分规则（纯本地统计，可解释）：
// 1. 错误次数越多，越需复习（权重 40）
// 2. 距上次尝试越久，遗忘风险越高（权重 0.5/天，上限 25）
// 3. 访问次数越多说明重视，但仍未 AC（权重 15）
// 4. 从未 AC 的题目优先（已 AC 的题目降权到 0）
export function getReviewRecommendations(limit = 10): ReviewRecommendationResult {
  const db = getDb()
  const now = Date.now()

  // 修复：在 SQL WHERE 中直接过滤"从未 AC"的题目，
  // 避免 LIMIT 100 配额被已 AC 题目占用导致推荐数量不足
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
      const lastMs = r.last_attempt ? new Date(r.last_attempt).getTime() : 0
      const daysSince = Math.max(0, Math.floor((now - lastMs) / 86400000))

      const wrongScore = Math.min(r.wrong_count, 5) * 8 // 0~40
      const forgetScore = Math.min(daysSince * 0.5, 25) // 0~25
      const visitScore = Math.min(r.visit_count, 3) * 5 // 0~15
      const score = wrongScore + forgetScore + visitScore

      const reasonParts: string[] = []
      if (r.wrong_count >= 3) reasonParts.push(`已错误 ${r.wrong_count} 次`)
      else if (r.wrong_count >= 1) reasonParts.push(`错误 ${r.wrong_count} 次`)
      if (daysSince >= 7) reasonParts.push(`${daysSince} 天未复习`)
      else if (daysSince >= 1) reasonParts.push(`${daysSince} 天前尝试`)
      if (r.visit_count >= 2) reasonParts.push(`访问 ${r.visit_count} 次仍未通过`)

      const reason = reasonParts.length > 0 ? reasonParts.join('，') + '，建议复习' : '建议复习'

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
          days_since_attempt: daysSince,
          visit_count: r.visit_count,
          has_ac: false,
        },
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return {
    generated_at: nowBeijing(),
    rule_version: RULE_VERSION,
    recommendations,
  }
}
