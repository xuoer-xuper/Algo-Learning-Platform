import { ipcMain } from 'electron'
import { CookieVault } from '../cookies/CookieVault'

export function registerCookieIpc(cookieVault = new CookieVault()): void {
  ipcMain.handle('cookies:getSiteSummary', (_event, siteId: string) => {
    return cookieVault.getSafeSummaryForSite(siteId)
  })

  ipcMain.handle('cookies:getDomainSummary', (_event, siteId: string, domain: string) => {
    return cookieVault.getSafeSummaryForDomain(siteId, domain)
  })
}
