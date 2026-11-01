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
import { IPC_CHANNELS } from '../../src/shared/constants/channels'

/*
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/ai.ts`；
 * limit 1000 / planDays 3650 / output_type 枚举 / 正文 4 MiB 四个界的理由写在那里。
 */
export function registerAiIpc(): void {
  ipcMain.handle(IPC_CHANNELS.AI.EXPORT_CONTEXT, () => {
    return exportAIContext()
  })

  ipcMain.handle(IPC_CHANNELS.AI.EXPORT_CONTEXT_MARKDOWN, () => {
    return renderContextAsMarkdown(exportAIContext())
  })

  ipcMain.handle(
    IPC_CHANNELS.AI.GET_REVIEW_RECOMMENDATIONS,
    getReviewRecommendationsInput,
    (_event, limit) => {
      return getReviewRecommendations(limit ?? 10)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.AI.GET_WEAKNESS_ANALYSIS,
    getWeaknessAnalysisInput,
    (_event, limit) => {
      return getWeaknessAnalysis(limit ?? 10)
    },
  )

  ipcMain.handle(IPC_CHANNELS.AI.GET_PERIOD_SUMMARY, getPeriodSummaryInput, (_event, input) => {
    return getPeriodSummary({ start_date: input.startDate, end_date: input.endDate })
  })

  ipcMain.handle(
    IPC_CHANNELS.AI.GET_PERIOD_SUMMARY_MARKDOWN,
    getPeriodSummaryMarkdownInput,
    (_event, input) => {
      const summary = getPeriodSummary({ start_date: input.startDate, end_date: input.endDate })
      return renderSummaryAsMarkdown(summary)
    },
  )

  ipcMain.handle(IPC_CHANNELS.AI.GET_REVIEW_PLAN, getReviewPlanInput, (_event, days) => {
    return getReviewPlan(days ?? 7)
  })

  ipcMain.handle(
    IPC_CHANNELS.AI.GET_REVIEW_PLAN_MARKDOWN,
    getReviewPlanMarkdownInput,
    (_event, days) => {
      const plan = getReviewPlan(days ?? 7)
      return renderPlanAsMarkdown(plan)
    },
  )

  ipcMain.handle(IPC_CHANNELS.AI.SAVE_OUTPUT, saveOutputInput, (_event, input) => {
    const payload: SaveAIOutputInput = input
    return saveAIOutput(payload)
  })

  ipcMain.handle(IPC_CHANNELS.AI.GET_OUTPUT, getOutputInput, (_event, id) => {
    return getAIOutput(id)
  })

  ipcMain.handle(IPC_CHANNELS.AI.LIST_OUTPUTS, listOutputsInput, (_event, input) => {
    return listAIOutputs(input.outputType, input.limit ?? 20)
  })

  ipcMain.handle(IPC_CHANNELS.AI.DELETE_OUTPUT, deleteOutputInput, (_event, id) => {
    return deleteAIOutput(id)
  })

  ipcMain.handle(IPC_CHANNELS.AI.UPDATE_OUTPUT, updateOutputInput, (_event, input) => {
    return updateAIOutput(input.id, input.updates)
  })
}
