/*
 * 渲染进程的主题落地（B5.4）。
 *
 * 这里刻意不读配置、也不发 IPC。主进程把偏好写进 `nativeTheme.themeSource` 之后，
 * 本窗口的 `prefers-color-scheme` 就是结论——同步可读，因此能在 React 挂载前定下
 * `data-theme`，不闪一帧浅色；`system` 档跟随系统由 Chromium 负责，我们不用自己
 * 监听系统设置；桌宠窗口共用同一份 renderer 代码，于是自动跟随。
 *
 * `data-theme` 只在暗色时写。`src/index.css` 的暗色块选择器是
 * `:root[data-theme="dark"]`，浅色是缺省值，写 `data-theme="light"` 只会多一个
 * 没有规则匹配的属性。
 */

export const DARK_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

export interface ThemeAttributeTarget {
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/** 支持 addEventListener 的最小 MediaQueryList 形状（jsdom 与 Chromium 都满足）。 */
export interface ColorSchemeQuery {
  matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

export function applyThemeAttribute(isDark: boolean, target: ThemeAttributeTarget): void {
  if (isDark) target.setAttribute('data-theme', 'dark')
  else target.removeAttribute('data-theme')
}

/**
 * 立刻同步一次，并订阅后续变化。返回退订函数。
 *
 * 主进程改 `themeSource` 时不需要额外广播：`themeSource` 变了，
 * 这个 media query 的 change 事件就会在每个窗口触发。
 */
export function installThemeAttribute(
  query: ColorSchemeQuery,
  target: ThemeAttributeTarget,
): () => void {
  const sync = () => { applyThemeAttribute(query.matches, target) }
  sync()
  query.addEventListener('change', sync)
  return () => { query.removeEventListener('change', sync) }
}
