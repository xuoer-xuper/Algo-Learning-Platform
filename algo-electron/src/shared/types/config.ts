import { z } from 'zod'
import { SEARCH_ENGINE_IDS } from '../constants/preferences'
import type { THEME_PREFERENCES } from '../constants/preferences'

/*
 * 配置域的跨进程类型（阶段 2 R2 从 electron-env.d.ts 收口）。
 *
 * 两个标量联合直接从 constants/preferences.ts 的 `as const` 数组推导：
 * 类型与 zod 输入 schema（`src/shared/types/ipc/config.ts` 的
 * `z.enum(SEARCH_ENGINE_IDS)`）因此共享同一份取值来源，改枚举只动一处。
 */

/** 搜索引擎闭集。 */
export type SearchEngineId = (typeof SEARCH_ENGINE_IDS)[number]

/** 主题偏好闭集（system/light/dark，与 nativeTheme.themeSource 同名）。 */
export type ThemePreference = (typeof THEME_PREFERENCES)[number]

export const searchEngineConfigSchema = z.object({
  engine: z.enum(SEARCH_ENGINE_IDS),
  /** null = 未启用自定义模板；启用时必须是含 `{query}` 占位符的 https URL。 */
  customTemplate: z.string().nullable(),
})

/** omnibox 搜索配置（config:getSearchEngine / setSearchEngine 的载荷）。 */
export type SearchEngineConfig = z.infer<typeof searchEngineConfigSchema>
