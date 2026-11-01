import { z } from 'zod'
import { COACH_PIN_MODES } from '../../../../electron/coach/petPinPolicy'

/*
 * Coach 域各 channel 的输入 schema。消费方：electron/ipc/registerCoachIpc.ts。
 *
 * 复用的界，数字的来处逐条写在这里，不在每个 channel 重复：
 *
 * - `bubbleId` 200：与本目录其它标识符同档（标识符 200 的既有口径）。
 *   气泡 id 由主进程生成（`demo-L2-<ts>` / `test-<ts>` / orchestrator 的 uuid），
 *   渲染进程只是原样回传。
 * - `petScale` 0.5..2 与 `petOpacity` 0.3..1：直接照抄 `CoachPanel.tsx` 两个 range
 *   输入的 `min` / `max`。这两个值最终进 CSS `transform: scale()` 与 `opacity`，
 *   放过 `NaN` 会让桌宠直接不可见——zod 的数字基检挡 NaN，上下界挡 ±Infinity。
 * - 聊天正文 8 KiB、历史 20 条：正文要拼进 LLM 请求体，历史每条也一样；
 *   `CoachChatPanel` 的输入框没有 maxLength，上限只能在这里给。20 条约等于
 *   十轮对话，够用且不至于把单次请求撑到任意大。
 * - LLM 的 `base_url` 4096：项目里 URL 的既有口径（`MAX_TAB_URL_LENGTH`）。
 *   `api_key` 与 `model` 512：短凭据与模型名，给个量级上限即可。
 * - `rowLimit` 1000：与 stats / ai 域同档。
 */
const bubbleId = z.string().min(1).max(200)
const rowLimit = z.number().int().min(1).max(1000).optional()
const llmText = z.string().min(1).max(512)
const petState = z.enum(['idle', 'thinking', 'alert', 'celebrate', 'sleep', 'focus'])

/*
 * `coach:saveConfig` 的形状刻意**只有** `CoachPanel.tsx` 真会发的 6 个字段。
 *
 * 这不是偷懒，是本文件最要紧的一条：`saveCoachConfig` 把 partial 直接深合并进
 * config.json，而 `CoachConfig` 里有 `llm.encrypted_api_key`。读路径是脱敏的
 * （`getCoachConfigForRenderer` 会把那个字段摘掉），写路径此前没有任何过滤——
 * 也就是说壳 renderer 能往加密 Key 那一格里写东西。strict 对象拒绝多余字段，
 * 这个白名单一钉上，那条路就没了。
 *
 * `position` 同样不在形状里：它由主进程 `CoachPetWindow` 在拖拽结束时自己写
 * （`saveCoachConfig({ position })` 是主进程内部调用，不经过本通道）。
 */
const saveCoachConfig = z.strictObject({
  enabled: z.boolean().optional(),
  sound: z.boolean().optional(),
  bubbleFrequency: z.enum(['low', 'medium', 'high']).optional(),
  scale: z.number().min(0.5).max(2).optional(),
  opacity: z.number().min(0.3).max(1).optional(),
  // B5.5：置顶模式。枚举照抄 petPinPolicy 的 COACH_PIN_MODES，越界值在这里就被拒，
  // 不靠 normalizeCoachPinMode 兜底——兜底是给手改 config.json 那条路用的。
  pinMode: z.enum(COACH_PIN_MODES).optional(),
})

const showBubble = z.strictObject({
  id: bubbleId,
  // 气泡标题 200、正文 4 KiB，与本目录其它文本同档。
  title: z.string().min(1).max(200),
  message: z.string().max(4 * 1024),
  source: z.enum(['local', 'llm']),
  problemId: z.string().min(1).max(200).optional(),
  eventId: z.string().min(1).max(200).optional(),
  // `level` 1..5 是提示等级的实际取值范围（演示升级分支的 `Math.min(x, 5)`）。
  level: z.number().int().min(1).max(5).optional(),
  bubble_type: z.enum(['hint', 'disclaimer', 'loading']).optional(),
})

const feedback = z.strictObject({
  bubbleId: bubbleId.optional(),
  interventionId: z.string().min(1).max(200).optional(),
  type: z.enum(['helpful', 'not_helpful', 'dismiss', 'never_today']),
})

const chat = z.strictObject({
  message: z
    .string()
    .min(1)
    .max(8 * 1024),
  history: z
    .array(
      z.strictObject({
        role: z.enum(['user', 'assistant']),
        content: z
          .string()
          .min(1)
          .max(8 * 1024),
      }),
    )
    .max(20)
    .optional(),
})

/*
 * `coach:saveLlmConfig` 的白名单：只有这三个字段。`encrypted_api_key` 刻意不在形状里：
 * 它只该由 `coach:saveLlmApiKey` 经 safeStorage 加密后写入，strict 拒绝多余字段之后，
 * 壳 renderer 没法绕过加密直接往那一格塞值。
 *
 * `base_url` 拒空串（与旧 `text({max:4096})` 的 min 1 一致）：`LlmConfigPanel` 的
 * Base URL 输入框没有本地校验、onBlur 原样发送，清空后失焦就会发 `''`——而主进程侧
 * `LlmConfigStore` 读路径是 `base_url ?? DEFAULT`（`??` 不拦 `''`），存进去会把空串
 * 一路带到 LLM 客户端。旧契约下这个输入被拒、面板显示"保存失败"，配置保持原值；
 * 恢复 min 1 就是保持这条已上线的 fail-closed 行为。
 */
const saveLlmConfig = z.strictObject({
  base_url: z.string().min(1).max(4096).optional(),
  model: llmText.optional(),
  enabled: z.boolean().optional(),
})

const testLlmConnection = z.strictObject({
  // `api_key` 允许空串：面板允许留空表示"用已保存的 Key 测"，
  // 紧接着的 `config.api_key || getDecryptedApiKey()` 就是这个意思。
  api_key: z.string().max(512),
  base_url: z.string().min(1).max(4096),
  model: llmText,
})

export const setPetStateInput = [petState] as const
export const toggleIgnoreMouseEventsInput = [z.boolean()] as const
// 调试用：renderer 输出日志到主进程，正文是自由文本。
export const logToMainInput = [z.string().max(10 * 1024)] as const
export const saveConfigInput = [saveCoachConfig] as const
export const showBubbleInput = [showBubble] as const
export const triggerHintInput = [bubbleId.optional()] as const
export const dismissHintInput = [bubbleId.optional()] as const
export const feedbackInput = [feedback] as const
export const dismissDisclaimerInput = [z.boolean()] as const
export const chatInput = [chat] as const
export const getSessionHistoryInput = [rowLimit] as const
export const listEventsInput = [rowLimit] as const
export const listInterventionsInput = [rowLimit] as const
export const getProblemTimelineInput = [z.string().min(1).max(200)] as const
// 空串是"清空已保存的 Key"这个合法操作，`saveApiKey` 自己判空并走删除分支。
// 收成 `min(1)` 会让用户没法解绑。
export const saveLlmApiKeyInput = [z.string().max(512)] as const
export const saveLlmConfigInput = [saveLlmConfig] as const
export const testLlmConnectionInput = [testLlmConnection] as const
