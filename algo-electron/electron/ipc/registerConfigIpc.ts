import { ipcMain } from './trustedSender'
import { setSearchEngineInput, setThemeInput } from '../../src/shared/types/ipc/config'
import { getHomeShortcuts, getSearchConfig, saveSearchConfig } from '../app/config'
import type { ThemePreference } from '../app/themePreference'

/*
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/config.ts`；
 * `engine` / `theme` 两个枚举直接复用 omnibox / themePreference 的 `as const` 数组，
 * customTemplate 的 2048 与 nullable 语义的理由写在那里。
 */

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

  ipcMain.handle('config:setSearchEngine', setSearchEngineInput, (_event, search) => {
    saveSearchConfig(search)
    return getSearchConfig()
  })

  ipcMain.handle('config:getTheme', () => {
    return options.theme.get()
  })

  ipcMain.handle('config:setTheme', setThemeInput, (_event, theme) => {
    return options.theme.set(theme)
  })
}
