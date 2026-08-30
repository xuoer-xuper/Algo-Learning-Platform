/**
 * Coach renderer 侧数据访问层。
 *
 * 与 problemsApi / analyticsApi 一致：薄封装 window.electronAPI，
 * 不在 renderer 直接访问 SQLite，全部走 IPC。
 *
 * 桌宠窗与设置面板原先各自直连 preload（27 处），组件里混着 IPC 通道名，
 * 换通道要翻遍 tsx。这里按 load/save/subscribe + 动作动词统一收口，
 * 让 `window.electronAPI` 在 feature 层只出现在本文件。
 */

// ---------- 桌宠窗口控制 ----------

/**
 * 切换桌宠窗口的点击穿透。
 *
 * 桌宠是全屏无边框置顶窗，默认整窗穿透，否则会挡住底下的编辑器；
 * hover 到可交互区域时临时关闭穿透，离开再恢复。
 */
export function toggleCoachIgnoreMouseEvents(ignore: boolean): Promise<boolean> {
  return window.electronAPI.coachToggleIgnoreMouseEvents(ignore)
}

/** 开始拖拽。坐标由主进程 getCursorScreenPoint 统一取，避免 DPI 偏移。 */
export function startCoachDrag(): Promise<boolean> {
  return window.electronAPI.coachStartDrag()
}

export function endCoachDrag(): Promise<boolean> {
  return window.electronAPI.coachEndDrag()
}

export function resetCoachPosition(): Promise<boolean> {
  return window.electronAPI.coachResetPosition()
}

// ---------- 状态与配置 ----------

export function loadCoachPetState(): Promise<CoachPetState> {
  return window.electronAPI.coachGetPetState()
}

export function loadCoachConfig(): Promise<CoachConfig> {
  return window.electronAPI.coachGetConfig()
}

export function saveCoachConfig(partial: Partial<CoachConfig>): Promise<boolean> {
  return window.electronAPI.coachSaveConfig(partial)
}

export function loadCoachState(): Promise<CoachStateSnapshot | null> {
  return window.electronAPI.coachGetState()
}

// ---------- 气泡与提示 ----------

/** 点击桌宠：触发提示，气泡由主进程推送回来。 */
export function clickCoachPet(): Promise<{
  triggered: boolean
  level: number
  llmEnabled: boolean
  note?: string
}> {
  return window.electronAPI.coachPetClick()
}

/** 请求下一级提示。不关闭当前气泡，主进程会推新 payload 替换内容。 */
export function triggerCoachHint(bubbleId?: string): Promise<{
  accepted: boolean
  level: number
  note?: string
  interventionId?: string
}> {
  return window.electronAPI.coachTriggerHint(bubbleId)
}

export function dismissCoachHint(bubbleId?: string): Promise<boolean> {
  return window.electronAPI.coachDismissHint(bubbleId)
}

export function sendCoachFeedback(feedback: {
  bubbleId?: string
  interventionId?: string
  type: CoachFeedbackType
}): Promise<boolean> {
  return window.electronAPI.coachFeedback(feedback)
}

/** 关闭免责声明气泡；permanent 为 true 时不再弹。 */
export function dismissCoachDisclaimer(permanent: boolean): Promise<boolean> {
  return window.electronAPI.coachDismissDisclaimer(permanent)
}

export function requestCoachTestHint(): Promise<CoachBubblePayload> {
  return window.electronAPI.coachTestHint()
}

// ---------- 自由对话 ----------

export function sendCoachChatMessage(params: {
  message: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<{ reply: string; success: boolean; error?: string }> {
  return window.electronAPI.coachChat(params)
}

// ---------- 主进程推送订阅 ----------

export function subscribeCoachPetState(
  callback: (state: CoachPetState) => void,
): () => void {
  return window.electronAPI.onCoachPetStateChanged(callback)
}

export function subscribeCoachConfig(
  callback: (config: CoachConfig) => void,
): () => void {
  return window.electronAPI.onCoachConfigChanged(callback)
}

export function subscribeCoachShowBubble(
  callback: (payload: CoachBubblePayload) => void,
): () => void {
  return window.electronAPI.onCoachShowBubble(callback)
}

export function subscribeCoachDismissBubble(callback: () => void): () => void {
  return window.electronAPI.onCoachDismissBubble(callback)
}

export function subscribeCoachContestMode(
  callback: (payload: CoachContestModePayload) => void,
): () => void {
  return window.electronAPI.onCoachContestModeChanged(callback)
}

// ---------- 复盘与指标 ----------

/** 单题时间轴复盘数据（Task 18） */
export function loadProblemTimeline(
  problemId: string,
): Promise<ProblemTimelineData | null> {
  return window.electronAPI.coachGetProblemTimeline(problemId)
}

/** 干预效果指标原始数据 bundle（Task 19） */
export function loadMetricsBundle(): Promise<CoachMetricsBundle | null> {
  return window.electronAPI.coachGetMetricsBundle()
}
