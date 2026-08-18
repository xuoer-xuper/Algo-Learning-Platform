import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

/**
 * Coach 桌宠配置。
 * - position: null 表示使用默认位置（屏幕右下角）
 * - scale: 0.5 ~ 2.0
 * - opacity: 0.3 ~ 1.0
 * - bubbleFrequency: low/medium/high，控制气泡触发频率（阶段 2 规则引擎消费）
 */
export interface CoachConfig {
  enabled: boolean
  sound: boolean
  bubbleFrequency: 'low' | 'medium' | 'high'
  position: { x: number; y: number } | null
  scale: number
  opacity: number
  /** LLM 配置（API Key 加密存储，其余明文） */
  llm?: CoachLlmConfig
  /** 是否永久关闭"仅供参考"免责声明 */
  disclaimer_dismissed?: boolean
}

/** LLM 配置（存储在 config.json 的 coach.llm 字段） */
export interface CoachLlmConfig {
  /** 加密后的 API Key（base64 编码的 safeStorage 加密数据） */
  encrypted_api_key?: string
  /** Base URL */
  base_url?: string
  /** 模型 ID */
  model?: string
  /** 是否启用 LLM 提示 */
  enabled?: boolean
}

export interface AppConfig {
  homeShortcuts: string[]
  coach: CoachConfig
}

interface LegacyAppConfig extends Partial<AppConfig> {
  defaultHomeUrl?: unknown
}

const DEFAULT_COACH_CONFIG: CoachConfig = {
  enabled: true,
  sound: true,
  bubbleFrequency: 'medium',
  position: null,
  scale: 1,
  opacity: 1,
}

const DEFAULT_CONFIG: AppConfig = {
  homeShortcuts: [],
  coach: DEFAULT_COACH_CONFIG,
}

let config: AppConfig | null = null
let configPath: string | null = null

function getConfigPath(): string {
  if (!configPath) {
    configPath = path.join(app.getPath('userData'), 'config.json')
  }
  return configPath
}

export function loadConfig(): AppConfig {
  if (config) return config

  const p = getConfigPath()
  if (fs.existsSync(p)) {
    let parsed: LegacyAppConfig
    try {
      const raw = fs.readFileSync(p, 'utf-8')
      parsed = JSON.parse(raw) as LegacyAppConfig
    } catch {
      config = createDefaultConfig()
      return config
    }

    // 兼容旧配置：coach 字段缺失或部分缺失时回填默认值（深合并）
    const coach: CoachConfig = { ...DEFAULT_COACH_CONFIG, ...(parsed.coach ?? {}) }
    const homeShortcuts = sanitizeHomeShortcuts([
      ...(Array.isArray(parsed.homeShortcuts) ? parsed.homeShortcuts : []),
      parsed.defaultHomeUrl,
    ])
    config = { homeShortcuts, coach }

    if (Object.prototype.hasOwnProperty.call(parsed, 'defaultHomeUrl')) {
      try {
        writeConfig(config)
      } catch {
        // Keep the successfully loaded migration in memory and retry on a later save.
      }
    }
  } else {
    config = createDefaultConfig()
  }
  return config
}

export function saveConfig(partial: Partial<AppConfig>): void {
  const current = loadConfig()
  config = { ...current, ...partial }
  writeConfig(config)
}

export function getHomeShortcuts(): string[] {
  return [...loadConfig().homeShortcuts]
}

function sanitizeHomeShortcuts(values: unknown[]): string[] {
  const shortcuts: string[] = []
  for (const value of values) {
    if (typeof value !== 'string' || value.length > 2_048) continue
    try {
      const url = new URL(value)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
      if (url.username || url.password) continue
      const normalized = url.toString()
      if (normalized.length > 2_048) continue
      if (!shortcuts.includes(normalized)) shortcuts.push(normalized)
    } catch {
      // Invalid legacy values are dropped during migration.
    }
  }
  return shortcuts
}

function writeConfig(value: AppConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(value, null, 2), 'utf-8')
}

function createDefaultConfig(): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    homeShortcuts: [...DEFAULT_CONFIG.homeShortcuts],
    coach: { ...DEFAULT_CONFIG.coach },
  }
}

/**
 * 读取 Coach 配置。CoachConfig 字段深合并默认值，保证向后兼容。
 */
export function loadCoachConfig(): CoachConfig {
  return loadConfig().coach
}

/**
 * 持久化 Coach 配置（深合并 partial 到现有 coach 字段）。
 */
export function saveCoachConfig(partial: Partial<CoachConfig>): void {
  const current = loadConfig()
  const merged: CoachConfig = { ...current.coach, ...partial }
  saveConfig({ coach: merged })
}
