import { z } from 'zod'

/*
 * AI 域各 channel 的输入 schema。消费方：electron/ipc/registerAiIpc.ts。
 *
 * 四个复用的界，理由写在这里而不是每个 channel 重复一遍：
 *
 * - `limit` 上限 1000，与 stats 域的 `rowLimit` 同档。当前最大调用点是 8
 *   （`analyticsApi` 的弱项分析），1000 留足余量又不至于让 `LIMIT` 退化成全表扫描。
 *   用 optional：这几处 handler 都写了 `?? 10` / `?? 20` 的默认值，"没传"是合法输入。
 * - `planDays` 上限 3650（十年），与 stats 域的 `days` 同档。
 *   加整数约束是补回一处缺口：`normalizePlanDays` 只判 `Number.isFinite(x) && x >= 1`，
 *   于是 `1.5` 会一路走到 `maxItems = planDays * 3`（`slice(0, 4.5)`）和标题
 *   `"1.5 天复习计划"`——不报错，只是结果没有意义。
 * - `output_type` 只放行 `AIOutputType` 的四个成员。同样是补缺口：`preload.ts` 把它声明成
 *   `string`，handler 声明的却是 `AIOutputType`，而 `ai_outputs.output_type` 列是裸 TEXT、无 CHECK。
 *   写入侧因此能存进任何字符串，读取侧 `WHERE output_type = ?` 再也匹配不到它——
 *   得到的是一张空列表而不是一个错误。
 * - 正文上限 4 MiB：沿用 scripts 域的 `MAX_VIEWABLE_SCRIPT_BYTES`。
 *   `checkIpcPayload` 对单个字符串的上限是 8 MiB，这里按 channel 再收紧一档。
 *   AI 产出的报告正文可以很长，但不该无界。
 */
const rowLimit = z.number().int().min(1).max(1000).optional()
const planDays = z.number().int().min(1).max(3650).optional()
const aiOutputType = z.enum([
  'review_recommendation',
  'review_plan',
  'period_summary',
  'weakness_analysis',
])
const aiOutputBody = z.string().max(4 * 1024 * 1024)

/** `yyyy-mm-dd` 本地日期。项目里所有日期口径都是北京本地日，不是 UTC ISO 串。 */
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** 标识符类字符串：非空、上限 200（ai_outputs.id，标识符 200 的既有口径）。 */
const identifier = z.string().min(1).max(200)

export const getReviewRecommendationsInput = [rowLimit] as const
export const getWeaknessAnalysisInput = [rowLimit] as const
/* R3 起 getPeriodSummary(+Markdown) / listOutputs / updateOutput 的 wire 形状是单对象参数。 */
export const getPeriodSummaryInput = [
  z.strictObject({ startDate: localDate, endDate: localDate }),
] as const
export const getPeriodSummaryMarkdownInput = [
  z.strictObject({ startDate: localDate, endDate: localDate }),
] as const
export const getReviewPlanInput = [planDays] as const
export const getReviewPlanMarkdownInput = [planDays] as const

/*
 * `input_summary` / `source_refs` / `model_info` 三个字段的类型是 `AIOutputMetadata`
 * （= `Record<string, unknown>`，任意键任意值），schema 层没有能表达"任意键字典"的
 * 组合子。它们只被 `stringifyMetadata` 原样 JSON.stringify 进库，从不被解释。
 *
 * 所以这个 channel 的 schema 只覆盖四个有形状的字段，多余字段拒绝。
 * 这与现状不构成行为差异：`src/` 里没有任何调用点（`saveAIOutput` 全仓零调用），
 * 也就是说这三个字段今天没有任何生产者。等真要用时，一并补字典形状。
 */
const saveOutput = z.strictObject({
  output_type: aiOutputType,
  title: z.string().min(1).max(200),
  content: aiOutputBody,
  content_markdown: aiOutputBody.optional(),
})

export const saveOutputInput = [saveOutput] as const
export const getOutputInput = [identifier] as const
export const listOutputsInput = [
  z.strictObject({ outputType: aiOutputType.optional(), limit: rowLimit }),
] as const
export const deleteOutputInput = [identifier] as const

/*
 * 三个字段都用 optional：`AIOutputUpdateInput` 是 `Partial<...>`，`updateAIOutput`
 * 逐个判 `!== undefined` 决定是否进 SET 子句，"没传"就是"不改这一列"。`title` 与
 * `content_markdown` 再套 nullable：这两列在库里可空，显式传 `null` 是"清空这一列"，
 * 与"不改"是两件事；`content` 列 NOT NULL，所以不套。
 */
const updateOutput = z.strictObject({
  title: z.string().min(1).max(200).nullable().optional(),
  content: aiOutputBody.optional(),
  content_markdown: aiOutputBody.nullable().optional(),
})

export const updateOutputInput = [
  z.strictObject({ id: identifier, updates: updateOutput }),
] as const
