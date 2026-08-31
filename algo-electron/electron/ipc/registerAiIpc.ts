import { ipcMain } from './trustedSender'
import { freeText, int, localDate, nullable, object, oneOf, optional, text } from './payloadSchema'
import { exportAIContext, renderContextAsMarkdown } from '../ai/contextExporter'
import { getReviewPlan, renderPlanAsMarkdown } from '../ai/recommendations/reviewPlanner'
import { getReviewRecommendations } from '../ai/recommendations/reviewRecommender'
import { getWeaknessAnalysis } from '../ai/recommendations/weaknessAnalyzer'
import { getPeriodSummary, renderSummaryAsMarkdown } from '../ai/summary/periodSummary'
import {
  deleteAIOutput,
  getAIOutput,
  listAIOutputs,
  saveAIOutput,
  updateAIOutput,
  type SaveAIOutputInput,
} from '../db/repositories/aiOutputRepository'

/*
 * 四个复用的界，理由写在这里而不是每个 channel 重复一遍：
 *
 * - `limit` 上限 1000，与 `registerStatsIpc` 的 `rowLimit()` 同档。当前最大调用点是 8
 *   （`analyticsApi` 的弱项分析），1000 留足余量又不至于让 `LIMIT` 退化成全表扫描。
 *   用 `optional`：这几处 handler 都写了 `?? 10` / `?? 20` 的默认值，"没传"是合法输入。
 * - `planDays` 上限 3650（十年），与 `registerStatsIpc` 的 `daysRange()` 同档。
 *   加 `int` 是补回一处缺口：`normalizePlanDays` 只判 `Number.isFinite(x) && x >= 1`，
 *   于是 `1.5` 会一路走到 `maxItems = planDays * 3`（`slice(0, 4.5)`）和标题
 *   `"1.5 天复习计划"`——不报错，只是结果没有意义。
 * - `output_type` 只放行 `AIOutputType` 的四个成员。同样是补缺口：`preload.ts` 把它声明成
 *   `string`（`AIOutputSaveInput.output_type` 与 `listAIOutputs` 的 `outputType?` 都是），
 *   handler 声明的却是 `AIOutputType`，而 `ai_outputs.output_type` 列是裸 TEXT、无 CHECK。
 *   写入侧因此能存进任何字符串，读取侧 `WHERE output_type = ?` 再也匹配不到它——
 *   得到的是一张空列表而不是一个错误。
 * - 正文上限 4 MiB：沿用 `registerScriptsIpc` 的 `MAX_VIEWABLE_SCRIPT_BYTES`。
 *   `checkIpcPayload` 对单个字符串的上限是 8 MiB，这里按 channel 再收紧一档。
 *   AI 产出的报告正文可以很长，但不该无界。
 */
const rowLimit = () => optional(int({ min: 1, max: 1000 }))
const planDays = () => optional(int({ min: 1, max: 3650 }))
const aiOutputType = () => oneOf(['review_recommendation', 'review_plan', 'period_summary', 'weakness_analysis'])
const aiOutputBody = () => freeText({ max: 4 * 1024 * 1024 })

export function registerAiIpc(): void {
  ipcMain.handle('ai:exportContext', () => {
    return exportAIContext()
  })

  ipcMain.handle('ai:exportContextMarkdown', () => {
    return renderContextAsMarkdown(exportAIContext())
  })

  ipcMain.handle('ai:getReviewRecommendations', [rowLimit()], (_event, limit) => {
    return getReviewRecommendations(limit ?? 10)
  })

  ipcMain.handle('ai:getWeaknessAnalysis', [rowLimit()], (_event, limit) => {
    return getWeaknessAnalysis(limit ?? 10)
  })

  ipcMain.handle('ai:getPeriodSummary', [localDate, localDate], (_event, startDate, endDate) => {
    return getPeriodSummary({ start_date: startDate, end_date: endDate })
  })

  ipcMain.handle('ai:getPeriodSummaryMarkdown', [localDate, localDate], (_event, startDate, endDate) => {
    const summary = getPeriodSummary({ start_date: startDate, end_date: endDate })
    return renderSummaryAsMarkdown(summary)
  })

  ipcMain.handle('ai:getReviewPlan', [planDays()], (_event, days) => {
    return getReviewPlan(days ?? 7)
  })

  ipcMain.handle('ai:getReviewPlanMarkdown', [planDays()], (_event, days) => {
    const plan = getReviewPlan(days ?? 7)
    return renderPlanAsMarkdown(plan)
  })

  /*
   * `input_summary` / `source_refs` / `model_info` 三个字段的类型是 `AIOutputMetadata`
   * （= `Record<string, unknown>`，任意键任意值），现有组合子里没有能表达"任意键字典"的
   * 那一个，也不该为此加 `raw()`——`raw()` 的语义是"在别处校验了"，而这三个字段没有别处。
   * 它们只被 `stringifyMetadata` 原样 JSON.stringify 进库，从不被解释。
   *
   * 所以这个 channel 的 schema 只覆盖四个有形状的字段，多余字段按默认策略拒绝。
   * 这与现状不构成行为差异：`src/` 里没有任何调用点（`saveAIOutput` 全仓零调用），
   * 也就是说这三个字段今天没有任何生产者。等真要用时，一并补一个字典组合子。
   */
  ipcMain.handle(
    'ai:saveOutput',
    [object({
      output_type: aiOutputType(),
      title: text({ max: 200 }),
      content: aiOutputBody(),
      content_markdown: optional(aiOutputBody()),
    })],
    (_event, input) => {
      const payload: SaveAIOutputInput = input
      return saveAIOutput(payload)
    },
  )

  ipcMain.handle('ai:getOutput', [text()], (_event, id) => {
    return getAIOutput(id)
  })

  ipcMain.handle('ai:listOutputs', [optional(aiOutputType()), rowLimit()], (_event, outputType, limit) => {
    return listAIOutputs(outputType, limit ?? 20)
  })

  ipcMain.handle('ai:deleteOutput', [text()], (_event, id) => {
    return deleteAIOutput(id)
  })

  /*
   * 三个字段都用 `optional`：`AIOutputUpdateInput` 是 `Partial<...>`，`updateAIOutput`
   * 逐个判 `!== undefined` 决定是否进 SET 子句，"没传"就是"不改这一列"。`title` 与
   * `content_markdown` 再套 `nullable`：这两列在库里可空，显式传 `null` 是"清空这一列"，
   * 与"不改"是两件事；`content` 列 NOT NULL，所以不套。
   */
  ipcMain.handle('ai:updateOutput', [
    text(),
    object({
      title: optional(nullable(text({ max: 200 }))),
      content: optional(aiOutputBody()),
      content_markdown: optional(nullable(aiOutputBody())),
    }),
  ], (_event, id, updates) => {
    return updateAIOutput(id, updates)
  })
}
