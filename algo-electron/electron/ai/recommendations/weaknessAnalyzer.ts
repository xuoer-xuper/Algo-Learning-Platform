// P6-006: 薄弱标签分析 —— 本地规则引擎
// 基于 AC 率、错误次数、停留时长等本地统计，识别薄弱标签
// 结果解释使用本地统计依据，不调用大模型
import { getDb } from '../../db/connection'
import { nowBeijing } from '../../shared/time'

export interface TagWeakness {
  tag: string
  total: number
  solved: number
  attempted: number
  ac_rate: number
  // 错误提交次数（来自所有该标签题目的非 AC 提交）
  wrong_submissions: number
  // 累计停留时长（秒）
  total_duration_seconds: number
  // 薄弱评分（越高越薄弱）
  weakness_score: number
  // 本地统计依据
  evidence: string
}

export interface WeaknessAnalysisResult {
  generated_at: string
  rule_version: number
  weaknesses: TagWeakness[]
  // 数据可用性说明（当标签数据缺失时降级）
  data_note: string
}

const RULE_VERSION = 2

// 薄弱阈值：AC 率 >= 此值的标签视为已掌握，不进入薄弱列表
// 修复：原实现未过滤高 AC 率标签，导致 100% AC 的标签也出现在"薄弱标签"区域
const WEAKNESS_AC_RATE_THRESHOLD = 70

// 薄弱评分规则（纯本地统计）：
// 1. AC 率越低越薄弱（权重 50）
// 2. 错误提交次数越多越薄弱（权重 0.5/次，上限 25）
// 3. 停留时长越长但仍未通过，越薄弱（权重 0.01/秒，上限 25）
// 仅统计题目量 >= 2 的标签以保证统计意义
export function getWeaknessAnalysis(limit = 10): WeaknessAnalysisResult {
  const db = getDb()

  // 收集带标签的题目及其状态
  const rows = db.prepare(`
    SELECT
      p.id, p.tags_json,
      CASE
        WHEN EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id AND s.verdict = 'AC') THEN 'solved'
        WHEN EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id) THEN 'attempted'
        ELSE 'visited'
      END as status,
      (SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id AND s.verdict != 'AC') as wrong_subs,
      (SELECT COALESCE(SUM(duration_seconds), 0) FROM problem_visits pv WHERE pv.problem_id = p.id) as duration
    FROM problems p
    WHERE p.deleted_at IS NULL AND p.tags_json IS NOT NULL AND p.tags_json != '[]' AND p.tags_json != ''
  `).all() as { id: string; tags_json: string | null; status: string; wrong_subs: number; duration: number }[]

  if (rows.length === 0) {
    return {
      generated_at: nowBeijing(),
      rule_version: RULE_VERSION,
      weaknesses: [],
      data_note: '暂无标签数据。请在题目详情中补充标签后重试。',
    }
  }

  const tagMap = new Map<string, {
    total: number
    solved: number
    attempted: number
    wrong_submissions: number
    total_duration_seconds: number
  }>()

  for (const row of rows) {
    let tags: string[] = []
    try {
      const parsed = JSON.parse(row.tags_json || '[]')
      if (Array.isArray(parsed)) tags = parsed.filter((t: any) => typeof t === 'string' && t.trim())
    } catch { continue }

    for (const tag of tags) {
      const key = tag.trim()
      if (!key) continue
      if (!tagMap.has(key)) {
        tagMap.set(key, { total: 0, solved: 0, attempted: 0, wrong_submissions: 0, total_duration_seconds: 0 })
      }
      const entry = tagMap.get(key)!
      entry.total++
      if (row.status === 'solved') entry.solved++
      else if (row.status === 'attempted') entry.attempted++
      entry.wrong_submissions += row.wrong_subs
      entry.total_duration_seconds += row.duration
    }
  }

  const weaknesses: TagWeakness[] = Array.from(tagMap.entries())
    .filter(([, v]) => v.total >= 2) // 题量 >= 2 才有统计意义
    .map(([tag, v]) => {
      const acRate = v.total > 0 ? Math.round((v.solved / v.total) * 100) : 0
      const acScore = (100 - acRate) * 0.5 // 0~50
      const wrongScore = Math.min(v.wrong_submissions * 0.5, 25) // 0~25
      const durationScore = Math.min(v.total_duration_seconds * 0.01, 25) // 0~25
      const weaknessScore = Math.round(acScore + wrongScore + durationScore)

      const evidenceParts: string[] = []
      evidenceParts.push(`${v.total} 题`)
      evidenceParts.push(`AC ${v.solved} 题（${acRate}%）`)
      if (v.wrong_submissions > 0) evidenceParts.push(`错误提交 ${v.wrong_submissions} 次`)
      if (v.total_duration_seconds > 60) {
        evidenceParts.push(`累计停留 ${Math.round(v.total_duration_seconds / 60)} 分钟`)
      }

      return {
        tag,
        total: v.total,
        solved: v.solved,
        attempted: v.attempted,
        ac_rate: acRate,
        wrong_submissions: v.wrong_submissions,
        total_duration_seconds: v.total_duration_seconds,
        weakness_score: weaknessScore,
        evidence: evidenceParts.join('，'),
      }
    })
    // 修复：过滤掉 AC 率 >= 阈值的"已掌握"标签，避免出现在薄弱列表中误导用户
    .filter(w => w.ac_rate < WEAKNESS_AC_RATE_THRESHOLD)
    .sort((a, b) => b.weakness_score - a.weakness_score)
    .slice(0, limit)

  const dataNote = weaknesses.length > 0
    ? '基于本地 AC 率、错误次数与停留时长统计生成。'
    : `暂无 AC 率低于 ${WEAKNESS_AC_RATE_THRESHOLD}% 的薄弱标签（已掌握的标签不在此列表）。`

  return {
    generated_at: nowBeijing(),
    rule_version: RULE_VERSION,
    weaknesses,
    data_note: dataNote,
  }
}
