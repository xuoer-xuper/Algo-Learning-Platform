import { app } from 'electron'
import fs from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import Store from 'electron-store'
import { z } from 'zod'
import { DEFAULT_SEARCH_ENGINE_CONFIG, normalizeSearchEngineConfig } from '../browser/omnibox'
import {
  getZoomFactorForUrl as resolveZoomFactorForUrl,
  normalizeZoomByOrigin,
  withZoomFactorForUrl,
  type ZoomByOrigin,
} from '../browser/zoomPreferences'
import { logger } from '../shared/logger'
import { DEFAULT_THEME_PREFERENCE, type AppearanceConfig } from './themePreference'
import { DEFAULT_COACH_PIN_MODE } from '../coach/petPinPolicy'
import { COACH_PIN_MODES, THEME_PREFERENCES } from '../../src/shared/constants/preferences'
import type { SearchEngineConfig, ThemePreference } from '../../src/shared/types/config'
import type { CoachConfig } from '../../src/shared/types/coach'

/*
 * Coach 桌宠配置的类型面（`CoachConfig`）已收口到 `src/shared/types/coach.ts`
 * （阶段 2 R2）：存储形状以本模块为准（含 disclaimer_dismissed），shared 侧的
 * schema 与渲染层消费同一份。`CoachLlmConfig` 是 config.json 的存储内部名，
 * 不跨进程，留在本文件。
 */

/** LLM 配置（存储在 config.json 的 coach.llm 字段；渲染层拿到的 coachConfig.llm 同形状）。 */
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
  search: SearchEngineConfig
  zoomByOrigin: ZoomByOrigin
  appearance: AppearanceConfig
}

const DEFAULT_COACH_CONFIG: CoachConfig = {
  enabled: true,
  sound: true,
  bubbleFrequency: 'medium',
  position: null,
  scale: 1,
  opacity: 1,
  pinMode: DEFAULT_COACH_PIN_MODE,
}

const DEFAULT_APPEARANCE_CONFIG: AppearanceConfig = { theme: DEFAULT_THEME_PREFERENCE }

const log = logger.scope('config')

/*
 * 持久化层：electron-store（A4，D13）。
 *
 * 为什么不把 JSON Schema 交给 electron-store 的 `schema` 选项（design §3 的原始草图）：
 * conf 16 在 `clearInvalidConfig: false` 下，文件无法解析时构造直接抛 SyntaxError、
 * 存量值与 schema 不符时每次读取抛 SchemaViolationError——"坏文件不清空"就退化成了
 * "坏文件让应用起不来"。旧读取器的语义是"垃圾值归一化、文件永不破坏"，所以校验
 * 完整交给下面的 zod（`.default()`/`.catch()`），electron-store 只做原子读写。
 * electron-store 因此保持裸存储：不传 schema、不传 defaults，`store.store` 的类型
 * 是"文件里实际有的东西"（Record），AppConfig 只在 zod parse 之后成立。
 *
 * serialize 保持 2 空格缩进：与旧 `writeConfig` 的字节格式一致，用户 diff / 手改
 * config.json 的体验不变。
 */
const CONFIG_FILE_NAME = 'config'
const HOME_SHORTCUT_MAX_LENGTH = 2_048

type RawConfig = Record<string, unknown>
type ConfigStore = Store<RawConfig>

let config: AppConfig | null = null
let configStore: ConfigStore | null = null

function getStore(): ConfigStore | null {
  if (configStore) return configStore
  try {
    configStore = new Store<RawConfig>({
      name: CONFIG_FILE_NAME,
      cwd: app.getPath('userData'),
      clearInvalidConfig: false,
      serialize: (value) => JSON.stringify(value, null, 2),
    })
  } catch (error) {
    // conf 在 config.json 无法解析（SyntaxError）时拒绝构造；clearInvalidConfig: false
    // 保证坏文件一个字节都不会被清掉。这里降级为内存默认值运行，并在下一次写入时
    // 重试构造（用户手动修复文件后无需重启即可恢复持久化）。
    log.warn('config.store-unreadable', { error: String(error) })
    return null
  }
  return configStore
}

/*
 * ---- zod schema：取代旧的 4 个 normalizer 与 3 个 isStored* 守卫 ----
 *
 * 各域的 `.catch()` 同时覆盖"键缺失"与"值非法"两种情况：missing 会 parse 失败落到
 * catch，等价于旧读取器的默认值回填；域内字段再各自 `.catch()`，保证局部垃圾值
 * 只损失那一个字段（旧读取器对 coach 是浅合并原样保留，对 search/appearance/zoom
 * 是整域重建——这里统一为"非法字段落默认、合法字段保留"，比旧的两种都更不丢数据）。
 */

/** 单条首页捷径：仅 http(s)、不带 userinfo、归一化后仍不超过长度上限；非法返回 null 由数组层丢弃。 */
function sanitizeHomeShortcutValue(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > HOME_SHORTCUT_MAX_LENGTH) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    const normalized = url.toString()
    return normalized.length > HOME_SHORTCUT_MAX_LENGTH ? null : normalized
  } catch {
    // Invalid legacy values are dropped during migration.
    return null
  }
}

const homeShortcutsSchema = z
  .array(z.unknown().transform(sanitizeHomeShortcutValue))
  .transform((values) => {
    const shortcuts: string[] = []
    for (const value of values) {
      if (value === null) continue
      if (!shortcuts.includes(value)) shortcuts.push(value)
    }
    return shortcuts
  })
  .catch([])

/*
 * 归一化逻辑的唯一来源仍在各域模块（omnibox 的搜索模板校验、zoomPreferences 的
 * origin/factor 收口、petPinPolicy 的模式枚举）——config 只是经 zod 把它们接进
 * 解析管线，不复制规则。加搜索引擎/缩放档位/置顶模式时仍然只改一处。
 */
const searchEngineConfigSchema = z
  .unknown()
  .transform(normalizeSearchEngineConfig)
  .catch({ ...DEFAULT_SEARCH_ENGINE_CONFIG })

const zoomByOriginSchema = z.unknown().transform(normalizeZoomByOrigin).catch({})

const appearanceConfigSchema = z
  .object({ theme: z.enum(THEME_PREFERENCES).catch(DEFAULT_THEME_PREFERENCE) })
  .catch({ ...DEFAULT_APPEARANCE_CONFIG })

const coachLlmConfigSchema = z
  .object({
    encrypted_api_key: z.string().optional(),
    base_url: z.string().optional(),
    model: z.string().optional(),
    enabled: z.boolean().optional(),
  })
  .optional()
  .catch(undefined)

const coachConfigSchema = z
  .looseObject({
    // coach 域用 looseObject：旧读取器对 coach 是浅合并，用户手加的未知键会原样
    // 保留并回写，这里保持同一口径（其余四域旧读取器本就是整域重建，允许收敛）。
    enabled: z.boolean().catch(DEFAULT_COACH_CONFIG.enabled),
    sound: z.boolean().catch(DEFAULT_COACH_CONFIG.sound),
    bubbleFrequency: z.enum(['low', 'medium', 'high']).catch(DEFAULT_COACH_CONFIG.bubbleFrequency),
    position: z
      .object({ x: z.number(), y: z.number() })
      .nullable()
      .catch(DEFAULT_COACH_CONFIG.position),
    scale: z.number().catch(DEFAULT_COACH_CONFIG.scale),
    opacity: z.number().catch(DEFAULT_COACH_CONFIG.opacity),
    // 注意：zod v4 里 transform 字段缺键会按 nonoptional 失败（不再隐式可选），
    // 所以每个字段要么自带 catch、要么输入可缺省——pinMode 用枚举 + catch，
    // 缺键/越界都落回默认档，与 petPinPolicy.normalizeCoachPinMode 同语义同来源。
    pinMode: z.enum(COACH_PIN_MODES).catch(DEFAULT_COACH_PIN_MODE),
    llm: coachLlmConfigSchema,
    disclaimer_dismissed: z.boolean().optional().catch(undefined),
  })
  .catch({ ...DEFAULT_COACH_CONFIG })

/**
 * config.json 的完整形状。parse 永不抛错（每个域都有 catch 兜底）——
 * 这是"坏文件不清空、应用总能启动"的另一半保证。
 */
export const AppConfigSchema = z.object({
  homeShortcuts: homeShortcutsSchema,
  coach: coachConfigSchema,
  search: searchEngineConfigSchema,
  zoomByOrigin: zoomByOriginSchema,
  appearance: appearanceConfigSchema,
})

/** 旧版 config.json 的 defaultHomeUrl 迁移：并入 homeShortcuts 后由 schema 消毒去重。 */
function migrateLegacyDefaultHomeUrl(raw: RawConfig): RawConfig {
  if (!Object.prototype.hasOwnProperty.call(raw, 'defaultHomeUrl')) return raw
  const { defaultHomeUrl: legacyHomeUrl, ...rest } = raw
  const shortcuts = Array.isArray(raw.homeShortcuts) ? raw.homeShortcuts : []
  return { ...rest, homeShortcuts: [...shortcuts, legacyHomeUrl] }
}

function readRawConfig(): { raw: RawConfig; isFreshInstall: boolean } {
  const store = getStore()
  if (!store) return { raw: {}, isFreshInstall: false }
  // 文件不存在与"存在但内容不合法"要走不同分支：前者只给内存默认值（旧读取器
  // 对首次启动从不写盘），后者要触发一次收敛写入。conf 的 ENOENT 已把缺文件
  // 读成空对象，这里用文件是否存在来区分。
  if (!fs.existsSync(store.path)) return { raw: {}, isFreshInstall: true }
  try {
    // conf 的顶层 store 对象是无原型的（防原型链读取）；迁移比较与 zod parse
    // 都按普通对象来，边界上先 JSON 往返归一（isDeepStrictEqual 会把原型差异
    // 当作不相等，导致已规范的文件每次启动都被无谓回写）。
    return { raw: JSON.parse(JSON.stringify(store.store)) as RawConfig, isFreshInstall: false }
  } catch (error) {
    // 构造之后文件被外部改坏：同样按"读不到"处理，文件保持原样。
    log.warn('config.store-unreadable', { error: String(error) })
    return { raw: {}, isFreshInstall: false }
  }
}

function writeConfig(value: AppConfig): void {
  const store = getStore()
  if (!store) {
    // 降级态下拒绝写入：盲目覆写会把用户手改坏的 config.json 冲掉（正是
    // clearInvalidConfig: false 要防的事）。把失败交给调用方可见。
    throw new Error('config store is unavailable; refusing to overwrite an unreadable config file')
  }
  // 展开成匿名对象：Store<RawConfig> 的 store 类型带索引签名，接口类型
  // （AppConfig）没有，结构相同时展开后才能赋值。
  store.store = { ...value }
}

export function loadConfig(): AppConfig {
  if (config) return config

  const { raw, isFreshInstall } = readRawConfig()
  const migrated = migrateLegacyDefaultHomeUrl(raw)
  const parsed = AppConfigSchema.parse(migrated)
  config = parsed

  // 旧文件（缺键、含 defaultHomeUrl、值不规范）收敛写入一次，与旧读取器的迁移
  // 回写同语义；已规范的文件与首次安装（无文件）都不动。写入失败保留内存值，
  // 之后的保存会再试。
  if (!isFreshInstall && !isDeepStrictEqual(migrated, parsed)) {
    try {
      writeConfig(parsed)
    } catch (error) {
      log.warn('config.migration-writeback-failed', { error: String(error) })
    }
  }
  return config
}

export function saveConfig(partial: Partial<AppConfig>): void {
  const nextConfig = AppConfigSchema.parse({ ...loadConfig(), ...partial })
  writeConfig(nextConfig)
  config = nextConfig
}

export function getHomeShortcuts(): string[] {
  return [...loadConfig().homeShortcuts]
}

export function getSearchConfig(): SearchEngineConfig {
  return { ...loadConfig().search }
}

export function saveSearchConfig(search: SearchEngineConfig): void {
  saveConfig({ search })
}

export function getThemePreference(): ThemePreference {
  return loadConfig().appearance.theme
}

export function saveThemePreference(theme: ThemePreference): ThemePreference {
  saveConfig({ appearance: { theme } })
  return getThemePreference()
}

export function getZoomPreferences(): ZoomByOrigin {
  return { ...loadConfig().zoomByOrigin }
}

export function getZoomFactorForUrl(url: string): number {
  return resolveZoomFactorForUrl(loadConfig().zoomByOrigin, url)
}

export function saveZoomFactorForUrl(url: string, factor: unknown): number | null {
  const current = loadConfig()
  const next = withZoomFactorForUrl(current.zoomByOrigin, url, factor)
  if (!next) return null
  saveConfig({ zoomByOrigin: next })
  return resolveZoomFactorForUrl(next, url)
}

/**
 * 读取 Coach 配置。CoachConfig 字段深合并默认值，保证向后兼容。
 */
export function loadCoachConfig(): CoachConfig {
  return loadConfig().coach
}

export function getCoachConfigForRenderer(): CoachConfig {
  const current = loadCoachConfig()
  if (!current.llm) return { ...current }
  const { encrypted_api_key: _encryptedApiKey, ...publicLlmConfig } = current.llm
  return { ...current, llm: publicLlmConfig }
}

/**
 * 持久化 Coach 配置（深合并 partial 到现有 coach 字段）。
 */
export function saveCoachConfig(partial: Partial<CoachConfig>): void {
  const current = loadConfig()
  saveConfig({ coach: { ...current.coach, ...partial } })
}
