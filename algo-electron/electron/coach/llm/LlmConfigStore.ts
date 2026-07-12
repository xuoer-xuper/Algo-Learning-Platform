import { safeStorage } from 'electron'
import { loadCoachConfig, saveCoachConfig } from '../../app/config'
import { DEFAULT_LLM_CONFIG, type LlmConfig } from './LlmHintTypes'

/**
 * LLM 配置存储。
 *
 * API Key 使用 electron.safeStorage（基于 Windows DPAPI）加密后存储，
 * 渲染进程永不接触明文 Key。
 *
 * 非 Key 配置（base_url / model / enabled）走 config.json 明文存储，
 * 与 CoachConfig 共用配置文件。
 *
 * 评测发行版可通过 ARK_DEMO_KEY 环境变量注入演示 Key（构建时注入，不进源码）。
 */
export class LlmConfigStore {
  /**
   * 加载完整 LLM 配置。
   * 优先级：用户配置的 Key > 构建时注入的演示 Key > 空
   */
  load(): LlmConfig {
    const coachConfig = loadCoachConfig()
    const llmPart = coachConfig.llm ?? {}

    let apiKey = ''
    // 1. 优先读用户加密存储的 Key
    const encryptedKey = llmPart.encrypted_api_key
    if (encryptedKey && safeStorage.isEncryptionAvailable()) {
      try {
        const buf = Buffer.from(encryptedKey, 'base64')
        apiKey = safeStorage.decryptString(buf)
      } catch {
        apiKey = ''
      }
    }

    // 2. 用户未配置时降级到构建时注入的演示 Key
    if (!apiKey) {
      apiKey = process.env.ARK_DEMO_KEY ?? ''
    }

    return {
      api_key: apiKey,
      base_url: llmPart.base_url ?? DEFAULT_LLM_CONFIG.base_url,
      model: llmPart.model ?? DEFAULT_LLM_CONFIG.model,
      enabled: llmPart.enabled ?? false,
    }
  }

  /**
   * 保存 API Key（加密存储）。
   */
  saveApiKey(apiKey: string): void {
    let encrypted = ''
    if (apiKey && safeStorage.isEncryptionAvailable()) {
      const buf = safeStorage.encryptString(apiKey)
      encrypted = buf.toString('base64')
    }
    // 即使加密不可用也存明文（开发环境兜底，生产环境 safeStorage 必可用）
    if (!encrypted && apiKey) {
      encrypted = `plain:${apiKey}`
    }
    this.savePartial({ encrypted_api_key: encrypted })
  }

  /**
   * 保存非敏感配置（base_url / model / enabled）。
   */
  saveConfig(partial: Partial<Pick<LlmConfig, 'base_url' | 'model' | 'enabled'>>): void {
    this.savePartial(partial)
  }

  /**
   * 测试连接时获取脱敏的 Key 摘要（用于 UI 展示）。
   */
  getApiKeyMasked(): string {
    const config = this.load()
    const key = config.api_key
    if (!key) return ''
    if (key.length <= 8) return '****'
    return `${key.slice(0, 4)}****${key.slice(-4)}`
  }

  /**
   * 是否有可用的 Key（用户配置或演示 Key）。
   */
  hasApiKey(): boolean {
    return this.load().api_key.length > 0
  }

  // --- 内部 ---

  private savePartial(partial: Record<string, unknown>): void {
    const coachConfig = loadCoachConfig()
    const currentLlm = coachConfig.llm ?? {}
    const merged = { ...currentLlm, ...partial }
    saveCoachConfig({ llm: merged } as any)
  }
}
