import { z } from 'zod'

/*
 * AI 建议与输出域的跨进程类型（阶段 2 R2 从 electron-env.d.ts 收口）。
 * 收口前的权威定义：electron/ai/recommendations/types.ts（规则引擎的建议与
 * 薄弱分析）。AIOutput* 是 ai_outputs 表的行投影。
 * 红线（domain-rules §5）：AI 代码只写 ai_outputs，建议必须可溯源到
 * problem/submission/visit/stat——Recommendation.source 就是溯源字段。
 */

export const reviewRecommendationSchema = z.object({
  problem_id: z.string(),
  platform: z.string(),
  platform_problem_id: z.string(),
  title: z.string().nullable(),
  canonical_url: z.string(),
  reason: z.string(),
  score: z.number(),
  source: z.object({
    wrong_count: z.number(),
    last_attempt: z.number().int(),
    days_since_attempt: z.number(),
    visit_count: z.number(),
    has_ac: z.boolean(),
  }),
})

/** 复习推荐项（ai:getReviewRecommendations）。 */
export type ReviewRecommendation = z.infer<typeof reviewRecommendationSchema>

export const reviewRecommendationResultSchema = z.object({
  generated_at: z.number().int(),
  rule_version: z.number(),
  recommendations: z.array(reviewRecommendationSchema),
})

/** 复习推荐结果。 */
export type ReviewRecommendationResult = z.infer<typeof reviewRecommendationResultSchema>

export const tagWeaknessSchema = z.object({
  tag: z.string(),
  total: z.number(),
  solved: z.number(),
  attempted: z.number(),
  ac_rate: z.number(),
  wrong_submissions: z.number(),
  total_duration_seconds: z.number(),
  weakness_score: z.number(),
  evidence: z.string(),
})

/** 标签薄弱项（ai:getWeaknessAnalysis）。 */
export type TagWeakness = z.infer<typeof tagWeaknessSchema>

export const weaknessAnalysisResultSchema = z.object({
  generated_at: z.number().int(),
  rule_version: z.number(),
  weaknesses: z.array(tagWeaknessSchema),
  data_note: z.string(),
})

/** 薄弱分析结果。 */
export type WeaknessAnalysisResult = z.infer<typeof weaknessAnalysisResultSchema>

export const aiOutputSaveInputSchema = z.object({
  output_type: z.string(),
  title: z.string(),
  content: z.string(),
  content_markdown: z.string().optional(),
  input_summary: z.record(z.string(), z.unknown()).optional(),
  source_refs: z.record(z.string(), z.unknown()).optional(),
  model_info: z.record(z.string(), z.unknown()).optional(),
})

/** ai:saveOutput 的载荷。 */
export type AIOutputSaveInput = z.infer<typeof aiOutputSaveInputSchema>

export const aiOutputRecordSchema = aiOutputSaveInputSchema.extend({
  id: z.string(),
  created_at: z.number().int().optional(),
  updated_at: z.number().int().optional(),
})

/** ai_outputs 表行的 IPC 投影（ai:getOutput / listOutputs）。 */
export type AIOutputRecord = z.infer<typeof aiOutputRecordSchema>
