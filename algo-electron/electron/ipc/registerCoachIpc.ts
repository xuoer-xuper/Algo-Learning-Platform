import { ipcMain, screen, type BrowserWindow } from 'electron'
import type { CoachPetWindow } from '../coach/CoachPetWindow'
import type { CoachOrchestrator } from '../coach/CoachOrchestrator'
import type { CoachBubblePayload, CoachPetState } from '../coach/types'
import { loadCoachConfig, saveCoachConfig } from '../app/config'

/**
 * Coach IPC 注册。
 *
 * 阶段 1（桌宠视觉壳）暴露的 channel：
 * - 窗口控制：coach:getPetState / coach:setPetState / coach:toggleIgnoreMouseEvents
 *             coach:startDrag / coach:dragTo / coach:endDrag / coach:resetPosition
 * - 配置：coach:getConfig / coach:saveConfig / coach:testHint
 * - 气泡与反馈（阶段 2 规则引擎消费）：coach:showBubble / coach:dismissBubble
 *                                       coach:triggerHint / coach:dismissHint / coach:feedback
 *
 * 阶段 2 扩展：
 * - 状态：coach:getState / coach:getSession / coach:getSessionHistory
 * - 指标：coach:getMetrics / coach:listEvents / coach:listInterventions
 * - 审计：coach:exportAuditLog
 *
 * getter 注入模式与现有 registerXxxIpc 一致。
 */
export interface RegisterCoachIpcOptions {
  getWindow: () => BrowserWindow | null
  getCoachPetWindow: () => CoachPetWindow | null
  /** 阶段 2 注入：CoachOrchestrator（可选，未注入时新 channel 返回 null/空） */
  getCoachOrchestrator?: () => CoachOrchestrator | null
}

export function registerCoachIpc(options: RegisterCoachIpcOptions): void {
  const requirePetWindow = (): CoachPetWindow => {
    const w = options.getCoachPetWindow()
    if (!w) throw new Error('CoachPetWindow not initialized')
    return w
  }
  // --- 窗口控制 ---

  ipcMain.handle('coach:getPetState', () => {
    return options.getCoachPetWindow()?.getPetState() ?? 'idle'
  })

  ipcMain.handle('coach:setPetState', (_event, state: CoachPetState) => {
    requirePetWindow().setPetState(state)
    return true
  })

  ipcMain.handle('coach:toggleIgnoreMouseEvents', (_event, ignore: boolean) => {
    requirePetWindow().setIgnoreMouseEvents(ignore)
    return true
  })

  ipcMain.handle('coach:startDrag', (_event, screenX: number, screenY: number) => {
    requirePetWindow().startDrag(screenX, screenY)
    return true
  })

  ipcMain.handle('coach:endDrag', () => {
    requirePetWindow().endDrag()
    return true
  })

  ipcMain.handle('coach:resetPosition', () => {
    requirePetWindow().resetPosition()
    return true
  })

  // --- 配置 ---

  ipcMain.handle('coach:getConfig', () => {
    return loadCoachConfig()
  })

  ipcMain.handle('coach:saveConfig', (_event, partial: Parameters<typeof saveCoachConfig>[0]) => {
    saveCoachConfig(partial)
    // 同步推送给桌宠渲染层（透明度/缩放）
    options.getCoachPetWindow()?.notifyConfigChanged()
    return true
  })

  /**
   * 测试提示按钮：从设置面板触发，立即弹一个测试气泡 + 切换 alert 状态。
   * 阶段 1 用于演示与手动验证；阶段 2 后由规则引擎接管。
   */
  ipcMain.handle('coach:testHint', () => {
    const pet = requirePetWindow()
    pet.setPetState('alert')
    const payload: CoachBubblePayload = {
      id: `test-${Date.now()}`,
      title: '测试提示',
      message: '这是一条来自 Coach 的测试气泡。如果你看到它，说明桌宠视觉壳工作正常。',
      source: 'local',
      level: 1,
    }
    pet.showBubble(payload)
    return payload
  })

  // --- 气泡与反馈（阶段 2 规则引擎消费，阶段 1 仅日志 ack） ---

  /**
   * 主进程主动推送气泡（阶段 2 规则引擎触发）。
   */
  ipcMain.handle('coach:showBubble', (_event, payload: CoachBubblePayload) => {
    requirePetWindow().showBubble(payload)
    return true
  })

  ipcMain.handle('coach:dismissBubble', () => {
    options.getCoachPetWindow()?.dismissBubble()
    return true
  })

  /**
   * 用户主动请求"再给一点提示"。
   * 阶段 2：委托给 CoachOrchestrator.requestHintUpgrade（受防 abuse 冷却限制）。
   * 若 orchestrator 未初始化，回退到阶段 1 行为。
   */
  ipcMain.handle('coach:triggerHint', (_event, bubbleId?: string) => {
    const orchestrator = options.getCoachOrchestrator?.()
    if (!orchestrator) {
      console.log('[coach] triggerHint (no orchestrator)', { bubbleId })
      return { accepted: true, level: 1, note: '阶段 1 视觉壳：触发已收到，规则引擎在阶段 2 接入' }
    }
    return orchestrator.requestHintUpgrade(bubbleId)
  })

  /**
   * 用户点击"先不用"。
   * 阶段 2：委托给 CoachOrchestrator.dismissHint（更新 intervention user_action + 屏蔽规则）。
   */
  ipcMain.handle('coach:dismissHint', (_event, bubbleId?: string) => {
    const orchestrator = options.getCoachOrchestrator?.()
    if (!orchestrator) {
      console.log('[coach] dismissHint (no orchestrator)', { bubbleId })
      options.getCoachPetWindow()?.dismissBubble()
      options.getCoachPetWindow()?.setPetState('idle')
      return true
    }
    return orchestrator.dismissHint(bubbleId)
  })

  /**
   * 用户反馈（helpful / not_helpful / dismiss / never_today）。
   * 阶段 2：持久化到 coach_feedback 并影响后续频率。
   */
  ipcMain.handle('coach:feedback', (_event, feedback: {
    bubbleId?: string
    interventionId?: string
    type: 'helpful' | 'not_helpful' | 'dismiss' | 'never_today'
  }) => {
    const orchestrator = options.getCoachOrchestrator?.()
    if (!orchestrator) {
      console.log('[coach] feedback (no orchestrator)', feedback)
      return true
    }
    return orchestrator.recordFeedback({
      bubbleId: feedback.bubbleId,
      interventionId: feedback.interventionId,
      feedbackType: feedback.type,
    })
  })

  // --- 阶段 2 新增 channel ---

  /** 当前 Coach 服务运行时状态快照（会话/比赛模式/桌宠状态/屏蔽类型） */
  ipcMain.handle('coach:getState', () => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return null
    return o.getState()
  })

  /** 当前题目会话 */
  ipcMain.handle('coach:getSession', () => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return null
    return o.getCurrentSession()
  })

  /** 历史会话 */
  ipcMain.handle('coach:getSessionHistory', (_event, limit?: number) => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return []
    return o.getSessionHistory(limit)
  })

  /** 指标聚合（最近 30 天） */
  ipcMain.handle('coach:getMetrics', () => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return null
    return o.getMetrics()
  })

  /** 最近事件列表（调试面板用） */
  ipcMain.handle('coach:listEvents', (_event, limit?: number) => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return []
    return o.listRecentEvents(limit ?? 50)
  })

  /** 最近干预列表（调试面板用） */
  ipcMain.handle('coach:listInterventions', (_event, limit?: number) => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return []
    return o.listRecentInterventions(limit ?? 50)
  })

  /** 比赛模式审计日志导出（合规卖点） */
  ipcMain.handle('coach:exportAuditLog', () => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return []
    return o.exportAuditLog()
  })

  // --- 阶段 4：过程复盘 + 答辩数据 ---

  /** 单题时间轴复盘数据（Task 18 SessionTimelineView） */
  ipcMain.handle('coach:getProblemTimeline', (_event, problemId: string) => {
    const o = options.getCoachOrchestrator?.()
    if (!o || !problemId) return null
    return o.getProblemTimeline(problemId)
  })

  /** 干预效果指标原始数据 bundle（Task 19 CoachMetricsView） */
  ipcMain.handle('coach:getMetricsBundle', () => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return null
    return o.getMetricsBundle()
  })

  // --- 调试辅助：返回当前主屏 workArea（renderer 拖拽边界用） ---

  ipcMain.handle('coach:getWorkArea', () => {
    const workArea = screen.getPrimaryDisplay().workArea
    return { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height }
  })
}
