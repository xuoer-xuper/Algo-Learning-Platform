import { ipcMain } from './trustedSender'
import { getDomainSummaryInput, getSiteSummaryInput } from '../../src/shared/types/ipc/cookies'
import { CookieVault } from '../cookies/CookieVault'
import { IPC_CHANNELS } from '../../src/shared/constants/channels'

/*
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/cookies.ts`；
 * siteId 200 与 domain 253（FQDN）的理由写在那里。
 *
 * 两个 channel 的返回值都只含存在性与过期信息，不含 Cookie 值（`getSafeSummaryFor*`
 * 的名字就是这个约定）。这次改的只是"收什么"，返回什么一个字没动。
 */
export function registerCookieIpc(cookieVault = new CookieVault()): void {
  ipcMain.handle(IPC_CHANNELS.COOKIES.GET_SITE_SUMMARY, getSiteSummaryInput, (_event, siteId) => {
    return cookieVault.getSafeSummaryForSite(siteId)
  })

  ipcMain.handle(
    IPC_CHANNELS.COOKIES.GET_DOMAIN_SUMMARY,
    getDomainSummaryInput,
    (_event, siteId, domain) => {
      return cookieVault.getSafeSummaryForDomain(siteId, domain)
    },
  )
}
