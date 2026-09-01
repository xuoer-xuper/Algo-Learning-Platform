/*
 * 主题偏好（B5.4，决策 D6）。
 *
 * 这里只有纯逻辑：偏好值的规范化、与 config.json 存量值的比对。electron 侧的
 * `nativeTheme.themeSource` 赋值放在 `themeSource.ts`，测试可注入替身。
 *
 * 为什么偏好只有三档、且刻意与 Electron 的 `ThemeSource` 同名：`themeSource`
 * 接受的就是 `'system' | 'light' | 'dark'`，同名可以省掉一层映射表——映射表是
 * 后续加档位时第一个会漏改的地方。渲染进程那边不消费本文件，它读的是
 * `prefers-color-scheme`（`themeSource` 会驱动它），见 src/theme.ts 的说明。
 */

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const

export type ThemePreference = typeof THEME_PREFERENCES[number]

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system'

export interface AppearanceConfig {
  theme: ThemePreference
}

export const DEFAULT_APPEARANCE_CONFIG: AppearanceConfig = {
  theme: DEFAULT_THEME_PREFERENCE,
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE
}

export function normalizeAppearanceConfig(value: unknown): AppearanceConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...DEFAULT_APPEARANCE_CONFIG }
  }
  return { theme: normalizeThemePreference((value as Record<string, unknown>).theme) }
}

/**
 * 存量值是否已经是规范形态。`loadConfig` 用它决定要不要回写一次 config.json，
 * 口径与 `isStoredSearchEngineConfig`/`isStoredZoomByOrigin` 一致：键数也要对得上，
 * 否则"多了一个陌生键"会被规范化悄悄丢掉而不落盘。
 */
export function isStoredAppearanceConfig(value: unknown, normalized: AppearanceConfig): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return Object.keys(candidate).length === 1 && candidate.theme === normalized.theme
}
