import OpenAI from 'openai'
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions'
import type {
  ChatMessage,
  ArkChatOptions,
  LlmHintResponse,
  LlmConnectionTestResult,
  LlmConfig,
} from './LlmHintTypes'
import { errorMessage } from '../../shared/errors'

const CHAT_TIMEOUT_MS = 15000
const CONNECTION_TEST_TIMEOUT_MS = 10000

interface ArkThinkingOptions {
  type: 'disabled'
}

export type ArkChatCompletionRequest = ChatCompletionCreateParamsNonStreaming & {
  thinking?: ArkThinkingOptions
}

interface ArkChatCompletionResult {
  choices: Array<{
    message?: {
      content?: string | null
    }
  }>
  model?: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  } | null
}

export interface ArkClientFactoryOptions {
  apiKey: string
  baseURL: string
  timeout: number
  maxRetries: number
}

export interface ArkCompletionTransport {
  createCompletion(request: ArkChatCompletionRequest): Promise<ArkChatCompletionResult>
}

export type ArkClientFactory = (options: ArkClientFactoryOptions) => ArkCompletionTransport

const createOpenAiTransport: ArkClientFactory = (options) => {
  const client = new OpenAI(options)
  return {
    async createCompletion(request) {
      return client.chat.completions.create(request)
    },
  }
}

function toOpenAiMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    switch (message.role) {
      case 'system':
        return { role: 'system', content: message.content }
      case 'assistant':
        return { role: 'assistant', content: message.content }
      case 'user':
        return { role: 'user', content: message.content }
    }
  })
}

function buildArkRequest(params: {
  model: string
  messages: ChatMessage[]
  temperature: number
  maxTokens: number
  disableThinking: boolean
  structured: boolean
}): ArkChatCompletionRequest {
  const request: ArkChatCompletionRequest = {
    model: params.model,
    messages: toOpenAiMessages(params.messages),
    temperature: params.temperature,
    max_tokens: params.maxTokens,
    stream: false,
  }

  if (params.structured) {
    request.response_format = { type: 'json_object' }
  }
  if (params.disableThinking) {
    request.thinking = { type: 'disabled' }
  }

  return request
}

/**
 * 火山方舟 API 客户端（基于 OpenAI 兼容 SDK）。
 *
 * 火山方舟兼容 OpenAI Chat Completions API，只需修改 baseURL + apiKey + model。
 * 官方文档：https://www.volcengine.com/docs/82379/1330626
 *
 * 方舟特有的 thinking 参数在 buildArkRequest 中集中构造，避免在调用点使用宽泛类型断言。
 * 结构化提示使用 response_format: { type: 'json_object' } 降低解析失败概率。
 */
export class ArkClient {
  private client: ArkCompletionTransport | null = null
  private config: LlmConfig | null = null

  constructor(private readonly clientFactory: ArkClientFactory = createOpenAiTransport) {}

  /** 初始化客户端 */
  init(config: LlmConfig): void {
    this.config = config
    this.client = this.clientFactory({
      apiKey: config.api_key,
      baseURL: config.base_url,
      timeout: CHAT_TIMEOUT_MS,
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

  /** 调用 chat completions，返回结构化 JSON。 */
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
    const completion = await this.client.createCompletion(buildArkRequest({
      model: this.config.model,
      messages,
      temperature: options.temperature ?? 0.3,
      maxTokens: options.max_tokens ?? 1024,
      disableThinking: options.disable_thinking ?? true,
      structured: true,
    }))

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

  /** 调用 chat completions，返回纯文本（用于自由聊天场景）。 */
  async chatText(messages: ChatMessage[], options: ArkChatOptions): Promise<{
    content: string
    model: string
    tokens_input: number
    tokens_output: number
    latency_ms: number
  }> {
    if (!this.client || !this.config) {
      throw new Error('ArkClient not initialized')
    }

    const startTime = Date.now()
    const completion = await this.client.createCompletion(buildArkRequest({
      model: this.config.model,
      messages,
      temperature: options.temperature ?? 0.5,
      maxTokens: options.max_tokens ?? 2048,
      disableThinking: options.disable_thinking ?? true,
      structured: false,
    }))

    const latencyMs = Date.now() - startTime
    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('LLM returned empty content')
    }

    return {
      content,
      model: completion.model ?? this.config.model,
      tokens_input: completion.usage?.prompt_tokens ?? 0,
      tokens_output: completion.usage?.completion_tokens ?? 0,
      latency_ms: latencyMs,
    }
  }

  /** 测试连接：发送一个最小请求验证 API Key 和模型可用。 */
  async testConnection(config: LlmConfig): Promise<LlmConnectionTestResult> {
    const startTime = Date.now()
    try {
      const testClient = this.clientFactory({
        apiKey: config.api_key,
        baseURL: config.base_url,
        timeout: CONNECTION_TEST_TIMEOUT_MS,
        maxRetries: 0,
      })

      const completion = await testClient.createCompletion(buildArkRequest({
        model: config.model,
        messages: [{ role: 'user', content: '请回复 "ok"' }],
        temperature: 0,
        maxTokens: 16,
        disableThinking: true,
        structured: false,
      }))

      const content = completion.choices[0]?.message?.content
      if (!content) {
        throw new Error('LLM returned empty content')
      }

      return {
        success: true,
        message: `连接成功，模型回复: ${content.slice(0, 50)}`,
        latency_ms: Date.now() - startTime,
        model: completion.model ?? config.model,
      }
    } catch (err: unknown) {
      const message = errorMessage(err)
      return {
        success: false,
        message: `连接失败: ${message}`,
      }
    }
  }
}
