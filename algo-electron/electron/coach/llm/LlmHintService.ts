import crypto from 'node:crypto'
import type { CoachEvent, CoachInterventionLevel, ProblemSession } from '../types'
import type { ProblemConstraints } from '../problemFacts/ConstraintParser'
import { nowBeijing } from '../../shared/time'
import { ArkClient } from './ArkClient'
import { LlmConfigStore } from './LlmConfigStore'
import { ContextGatherer } from './ContextGatherer'
import { buildHintPrompt, buildChatPrompt } from './PromptBuilder'
import type { LlmHintResult, LlmConfig, LlmConnectionTestResult } from './LlmHintTypes'

/**
 * LLM 提示生成服务（主入口）。
 *
 * 数据流：
 *   generateHint() → ContextGatherer.collect() → PromptBuilder.build() → ArkClient.chat()
 *
 * 失败处理：
 *   - LLM 未启用 → 返回 null（调用方降级到本地模板）
 *   - 上下文采集失败 → 返回 null
 *   - API 调用失败 → 返回 null（打印警告日志）
 *
 * 缓存策略：
 *   同题同等级 5 分钟内复用上一次 LLM 响应，减少 80% API 调用。
 */
const CACHE_TTL_MS = 5 * 60 * 1000      // 缓存 5 分钟

interface CacheEntry {
  result: LlmHintResult
  timestamp: number
}

export class LlmHintService {
  private readonly arkClient: ArkClient
  private readonly configStore: LlmConfigStore
  private readonly contextGatherer: ContextGatherer
  private initialized = false
  private enabled = false

  /** 缓存：key = `${problemId}:${level}` */
  private cache = new Map<string, CacheEntry>()

  constructor() {
    this.arkClient = new ArkClient()
    this.configStore = new LlmConfigStore()
    this.contextGatherer = new ContextGatherer()
  }

  /**
   * 初始化：加载配置并初始化 ArkClient。
   * 应在应用启动时调用。
   */
  init(): void {
    const config = this.configStore.load()
    this.enabled = config.enabled && config.api_key.length > 0
    if (this.enabled) {
      this.arkClient.init(config)
    }
    this.initialized = true
  }

  /**
   * 重新加载配置（用户修改配置后调用）。
   */
  reloadConfig(): void {
    const config = this.configStore.load()
    const wasEnabled = this.enabled
    this.enabled = config.enabled && config.api_key.length > 0
    if (this.enabled) {
      this.arkClient.init(config)
    }
    // 如果从启用变为禁用，清空缓存
    if (wasEnabled && !this.enabled) {
      this.cache.clear()
    }
  }

  /** LLM 是否启用且就绪 */
  isReady(): boolean {
    return this.initialized && this.enabled && this.arkClient.isReady()
  }

  /** 获取当前配置状态（脱敏，用于 UI 展示） */
  getConfigStatus(): {
    enabled: boolean
    has_key: boolean
    key_masked: string
    model: string
    base_url: string
  } {
    const config = this.configStore.load()
    return {
      enabled: config.enabled,
      has_key: config.api_key.length > 0,
      key_masked: this.configStore.getApiKeyMasked(),
      model: config.model,
      base_url: config.base_url,
    }
  }

  /**
   * 获取明文 API Key（仅供 testConnection 使用，不暴露给渲染进程）。
   */
  getDecryptedApiKey(): string {
    return this.configStore.load().api_key
  }

  /**
   * 生成 LLM 提示。
   *
   * @returns LlmHintResult 成功；null 表示未启用/采集失败/调用失败（调用方应降级到本地模板）
   */
  async generateHint(params: {
    event: CoachEvent
    session: ProblemSession | null
    constraints: ProblemConstraints | null
    targetLevel: CoachInterventionLevel
    userExplicitAsk: boolean
    problemUrl?: string | null
  }): Promise<LlmHintResult | null> {
    if (!this.isReady()) return null

    const { event, session, constraints, targetLevel, userExplicitAsk, problemUrl } = params

    // 采集上下文
    const ctx = this.contextGatherer.collect(
      event,
      session,
      constraints,
      targetLevel,
      userExplicitAsk,
      problemUrl,
    )
    if (!ctx) return null

    // 缓存检查（用户主动请求时不走缓存）
    const cacheKey = `${ctx.problem.platform}:${ctx.problem.problem_id}:L${targetLevel}`
    if (!userExplicitAsk) {
      const cached = this.cache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.result
      }
    }

    // 构建 Prompt
    const messages = buildHintPrompt(ctx)

    // 调用 LLM
    try {
      const result = await this.arkClient.chat(messages, {
        target_level: targetLevel,
        disable_thinking: true,
        temperature: 0.3,
        max_tokens: 1024,
      })

      const hintResult: LlmHintResult = {
        message: result.response.message,
        source_type: 'llm',
        related_tags: result.response.related_tags,
        hint_type: result.response.hint_type,
        confidence: result.response.confidence,
        reveals_solution: result.response.reveals_solution,
        model: result.model,
        tokens_input: result.tokens_input,
        tokens_output: result.tokens_output,
        latency_ms: result.latency_ms,
      }

      // 缓存结果
      this.cache.set(cacheKey, { result: hintResult, timestamp: Date.now() })

      return hintResult
    } catch (err) {
      console.warn('[llm] generateHint failed:', err)
      return null
    }
  }

  /**
   * 测试连接（供 IPC 调用）。
   */
  async testConnection(config: LlmConfig): Promise<LlmConnectionTestResult> {
    return this.arkClient.testConnection(config)
  }

  /**
   * 构造 stub event（聊天/请求提示场景没有真实的 CoachEvent）。
   */
  private buildStubEvent(session: ProblemSession | null): CoachEvent {
    return {
      event_id: crypto.randomUUID(),
      session_id: session?.session_id ?? null,
      event_type: 'multiple_wrong',
      severity: 'warn',
      score: 50,
      problem_id: session?.problem_id ?? null,
      platform: session?.platform ?? null,
      evidence: {},
      created_at: nowBeijing(),
    }
  }

  /**
   * 自由聊天：用户输入消息，LLM 返回文本回复。
   */
  async chat(params: {
    userMessage: string
    session: ProblemSession | null
    constraints: ProblemConstraints | null
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
    problemUrl?: string | null
  }): Promise<string | null> {
    if (!this.isReady()) return null

    const { userMessage, session, constraints, history, problemUrl } = params

    const stubEvent = this.buildStubEvent(session)

    // 采集上下文
    const ctx = this.contextGatherer.collect(
      stubEvent,
      session,
      constraints,
      1,
      true,
      problemUrl,
    )

    // 构建聊天 messages
    const messages = buildChatPrompt(ctx, userMessage, history)

    try {
      const result = await this.arkClient.chatText(messages, {
        target_level: 1,
        disable_thinking: true,
        temperature: 0.5,
        max_tokens: 2048,
      })
      return result.content
    } catch (err) {
      console.warn('[llm] chat failed:', err)
      return null
    }
  }

  /**
   * 请求针对当前题目的提示（用户点击"给点提示"时调用）。
   */
  async requestHint(params: {
    session: ProblemSession | null
    constraints: ProblemConstraints | null
    targetLevel?: CoachInterventionLevel
    problemUrl?: string | null
  }): Promise<string | null> {
    if (!this.isReady()) return null

    const { session, constraints, targetLevel = 1, problemUrl } = params

    const stubEvent = this.buildStubEvent(session)

    const ctx = this.contextGatherer.collect(
      stubEvent,
      session,
      constraints,
      targetLevel,
      true,
      problemUrl,
    )

    const messages = buildHintPrompt(ctx)

    try {
      const result = await this.arkClient.chat(messages, {
        target_level: targetLevel,
        disable_thinking: true,
        temperature: 0.3,
        max_tokens: 1024,
      })
      return result.response.message
    } catch (err) {
      console.warn('[llm] requestHint failed:', err)
      return null
    }
  }

  /**
   * 保存 API Key（加密存储）。
   */
  saveApiKey(apiKey: string): void {
    this.configStore.saveApiKey(apiKey)
    this.reloadConfig()
  }

  /**
   * 保存非敏感配置。
   */
  saveConfig(partial: Partial<Pick<LlmConfig, 'base_url' | 'model' | 'enabled'>>): void {
    this.configStore.saveConfig(partial)
    this.reloadConfig()
  }
}
