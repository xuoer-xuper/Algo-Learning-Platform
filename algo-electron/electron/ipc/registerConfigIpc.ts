import { ipcMain } from './trustedSender'
import {
  getHomeShortcuts,
  getSearchConfig,
  saveSearchConfig,
} from '../app/config'
import type { SearchEngineConfig } from '../browser/omnibox'

export function registerConfigIpc(): void {
  ipcMain.handle('config:getHomeShortcuts', () => {
    return getHomeShortcuts()
  })

  ipcMain.handle('config:getSearchEngine', () => {
    return getSearchConfig()
  })

  ipcMain.handle('config:setSearchEngine', (_event, search: unknown) => {
    saveSearchConfig(search as SearchEngineConfig)
    return getSearchConfig()
  })
}
