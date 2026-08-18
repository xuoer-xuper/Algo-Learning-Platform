import { ipcMain } from './trustedSender'
import { getHomeShortcuts } from '../app/config'

export function registerConfigIpc(): void {
  ipcMain.handle('config:getHomeShortcuts', () => {
    return getHomeShortcuts()
  })
}
