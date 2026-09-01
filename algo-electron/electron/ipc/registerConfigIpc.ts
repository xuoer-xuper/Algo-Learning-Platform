import { ipcMain } from './trustedSender'
import { freeText, nullable, object, oneOf } from './payloadSchema'
import {
  getHomeShortcuts,
  getSearchConfig,
  saveSearchConfig,
} from '../app/config'
import { SEARCH_ENGINE_IDS } from '../browser/omnibox'
import { THEME_PREFERENCES, type ThemePreference } from '../app/themePreference'

/*
 * `config:setSearchEngine` 的形状，界都来自 `browser/omnibox.ts`：
 *
 * - `engine` 用 `oneOf(SEARCH_ENGINE_IDS)`，直接复用那份 `as const` 数组，而不是在这里
 *   重抄一遍字面量——抄一遍就会在加搜索引擎时漏改一处。这也让原先那个
 *   `search as SearchEngineConfig` 的断言有了真凭据：`engine` 现在是运行时验过的。
 * - `customTemplate` 上限 2048，等于 `MAX_CUSTOM_SEARCH_TEMPLATE_LENGTH`。
 *   用 `freeText`（允许空串）而不是 `text()`：渲染进程在非 custom 引擎下会把
 *   记住的模板原样回传，而那个输入框可以是空的（见 `SearchEnginePanel` 的
 *   `validRememberedTemplate`）。
 * - `nullable` 而不是 `optional`：`SearchEngineConfig.customTemplate` 是
 *   `string | null` 且必填，渲染进程每次都显式发 `null` 表示"没有自定义模板"。
 *
 * 形状之外的校验（模板必须是 https、`{query}` 占位符恰好一个、不含 userinfo）留在
 * `normalizeSearchEngineConfig` 里——那是 URL 语义，不是载荷形状，`saveSearchConfig`
 * 依然会跑它。所以这里刻意只收紧到"形状对"，没有把那套规则搬过来。
 */
const searchEngineShape = () => object({
  engine: oneOf(SEARCH_ENGINE_IDS),
  customTemplate: nullable(freeText({ max: 2048 })),
})

export interface ConfigIpcOptions {
  /**
   * 主题读写。走注入而不是直接 import `ThemeController`：控制器持有 `nativeTheme`，
   * 而本模块在 vitest 里是被直接 import 的（替身没有 nativeTheme）。
   */
  theme: {
    get: () => ThemePreference
    set: (value: unknown) => ThemePreference
  }
}

export function registerConfigIpc(options: ConfigIpcOptions): void {
  ipcMain.handle('config:getHomeShortcuts', () => {
    return getHomeShortcuts()
  })

  ipcMain.handle('config:getSearchEngine', () => {
    return getSearchConfig()
  })

  ipcMain.handle('config:setSearchEngine', [searchEngineShape()], (_event, search) => {
    saveSearchConfig(search)
    return getSearchConfig()
  })

  ipcMain.handle('config:getTheme', () => {
    return options.theme.get()
  })

  /*
   * `oneOf(THEME_PREFERENCES)` 复用那份 `as const`，与 `engine` 同一手法：
   * 加档位时只改一处。校验后 `set` 仍会跑一遍 `normalizeThemePreference`——
   * 那是给非 IPC 调用方（启动路径）兜底的，不是重复校验。
   */
  ipcMain.handle('config:setTheme', [oneOf(THEME_PREFERENCES)], (_event, theme) => {
    return options.theme.set(theme)
  })
}
