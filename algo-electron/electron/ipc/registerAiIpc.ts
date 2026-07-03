import { ipcMain } from 'electron'
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
  type AIOutput,
  type AIOutputType,
  type SaveAIOutputInput,
} from '../db/repositories/aiOutputRepository'

type UpdateAIOutputInput = Partial<Pick<AIOutput, 'title' | 'content' | 'content_markdown'>>

export function registerAiIpc(): void {
  ipcMain.handle('ai:exportContext', () => {
    return exportAIContext()
  })

  ipcMain.handle('ai:exportContextMarkdown', () => {
    return renderContextAsMarkdown(exportAIContext())
  })

  ipcMain.handle('ai:getReviewRecommendations', (_event, limit?: number) => {
    return getReviewRecommendations(limit ?? 10)
  })

  ipcMain.handle('ai:getWeaknessAnalysis', (_event, limit?: number) => {
    return getWeaknessAnalysis(limit ?? 10)
  })

  ipcMain.handle('ai:getPeriodSummary', (_event, startDate: string, endDate: string) => {
    return getPeriodSummary({ start_date: startDate, end_date: endDate })
  })

  ipcMain.handle('ai:getPeriodSummaryMarkdown', (_event, startDate: string, endDate: string) => {
    const summary = getPeriodSummary({ start_date: startDate, end_date: endDate })
    return renderSummaryAsMarkdown(summary)
  })

  ipcMain.handle('ai:getReviewPlan', (_event, planDays?: number) => {
    return getReviewPlan(planDays ?? 7)
  })

  ipcMain.handle('ai:getReviewPlanMarkdown', (_event, planDays?: number) => {
    const plan = getReviewPlan(planDays ?? 7)
    return renderPlanAsMarkdown(plan)
  })

  ipcMain.handle('ai:saveOutput', (_event, input: SaveAIOutputInput) => {
    return saveAIOutput(input)
  })

  ipcMain.handle('ai:getOutput', (_event, id: string) => {
    return getAIOutput(id)
  })

  ipcMain.handle('ai:listOutputs', (_event, outputType?: AIOutputType, limit?: number) => {
    return listAIOutputs(outputType, limit ?? 20)
  })

  ipcMain.handle('ai:deleteOutput', (_event, id: string) => {
    return deleteAIOutput(id)
  })

  ipcMain.handle('ai:updateOutput', (_event, id: string, updates: UpdateAIOutputInput) => {
    return updateAIOutput(id, updates)
  })
}
