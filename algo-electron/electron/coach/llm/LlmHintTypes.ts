import type { CoachEventType, CoachInterventionLevel } from '../types'
import type { ProblemConstraints } from '../problemFacts/ConstraintParser'

/**
 * LLM 提示模块类型定义。
 *
 * 数据流：
 *   ContextGatherer.collect() → LlmHintRequestContext
 *   PromptBuilder.build(ctx) → ChatMessage[]
 *   ArkClient.chat(messages) → LlmHintResponse
 *   LlmHintService.generateHint() → LlmHintResult | null
 */

/** 发送给 LLM 的完整上下文（脱敏后） */
export interface LlmHintRequestContext {
  /** 题目信息 */
  problem: {
    platform: string
    problem_id: string
    title: string
    difficulty?: string | null
    statement?: string | null
    constraints?: ProblemConstraints | null
    tags?: string[]
  }
  /** 当前会话状态 */
  session: {
    attempt_duration_sec: number
    active_seconds: number
    detected_stuck_level: 'reading' | 'coding' | 'stuck'
    phase: string
  }
  /** 提交历史（本题，最近 10 条） */
  submissions: Array<{
    verdict: string
    language?: string | null
    runtime_ms?: number | null
    submitted_at: string
  }>
  /** 用户画像（全局，来自 ai_context_snapshots） */
  user_profile: {
    total_solved: number
    total_submissions: number
    ac_rate: number
    weak_tags: string[]
    recent_streak_days: number
  }
  /** 当前请求的提示等级 */
  hint_request: {
    target_level: CoachInterventionLevel
    event_type: CoachEventType
    user_explicit_ask: boolean
    verdict?: string
  }
}

/** LLM 返回的提示内容（要求 JSON 结构化输出） */
export interface LlmHintResponse {
  /** 提示正文（展示给用户） */
  message: string
  /** 提示类型 */
  hint_type: 'metacognition' | 'boundary' | 'complexity' | 'strategy' | 'concept'
  /** 关联标签（写入 coach_interventions.related_tags） */
  related_tags: string[]
  /** 置信度 0-1 */
  confidence: number
  /** 是否接近题解方向（用于 L5 二次确认机制） */
  reveals_solution: boolean
  /** 推理过程（可选，调试用，不展示给用户） */
  reasoning?: string
}

/** LlmHintService 的最终输出 */
export interface LlmHintResult {
  /** 提示正文 */
  message: string
  /** 来源标记：始终为 'llm' */
  source_type: 'llm'
  /** 关联标签 */
  related_tags: string[]
  /** 提示类型 */
  hint_type: LlmHintResponse['hint_type']
  /** 置信度 */
  confidence: number
  /** 是否接近题解方向 */
  reveals_solution: boolean
  /** 使用的模型 */
  model: string
  /** 输入 token 数 */
  tokens_input: number
  /** 输出 token 数 */
  tokens_output: number
  /** 调用延迟（毫秒） */
  latency_ms: number
}

/** OpenAI SDK 消息格式 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** ArkClient 调用选项 */
export interface ArkChatOptions {
  /** 目标提示等级 */
  target_level: CoachInterventionLevel
  /** 是否关闭深度思考（提示类任务默认关闭以降延迟） */
  disable_thinking?: boolean
  /** 温度（默认 0.3） */
  temperature?: number
  /** 最大输出 token（默认 1024） */
  max_tokens?: number
}

/** LLM 配置 */
export interface LlmConfig {
  /** 火山方舟 API Key */
  api_key: string
  /** Base URL（默认 https://ark.cn-beijing.volces.com/api/v3） */
  base_url: string
  /** 模型 ID（默认 doubao-seed-1-6-flash-250715） */
  model: string
  /** 是否启用 LLM 提示 */
  enabled: boolean
}

/** LLM 默认配置 */
export const DEFAULT_LLM_CONFIG: LlmConfig = {
  api_key: '',
  base_url: 'https://ark.cn-beijing.volces.com/api/v3',
  model: 'doubao-seed-1-6-flash-250715',
  enabled: false,
}

/** 连接测试结果 */
export interface LlmConnectionTestResult {
  success: boolean
  message: string
  latency_ms?: number
  model?: string
}
