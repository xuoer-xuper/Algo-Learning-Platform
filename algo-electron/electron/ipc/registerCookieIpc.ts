import { ipcMain } from './trustedSender'
import { text } from './payloadSchema'
import { CookieVault } from '../cookies/CookieVault'

/*
 * 两个复用的界：
 *
 * - `siteId` 走 `text()` 默认的 200，与 `registerSitesIpc` 里同一个 id 的界一致——
 *   这里收到的正是那边写进 `site_configs.id` 的值。
 * - `domain` 上限 253：FQDN 的长度上限，沿用 `userScriptMetadata.ts` 与
 *   `UserScriptHostPermissionBroker.ts` 里既有的手写校验，不另立标准。
 *
 * 两个 channel 的返回值都只含存在性与过期信息，不含 Cookie 值（`getSafeSummaryFor*`
 * 的名字就是这个约定）。这次改的只是"收什么"，返回什么一个字没动。
 */
const cookieSiteId = () => text()
const cookieDomain = () => text({ max: 253 })

export function registerCookieIpc(cookieVault = new CookieVault()): void {
  ipcMain.handle('cookies:getSiteSummary', [cookieSiteId()], (_event, siteId) => {
    return cookieVault.getSafeSummaryForSite(siteId)
  })

  ipcMain.handle('cookies:getDomainSummary', [cookieSiteId(), cookieDomain()], (_event, siteId, domain) => {
    return cookieVault.getSafeSummaryForDomain(siteId, domain)
  })
}
