/**
 * 渲染层与主进程都要消费的偏好枚举值（阶段 2 R2 常量下沉）。
 *
 * 之前这三份 `as const` 数组分别住在主进程模块里（app/themePreference.ts、
 * browser/omnibox.ts、coach/petPinPolicy.ts），而 `src/shared/types/ipc/config.ts`
 * 与 `coach.ts` 的输入 schema 要反向 import 它们——渲染层一旦经 @shared 消费
 * 这些 schema，就会把主进程模块打进渲染包。下沉到 shared 后依赖方向恢复为
 * "electron → src/shared" 单向（架构守卫 check-architecture.mjs 的
 * "src/shared stays process-neutral" 守卫钉住这一点）。
 *
 * electron 侧原模块保留各自的 normalize/默认值逻辑，从本文件 import 数组；
 * 对应的派生类型（ThemePreference / SearchEngineId / CoachPinMode）在
 * `src/shared/types/config.ts` 与 `coach.ts` 用 `(typeof 数组)[number]` 推导，
 * 不再另写一份字面量联合。
 */

/** 主题偏好三档。刻意与 Electron `nativeTheme.themeSource` 的取值同名（B5.4）。 */
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const

/** omnibox 搜索引擎白名单；`custom` 走用户自填模板（`{query}` 占位符）。 */
export const SEARCH_ENGINE_IDS = ['bing', 'google', 'baidu', 'custom'] as const

/** 桌宠置顶模式（B5.5 / D30）。三种模式的语义见 electron/coach/petPinPolicy.ts。 */
export const COACH_PIN_MODES = ['follow', 'always', 'dock'] as const
