import OpenAI from 'openai'
import type { ChatCompletion } from 'openai/resources/chat/completions'
import type {
  ChatMessage,
  ArkChatOptions,
  LlmHintResponse,
  LlmConnectionTestResult,
} from './LlmHintTypes'
import type { LlmConfig } from './LlmHintTypes'

/**
 * 火山方舟 API 客户端（基于 OpenAI 兼容 SDK）。
 *
 * 火山方舟兼容 OpenAI Chat Completions API，只需修改 baseURL + apiKey + model。
 * 官方文档：https://www.volcengine.com/docs/82379/1330626
 *
 * 特殊参数通过 extra_body 传递：
 * - thinking: { type: 'disabled' } 关闭深度思考（降低延迟）
 *
 * 使用 response_format: { type: 'json_object' } 强制 JSON 输出，避免解析失败。
 */
export class ArkClient {
  private client: OpenAI | null = null
  private config: LlmConfig | null = null

  /** 初始化客户端 */
  init(config: LlmConfig): void {
    this.config = config
    this.client = new OpenAI({
      apiKey: config.api_key,
      baseURL: config.base_url,
      timeout: 15000,
      maxRetries: 2,
    })
  }

  /** 是否已初始化 */
  isReady(): boolean {
    return this.client !== null && this.config !== null && this.config.api_key.length > 0
  }

  /** 获取当前配置的脱敏信息 */
  getConfigMasked(): { model: string; base_url: string; has_key: boolean } {
    return {
      model: this.config?.model ?? '',
      base_url: this.config?.base_url ?? '',
      has_key: (this.config?.api_key ?? '').length > 0,
    }
  }

  /**
   * 调用 chat completions，返回结构化 JSON。
   *
   * 失败时抛出异常，由调用方（LlmHintService）捕获并降级。
   */
  async chat(messages: ChatMessage[], options: ArkChatOptions): Promise<{
    response: LlmHintResponse
    model: string
    tokens_input: number
    tokens_output: number
    latency_ms: number
  }> {
    if (!this.client || !this.config) {
      throw new Error('ArkClient not initialized')
    }

    const startTime = Date.now()
    const temperature = options.temperature ?? 0.3
    const maxTokens = options.max_tokens ?? 1024

    const completion = (await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
    // 火山方舟特有参数 thinking 不在 OpenAI SDK 类型定义中，用 as any 透传
    } as any)) as ChatCompletion

    const latencyMs = Date.now() - startTime
    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('LLM returned empty content')
    }

    let response: LlmHintResponse
    try {
      response = JSON.parse(content)
    } catch {
      throw new Error(`LLM returned invalid JSON: ${content.slice(0, 200)}`)
    }

    // 基本校验
    if (!response.message || typeof response.message !== 'string') {
      throw new Error('LLM response missing message field')
    }
    if (!Array.isArray(response.related_tags)) {
      response.related_tags = []
    }
    if (typeof response.confidence !== 'number') {
      response.confidence = 0.5
    }
    if (typeof response.reveals_solution !== 'boolean') {
      response.reveals_solution = false
    }

    return {
      response,
      model: completion.model ?? this.config.model,
      tokens_input: completion.usage?.prompt_tokens ?? 0,
      tokens_output: completion.usage?.completion_tokens ?? 0,
      latency_ms: latencyMs,
    }
  }

  /**
   * 测试连接：发送一个最小请求验证 API Key 和模型可用。
   */
  async testConnection(config: LlmConfig): Promise<LlmConnectionTestResult> {
    const startTime = Date.now()
    try {
      const testClient = new OpenAI({
        apiKey: config.api_key,
        baseURL: config.base_url,
        timeout: 10000,
        maxRetries: 0,
      })

      const completion = (await testClient.chat.completions.create({
        model: config.model,
        messages: [
          { role: 'user', content: '请回复 "ok"' },
        ],
        max_tokens: 16,
        temperature: 0,
        stream: false,
        thinking: { type: 'disabled' },
      } as any)) as ChatCompletion

      const content = completion.choices[0]?.message?.content ?? ''
      const latencyMs = Date.now() - startTime

      return {
        success: true,
        message: `连接成功，模型回复: ${content.slice(0, 50)}`,
        latency_ms: latencyMs,
        model: completion.model ?? config.model,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        success: false,
        message: `连接失败: ${message}`,
      }
    }
  }
}
