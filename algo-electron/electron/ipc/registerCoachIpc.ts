import type { IpcMainInvokeEvent } from 'electron'
import { screen } from 'electron'
import { coachPetIpcMain, ipcMain as shellIpcMain, type IpcListener } from './trustedSender'
import {
  arrayOf,
  bool,
  decimal,
  freeText,
  int,
  object,
  oneOf,
  optional,
  text,
  type IpcSchemaTuple,
  type ParsedArgs,
} from './payloadSchema'
import type { CoachPetWindow } from '../coach/CoachPetWindow'
import { COACH_PIN_MODES } from '../coach/petPinPolicy'
import type { CoachOrchestrator } from '../coach/CoachOrchestrator'
import type { CoachBubblePayload } from '../coach/types'
import { getCoachConfigForRenderer, saveCoachConfig } from '../app/config'

const COACH_PET_CHANNELS = new Set([
  'coach:getPetState',
  'coach:toggleIgnoreMouseEvents',
  'coach:startDrag',
  'coach:endDrag',
  'coach:getConfig',
  'coach:triggerHint',
  'coach:dismissHint',
  'coach:feedback',
  'coach:dismissDisclaimer',
  'coach:petClick',
  'coach:chat',
])

/**
 * 按 channel 选注册器：桌宠必需的少数 channel 走 `coachPetIpcMain`（桌宠窗口也能调），
 * 其余走 `shellIpcMain`（只有完整壳能调）。
 *
 * 两种调用形态都要转发，否则本文件无法声明 schema。原先这里写的是
 * `Parameters<typeof shellIpcMain.handle>[1]`——`handle` 变成重载之后，那个写法取到的是
 * **最后一个重载**的第二参（schema 元组），于是本文件 16 个 handler 全报"函数不能当元组用"。
 * 重载的参数类型没法用 `Parameters` 取全，只能照着重载写一遍。
 */
function ipcMainHandle(channel: string, listener: IpcListener<IpcMainInvokeEvent>): void
function ipcMainHandle<const S extends IpcSchemaTuple>(
  channel: string,
  schemas: S,
  listener: (event: IpcMainInvokeEvent, ...args: ParsedArgs<S>) => unknown,
): void
function ipcMainHandle(
  channel: string,
  second: IpcSchemaTuple | IpcListener<IpcMainInvokeEvent>,
  third?: IpcListener<IpcMainInvokeEvent>,
): void {
  const registrar = COACH_PET_CHANNELS.has(channel) ? coachPetIpcMain : shellIpcMain
  if (Array.isArray(second)) {
    if (!third) throw new Error('IPC registration with schemas requires a listener')
    registrar.handle(channel, second, third)
    return
  }
  registrar.handle(channel, second as IpcListener<IpcMainInvokeEvent>)
}

const ipcMain = { handle: ipcMainHandle }

/*
 * 复用的界。数字的来处逐条写在这里，不在每个 channel 重复：
 *
 * - `bubbleId` 200：与本目录其它标识符同档（`registerScriptsIpc` 的 200）。
 *   气泡 id 由主进程生成（`demo-L2-<ts>` / `test-<ts>` / orchestrator 的 uuid），
 *   渲染进程只是原样回传。
 * - `petScale` 0.5..2 与 `petOpacity` 0.3..1：直接照抄 `CoachPanel.tsx` 两个 range
 *   输入的 `min` / `max`。这两个值最终进 CSS `transform: scale()` 与 `opacity`，
 *   放过 `NaN` 会让桌宠直接不可见——`decimal` 里那句 `Number.isFinite` 就是为此。
 * - 聊天正文 8 KiB、历史 20 条：正文要拼进 LLM 请求体，历史每条也一样；
 *   `CoachChatPanel` 的输入框没有 maxLength，上限只能在这里给。20 条约等于
 *   十轮对话，够用且不至于把单次请求撑到任意大。
 * - LLM 的 `base_url` 4096：项目里 URL 的既有口径（`MAX_TAB_URL_LENGTH`）。
 *   `api_key` 与 `model` 512：短凭据与模型名，给个量级上限即可。
 * - `rowLimit` 1000：与 `registerStatsIpc` / `registerAiIpc` 同档。
 */
const bubbleId = () => text({ max: 200 })
const rowLimit = () => optional(int({ min: 1, max: 1000 }))
const llmText = () => text({ max: 512 })
const petState = () => oneOf(['idle', 'thinking', 'alert', 'celebrate', 'sleep', 'focus'] as const)

/*
 * `coach:saveConfig` 的形状刻意**只有** `CoachPanel.tsx` 真会发的 6 个字段。
 *
 * 这不是偷懒，是本文件最要紧的一条：`saveCoachConfig` 把 partial 直接深合并进
 * config.json，而 `CoachConfig` 里有 `llm.encrypted_api_key`。读路径是脱敏的
 * （`getCoachConfigForRenderer` 会把那个字段摘掉），写路径此前没有任何过滤——
 * 也就是说壳 renderer 能往加密 Key 那一格里写东西。`object()` 默认拒绝多余字段，
 * 这个形状一钉上，那条路就没了。
 *
 * `position` 同样不在形状里：它由主进程 `CoachPetWindow` 在拖拽结束时自己写
 * （`saveCoachConfig({ position })` 是主进程内部调用，不经过本通道）。
 */
const coachConfigShape = () => object({
  enabled: optional(bool),
  sound: optional(bool),
  bubbleFrequency: optional(oneOf(['low', 'medium', 'high'] as const)),
  scale: optional(decimal({ min: 0.5, max: 2 })),
  opacity: optional(decimal({ min: 0.3, max: 1 })),
  // B5.5：置顶模式。枚举照抄 petPinPolicy 的 COACH_PIN_MODES，越界值在这里就被拒，
  // 不靠 normalizeCoachPinMode 兜底——兜底是给手改 config.json 那条路用的。
  pinMode: optional(oneOf(COACH_PIN_MODES)),
})

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
  getCoachPetWindow: () => CoachPetWindow | null
  /** 阶段 2 注入：CoachOrchestrator（可选，未注入时新 channel 返回 null/空） */
  getCoachOrchestrator?: () => CoachOrchestrator | null
}

export function registerCoachIpc(options: RegisterCoachIpcOptions): void {
  const isContestMode = (): boolean => options.getCoachOrchestrator?.()?.getState().is_contest_mode ?? false
  const requirePetWindow = (): CoachPetWindow => {
    const w = options.getCoachPetWindow()
    if (!w) throw new Error('CoachPetWindow not initialized')
    return w
  }
  // --- 窗口控制 ---

  ipcMain.handle('coach:getPetState', () => {
    return options.getCoachPetWindow()?.getPetState() ?? 'idle'
  })

  ipcMain.handle('coach:setPetState', [petState()], (_event, state) => {
    requirePetWindow().setPetState(state)
    return true
  })

  ipcMain.handle('coach:toggleIgnoreMouseEvents', [bool], (_event, ignore) => {
    requirePetWindow().setIgnoreMouseEvents(ignore)
    return true
  })

  // 调试用：renderer 输出日志到主进程
  ipcMain.handle('log-to-main', [freeText({ max: 10 * 1024 })], (_event, message) => {
    console.log(message)
    return true
  })

  ipcMain.handle('coach:startDrag', () => {
    requirePetWindow().startDrag()
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
    return getCoachConfigForRenderer()
  })

  ipcMain.handle('coach:saveConfig', [coachConfigShape()], (_event, partial) => {
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
    if (isContestMode()) throw new Error('比赛模式硬关闭')
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
  /*
   * 气泡正文的界：标题 200、正文 4 KiB，与本目录其它文本同档。
   * `level` 1..5 是提示等级的实际取值范围（见下方演示升级分支的 `Math.min(x, 5)`）。
   */
  ipcMain.handle('coach:showBubble', [object({
    id: bubbleId(),
    title: text({ max: 200 }),
    message: freeText({ max: 4 * 1024 }),
    source: oneOf(['local', 'llm'] as const),
    problemId: optional(text()),
    eventId: optional(text()),
    level: optional(int({ min: 1, max: 5 })),
    bubble_type: optional(oneOf(['hint', 'disclaimer', 'loading'] as const)),
  })], (_event, payload) => {
    if (isContestMode()) throw new Error('比赛模式硬关闭')
    requirePetWindow().showBubble(payload)
    return true
  })

  ipcMain.handle('coach:dismissBubble', () => {
    options.getCoachPetWindow()?.dismissBubble()
    return true
  })

  /**
   * 用户主动请求"再给一点提示"。
   * 阶段 2：委托给 CoachOrchestrator.requestHintUpgrade。
   * 若 orchestrator 未初始化，回退到阶段 1 行为。
   *
   * 这里原先写着"（受防 abuse 冷却限制）"。**没有这回事**：`HINT_UPGRADE_COOLDOWN_MS`
   * 那个 2 分钟冷却长在 `RuleEngine.requestHintUpgrade` 里，而本行调到的是
   * `CoachOrchestrator` 的同名方法，它不委托给引擎（见那边的注释）。live 路径上只有
   * 一个 `hintInProgress` 并发闸，挡的是"生成中再点"，不是频次。
   */
  ipcMain.handle('coach:triggerHint', [optional(bubbleId())], async (_event, bubbleId) => {
    if (isContestMode()) return { accepted: false, level: 0, note: '比赛模式硬关闭' }
    // 演示/测试气泡走演示升级分支（不经过 orchestrator 规则引擎）
    const isDemo = !bubbleId || bubbleId.startsWith('test-') || bubbleId.startsWith('demo-')
    if (isDemo) {
      // 从 bubbleId 解析当前等级（格式 demo-L{n}-xxx 或 test-xxx），升级到 n+1
      const levelMatch = bubbleId?.match(/demo-L(\d+)/)
      const currentLevel = levelMatch ? parseInt(levelMatch[1], 10) : 1
      const nextLevel = Math.min(currentLevel + 1, 5)
      if (nextLevel >= 5) {
        return { accepted: false, level: 5, note: '已到最高等级' }
      }
      const demoHints: Record<number, { title: string; message: string }> = {
        2: {
          title: '提示升级 · L2',
          message: '检查边界条件：n=1 时是否单独处理？数据范围是否会导致溢出？',
        },
        3: {
          title: '提示升级 · L3',
          message: '考虑数据结构：是否需要前缀和优化？单调栈/队列能否降低复杂度？',
        },
        4: {
          title: '提示升级 · L4',
          message: '算法方向：这题可能是二分答案/分治/贪心。尝试构造反例验证你的思路。',
        },
        5: {
          title: '提示升级 · L5',
          message: '这道题涉及【二分图匹配】概念。确认要查看吗？这可能接近题解方向。',
        },
      }
      const hint = demoHints[nextLevel] ?? demoHints[2]
      const pet = requirePetWindow()
      pet.setPetState('thinking')
      pet.showBubble({
        id: `demo-L${nextLevel}-${Date.now()}`,
        title: hint.title,
        message: hint.message,
        source: 'local',
        level: nextLevel,
      })
      return { accepted: true, level: nextLevel, note: '演示气泡升级' }
    }
    const orchestrator = options.getCoachOrchestrator?.()
    if (!orchestrator) {
      return { accepted: false, level: 0, note: '规则引擎未初始化' }
    }
    return await orchestrator.requestHintUpgrade(bubbleId)
  })

  /**
   * 用户点击"先不用"。
   * 阶段 2：委托给 CoachOrchestrator.dismissHint（更新 intervention user_action + 屏蔽规则）。
   */
  ipcMain.handle('coach:dismissHint', [optional(bubbleId())], (_event, bubbleId) => {
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
  ipcMain.handle('coach:feedback', [object({
    bubbleId: optional(bubbleId()),
    interventionId: optional(text()),
    type: oneOf(['helpful', 'not_helpful', 'dismiss', 'never_today'] as const),
  })], (_event, feedback) => {
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

  /** 关闭免责声明（permanent=true 永久关闭） */
  ipcMain.handle('coach:dismissDisclaimer', [bool], (_event, permanent) => {
    const orchestrator = options.getCoachOrchestrator?.()
    if (!orchestrator) {
      options.getCoachPetWindow()?.dismissBubble()
      return true
    }
    orchestrator.dismissDisclaimer(permanent)
    return true
  })

  /** 点击桌宠：触发提示（LLM 或本地），返回触发结果与 LLM 状态 */
  ipcMain.handle('coach:petClick', async () => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return { triggered: false, level: 0, llmEnabled: false }
    return await o.petClick()
  })

  /** 自由聊天：发送用户消息，获取 LLM 回复 */
  ipcMain.handle('coach:chat', [object({
    message: text({ max: 8 * 1024 }),
    history: optional(arrayOf(object({
      role: oneOf(['user', 'assistant'] as const),
      content: text({ max: 8 * 1024 }),
    }), { max: 20 })),
  })], async (_event, params) => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return { reply: '', success: false, error: 'Coach 未初始化' }
    const reply = await o.chatWithLlm(params.message, params.history)
    if (reply === null) {
      return { reply: '', success: false, error: 'LLM 调用失败或未启用' }
    }
    return { reply, success: true }
  })

  /** 请求针对当前题目的提示 */
  ipcMain.handle('coach:requestHint', async () => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return { message: '', success: false, error: 'Coach 未初始化' }
    const message = await o.requestHintFromLlm()
    if (message === null) {
      return { message: '', success: false, error: 'LLM 调用失败或未启用' }
    }
    return { message, success: true }
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
  ipcMain.handle('coach:getSessionHistory', [rowLimit()], (_event, limit) => {
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
  ipcMain.handle('coach:listEvents', [rowLimit()], (_event, limit) => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return []
    return o.listRecentEvents(limit ?? 50)
  })

  /** 最近干预列表（调试面板用） */
  ipcMain.handle('coach:listInterventions', [rowLimit()], (_event, limit) => {
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
  ipcMain.handle('coach:getProblemTimeline', [text()], (_event, problemId) => {
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

  // --- 阶段 5：LLM 配置 ---

  /** 获取 LLM 配置状态（脱敏，不返回明文 Key） */
  ipcMain.handle('coach:getLlmConfig', () => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return null
    return o.getLlmHintService().getConfigStatus()
  })

  /*
   * 保存 API Key（加密存储）。
   *
   * 用 `freeText` 而不是 `text`：空串是"清空已保存的 Key"这个合法操作，
   * `saveApiKey` 自己判空并走删除分支。收成 `text({min:1})` 会让用户没法解绑。
   */
  ipcMain.handle('coach:saveLlmApiKey', [freeText({ max: 512 })], (_event, apiKey) => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return false
    return o.getLlmHintService().saveApiKey(apiKey)
  })

  /** 保存非敏感配置（base_url / model / enabled） */
  /*
   * 只有这三个字段。`encrypted_api_key` 刻意不在形状里：它只该由
   * `coach:saveLlmApiKey` 经 safeStorage 加密后写入，`object()` 拒绝多余字段之后，
   * 壳 renderer 没法绕过加密直接往那一格塞值。
   */
  ipcMain.handle('coach:saveLlmConfig', [object({
    base_url: optional(text({ max: 4096 })),
    model: optional(llmText()),
    enabled: optional(bool),
  })], (_event, partial) => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return false
    o.getLlmHintService().saveConfig(partial)
    return true
  })

  /** 测试连接 */
  /*
   * `api_key` 用 `freeText`：面板允许留空表示"用已保存的 Key 测"，
   * 紧接着的 `config.api_key || getDecryptedApiKey()` 就是这个意思。
   */
  ipcMain.handle('coach:testLlmConnection', [object({
    api_key: freeText({ max: 512 }),
    base_url: text({ max: 4096 }),
    model: llmText(),
  })], async (_event, config) => {
    const o = options.getCoachOrchestrator?.()
    if (!o) return { success: false, message: 'Coach 未初始化' }
    // 前端传了 Key 就用前端的，否则用已保存的
    const apiKey = config.api_key || o.getLlmHintService().getDecryptedApiKey()
    if (!apiKey) {
      return { success: false, message: '未配置 API Key' }
    }
    return o.getLlmHintService().testConnection({
      api_key: apiKey,
      base_url: config.base_url,
      model: config.model,
      enabled: true,
    })
  })
}
