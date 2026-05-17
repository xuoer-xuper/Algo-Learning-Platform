import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

interface AppConfig {
  defaultHomeUrl: string
}

const DEFAULT_CONFIG: AppConfig = {
  defaultHomeUrl: 'https://codeforces.com',
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
      config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
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
