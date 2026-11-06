import { z } from 'zod'
import { SEARCH_ENGINE_IDS, THEME_PREFERENCES } from '../../constants/preferences'

/*
 * 应用配置域各 channel 的输入 schema。消费方：electron/ipc/registerConfigIpc.ts。
 *
 * `config:setSearchEngine` 的形状，界都来自 `constants/preferences.ts`：
 *
 * - `engine` 用 `z.enum(SEARCH_ENGINE_IDS)`，直接复用那份 `as const` 数组，而不是在这里
 *   重抄一遍字面量——抄一遍就会在加搜索引擎时漏改一处。这也让原先那个
 *   `search as SearchEngineConfig` 的断言有了真凭据：`engine` 现在是运行时验过的。
 * - `customTemplate` 上限 2048，等于 `MAX_CUSTOM_SEARCH_TEMPLATE_LENGTH`。
 *   允许空串而不是 `min(1)`：渲染进程在非 custom 引擎下会把记住的模板原样回传，
 *   而那个输入框可以是空的（见 `SearchEnginePanel` 的 `validRememberedTemplate`）。
 * - `nullable` 而不是 optional：`SearchEngineConfig.customTemplate` 是
 *   `string | null` 且必填，渲染进程每次都显式发 `null` 表示"没有自定义模板"。
 *
 * 形状之外的校验（模板必须是 https、`{query}` 占位符恰好一个、不含 userinfo）留在
 * `normalizeSearchEngineConfig` 里——那是 URL 语义，不是载荷形状，`saveSearchConfig`
 * 依然会跑它。所以这里刻意只收紧到"形状对"，没有把那套规则搬过来。
 */
export const setSearchEngineInput = [
  z.strictObject({
    engine: z.enum(SEARCH_ENGINE_IDS),
    customTemplate: z.string().max(2048).nullable(),
  }),
] as const

/*
 * `z.enum(THEME_PREFERENCES)` 复用 constants/preferences.ts 那份 `as const`，
 * 与 `engine` 同一手法：加档位时只改一处。校验后 `set` 仍会跑一遍
 * `normalizeThemePreference`——那是给非 IPC 调用方（启动路径）兜底的，不是重复校验。
 */
export const setThemeInput = [z.enum(THEME_PREFERENCES)] as const
