import { ipcMain } from 'electron'
import { getDefaultHomeUrl, saveConfig } from '../app/config'

export function registerConfigIpc(): void {
  ipcMain.handle('config:getDefaultHomeUrl', () => {
    return getDefaultHomeUrl()
  })

  ipcMain.on('config:setDefaultHomeUrl', (_event, url: string) => {
    saveConfig({ defaultHomeUrl: url })
  })
}
