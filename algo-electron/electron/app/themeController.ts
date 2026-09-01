import {
  normalizeThemePreference,
  type ThemePreference,
} from './themePreference'

/*
 * 主题控制器（B5.4）。
 *
 * 只做一件事：把持久化的偏好推给 Chromium 的 `nativeTheme.themeSource`。
 *
 * 为什么走 `themeSource` 而不是自己往每个 renderer 推一个"当前是暗色"的布尔：
 * `themeSource` 一赋值，同进程组所有 renderer 的 `prefers-color-scheme` 立刻跟着变，
 * 于是 (1) 渲染进程在 React 挂载前就能同步读出结果，不会闪一帧浅色；(2) 桌宠窗口、
 * 未来的拆分窗口都自动跟随，不需要逐窗口广播；(3) `system` 档不用自己监听系统设置。
 * 代价是它也会影响远端 OJ 页面的 `prefers-color-scheme` —— 这与 Chrome 的行为一致
 * （浏览器主题会传递给网站），是预期效果而不是副作用。
 *
 * electron 只在这一层出现，且靠注入进来：`nativeTheme` 在 vitest 替身里不存在，
 * 注入让本文件可以在 node 环境下直接测（计划 §5 的覆盖率纪律要求）。
 */

export interface ThemeSourceTarget {
  themeSource: 'system' | 'light' | 'dark'
}

export interface ThemeControllerOptions {
  nativeTheme: ThemeSourceTarget
  readPreference: () => ThemePreference
  writePreference: (theme: ThemePreference) => ThemePreference
}

export class ThemeController {
  constructor(private readonly options: ThemeControllerOptions) {}

  /** 启动时调用一次：把 config.json 里的偏好落到 Chromium。 */
  apply(): ThemePreference {
    const theme = normalizeThemePreference(this.options.readPreference())
    this.options.nativeTheme.themeSource = theme
    return theme
  }

  get(): ThemePreference {
    return normalizeThemePreference(this.options.readPreference())
  }

  /**
   * 落盘后再赋值 `themeSource`：顺序反过来的话，写盘失败会留下"界面已经变了但
   * 重启又回去"的不一致。返回值取自持久化后的读取结果，而不是入参——调用方拿到的
   * 就是真正生效的值。
   */
  set(value: unknown): ThemePreference {
    const theme = this.options.writePreference(normalizeThemePreference(value))
    this.options.nativeTheme.themeSource = theme
    return theme
  }
}
