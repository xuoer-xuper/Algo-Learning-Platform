import type {
  CoachBubblePayload,
  CoachConfig,
  CoachContestModePayload,
  CoachFeedbackType,
  CoachMetricsBundle,
  CoachPetState,
  CoachStateSnapshot,
  ProblemTimelineData,
} from '@shared/types/coach'
/**
 * Coach renderer 侧数据访问层。
 *
 * 与 problemsApi / analyticsApi 一致：薄封装 window.api.coach，
 * 不在 renderer 直接访问 SQLite，全部走 IPC。
 *
 * 桌宠窗与设置面板原先各自直连 preload（27 处），组件里混着 IPC 通道名，
 * 换通道要翻遍 tsx。这里按 load/save/subscribe + 动作动词统一收口，
 * 让 `window.api` 在 feature 层只出现在本文件。
 */

// ---------- 桌宠窗口控制 ----------

/**
 * 切换桌宠窗口的点击穿透。
 *
 * 桌宠使用透明无边框小窗，默认整窗穿透；只有鼠标位于可见交互区域
 * 或正在拖拽时捕获点击。区域边界由 useCoachMouseCapture 统一判断。
 */
export function toggleCoachIgnoreMouseEvents(ignore: boolean): Promise<boolean> {
  return window.api.coach.toggleIgnoreMouseEvents(ignore)
}

/** 开始拖拽。坐标由主进程 getCursorScreenPoint 统一取，避免 DPI 偏移。 */
export function startCoachDrag(): Promise<boolean> {
  return window.api.coach.startDrag()
}

export function endCoachDrag(): Promise<boolean> {
  return window.api.coach.endDrag()
}

export function resetCoachPosition(): Promise<boolean> {
  return window.api.coach.resetPosition()
}

// ---------- 状态与配置 ----------

export function loadCoachPetState(): Promise<CoachPetState> {
  return window.api.coach.getPetState()
}

export function loadCoachConfig(): Promise<CoachConfig> {
  return window.api.coach.getConfig()
}

export function saveCoachConfig(partial: Partial<CoachConfig>): Promise<boolean> {
  return window.api.coach.saveConfig(partial)
}

export function loadCoachState(): Promise<CoachStateSnapshot | null> {
  return window.api.coach.getState()
}

// ---------- 气泡与提示 ----------

/** 点击桌宠：触发提示，气泡由主进程推送回来。 */
export function clickCoachPet(): Promise<{
  triggered: boolean
  level: number
  llmEnabled: boolean
  note?: string
}> {
  return window.api.coach.petClick()
}

/** 请求下一级提示。不关闭当前气泡，主进程会推新 payload 替换内容。 */
export function triggerCoachHint(bubbleId?: string): Promise<{
  accepted: boolean
  level: number
  note?: string
  interventionId?: string
}> {
  return window.api.coach.triggerHint(bubbleId)
}

export function dismissCoachHint(bubbleId?: string): Promise<boolean> {
  return window.api.coach.dismissHint(bubbleId)
}

export function sendCoachFeedback(feedback: {
  bubbleId?: string
  interventionId?: string
  type: CoachFeedbackType
}): Promise<boolean> {
  return window.api.coach.feedback(feedback)
}

/** 关闭免责声明气泡；permanent 为 true 时不再弹。 */
export function dismissCoachDisclaimer(permanent: boolean): Promise<boolean> {
  return window.api.coach.dismissDisclaimer(permanent)
}

export function requestCoachTestHint(): Promise<CoachBubblePayload> {
  return window.api.coach.testHint()
}

// ---------- 自由对话 ----------

export function sendCoachChatMessage(params: {
  message: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<{ reply: string; success: boolean; error?: string }> {
  return window.api.coach.chat(params)
}

// ---------- 主进程推送订阅 ----------

export function subscribeCoachPetState(callback: (state: CoachPetState) => void): () => void {
  return window.api.coach.onPetStateChanged(callback)
}

export function subscribeCoachConfig(callback: (config: CoachConfig) => void): () => void {
  return window.api.coach.onConfigChanged(callback)
}

export function subscribeCoachShowBubble(
  callback: (payload: CoachBubblePayload) => void,
): () => void {
  return window.api.coach.onShowBubble(callback)
}

export function subscribeCoachDismissBubble(callback: () => void): () => void {
  return window.api.coach.onDismissBubble(callback)
}

export function subscribeCoachContestMode(
  callback: (payload: CoachContestModePayload) => void,
): () => void {
  return window.api.coach.onContestModeChanged(callback)
}

// ---------- 复盘与指标 ----------

/** 单题时间轴复盘数据（Task 18） */
export function loadProblemTimeline(problemId: string): Promise<ProblemTimelineData | null> {
  return window.api.coach.getProblemTimeline(problemId)
}

/** 干预效果指标原始数据 bundle（Task 19） */
export function loadMetricsBundle(): Promise<CoachMetricsBundle | null> {
  return window.api.coach.getMetricsBundle()
}
