import { ipcMain } from './trustedSender'
import {
  deleteOutputInput,
  getOutputInput,
  getPeriodSummaryInput,
  getPeriodSummaryMarkdownInput,
  getReviewPlanInput,
  getReviewPlanMarkdownInput,
  getReviewRecommendationsInput,
  getWeaknessAnalysisInput,
  listOutputsInput,
  saveOutputInput,
  updateOutputInput,
} from '../../src/shared/types/ipc/ai'
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
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/ai.ts`；
 * limit 1000 / planDays 3650 / output_type 枚举 / 正文 4 MiB 四个界的理由写在那里。
 */
export function registerAiIpc(): void {
  ipcMain.handle('ai:exportContext', () => {
    return exportAIContext()
  })

  ipcMain.handle('ai:exportContextMarkdown', () => {
    return renderContextAsMarkdown(exportAIContext())
  })

  ipcMain.handle('ai:getReviewRecommendations', getReviewRecommendationsInput, (_event, limit) => {
    return getReviewRecommendations(limit ?? 10)
  })

  ipcMain.handle('ai:getWeaknessAnalysis', getWeaknessAnalysisInput, (_event, limit) => {
    return getWeaknessAnalysis(limit ?? 10)
  })

  ipcMain.handle('ai:getPeriodSummary', getPeriodSummaryInput, (_event, startDate, endDate) => {
    return getPeriodSummary({ start_date: startDate, end_date: endDate })
  })

  ipcMain.handle(
    'ai:getPeriodSummaryMarkdown',
    getPeriodSummaryMarkdownInput,
    (_event, startDate, endDate) => {
      const summary = getPeriodSummary({ start_date: startDate, end_date: endDate })
      return renderSummaryAsMarkdown(summary)
    },
  )

  ipcMain.handle('ai:getReviewPlan', getReviewPlanInput, (_event, days) => {
    return getReviewPlan(days ?? 7)
  })

  ipcMain.handle('ai:getReviewPlanMarkdown', getReviewPlanMarkdownInput, (_event, days) => {
    const plan = getReviewPlan(days ?? 7)
    return renderPlanAsMarkdown(plan)
  })

  ipcMain.handle('ai:saveOutput', saveOutputInput, (_event, input) => {
    const payload: SaveAIOutputInput = input
    return saveAIOutput(payload)
  })

  ipcMain.handle('ai:getOutput', getOutputInput, (_event, id) => {
    return getAIOutput(id)
  })

  ipcMain.handle('ai:listOutputs', listOutputsInput, (_event, outputType, limit) => {
    return listAIOutputs(outputType, limit ?? 20)
  })

  ipcMain.handle('ai:deleteOutput', deleteOutputInput, (_event, id) => {
    return deleteAIOutput(id)
  })

  ipcMain.handle('ai:updateOutput', updateOutputInput, (_event, id, updates) => {
    return updateAIOutput(id, updates)
  })
}
