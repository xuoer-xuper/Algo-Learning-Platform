/*
 * 主题偏好（B5.4，决策 D6）。
 *
 * 这里只有纯逻辑：偏好值的判定与兜底。electron 侧的
 * `nativeTheme.themeSource` 赋值放在 `themeController.ts`，测试可注入替身。
 * config.json 存量值的结构规范化在 `config.ts` 的 appearanceConfigSchema（R3 起）。
 *
 * 为什么偏好只有三档、且刻意与 Electron 的 `ThemeSource` 同名：`themeSource`
 * 接受的就是 `'system' | 'light' | 'dark'`，同名可以省掉一层映射表——映射表是
 * 后续加档位时第一个会漏改的地方。渲染进程那边不消费本文件，它读的是
 * `prefers-color-scheme`（`themeSource` 会驱动它），见 src/theme.ts 的说明。
 */

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const

export type ThemePreference = (typeof THEME_PREFERENCES)[number]

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

/*
 * `normalizeAppearanceConfig` / `isStoredAppearanceConfig` 已随 electron-store 替换
 * （R3）删除：appearance 域的存量规范化收进了 `config.ts` 的
 * `appearanceConfigSchema`（zod `.catch()`），回写判定统一为"文件内容 ≠ 解析结果"。
 */
