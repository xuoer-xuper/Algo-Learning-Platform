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
}

interface AppConfig {
  defaultHomeUrl: string
  coach: CoachConfig
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
  defaultHomeUrl: 'https://codeforces.com',
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
    try {
      const raw = fs.readFileSync(p, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<AppConfig>
      // 兼容旧配置：coach 字段缺失或部分缺失时回填默认值（深合并）
      const coach: CoachConfig = { ...DEFAULT_COACH_CONFIG, ...(parsed.coach ?? {}) }
      config = { ...DEFAULT_CONFIG, ...parsed, coach }
    } catch {
      config = { ...DEFAULT_CONFIG }
    }
  } else {
    config = { ...DEFAULT_CONFIG }
  }
  return config as AppConfig
}

export function saveConfig(partial: Partial<AppConfig>): void {
  const current = loadConfig()
  config = { ...current, ...partial }
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
}

export function getDefaultHomeUrl(): string {
  return loadConfig().defaultHomeUrl
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
