import type { CoachEvent, CoachInterventionLevel, ProblemSession } from '../types'
import type { ProblemConstraints } from '../problemFacts/ConstraintParser'
import { ArkClient } from './ArkClient'
import { LlmConfigStore } from './LlmConfigStore'
import { ContextGatherer } from './ContextGatherer'
import { buildHintPrompt } from './PromptBuilder'
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
 *
 * 熔断策略：
 *   连续 3 次 LLM 失败，5 分钟内直接返回 null，避免网络抖动时全程卡顿。
 */
const CACHE_TTL_MS = 5 * 60 * 1000      // 缓存 5 分钟
const CIRCUIT_BREAK_THRESHOLD = 3        // 连续失败 3 次熔断
const CIRCUIT_BREAK_COOLDOWN_MS = 5 * 60 * 1000  // 熔断冷却 5 分钟

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

  /** 熔断状态 */
  private consecutiveFailures = 0
  private circuitBreakUntil = 0

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
  }): Promise<LlmHintResult | null> {
    if (!this.isReady()) return null

    // 熔断检查
    if (this.isCircuitBroken()) return null

    const { event, session, constraints, targetLevel, userExplicitAsk } = params

    // 采集上下文
    const ctx = this.contextGatherer.collect(
      event,
      session,
      constraints,
      targetLevel,
      userExplicitAsk,
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

      // 重置熔断计数
      this.consecutiveFailures = 0

      return hintResult
    } catch (err) {
      console.warn('[llm] generateHint failed:', err)
      this.consecutiveFailures++
      if (this.consecutiveFailures >= CIRCUIT_BREAK_THRESHOLD) {
        this.circuitBreakUntil = Date.now() + CIRCUIT_BREAK_COOLDOWN_MS
        console.warn(
          `[llm] circuit breaker activated, cooldown ${CIRCUIT_BREAK_COOLDOWN_MS / 1000}s`,
        )
      }
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

  // --- 内部 ---

  private isCircuitBroken(): boolean {
    if (this.circuitBreakUntil === 0) return false
    if (Date.now() < this.circuitBreakUntil) return true
    // 冷却结束，重置
    this.circuitBreakUntil = 0
    this.consecutiveFailures = 0
    return false
  }
}
