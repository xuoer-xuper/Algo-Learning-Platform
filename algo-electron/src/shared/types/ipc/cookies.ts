import { z } from 'zod'

/*
 * Cookie 域各 channel 的输入 schema。消费方：electron/ipc/registerCookieIpc.ts。
 *
 * 复用的界：
 *
 * - `siteId` 走标识符 200 的既有口径，与 sites 域里同一个 id 的界一致——
 *   这里收到的正是那边写进 `site_configs.id` 的值。
 * - `domain` 上限 253：FQDN 的长度上限，沿用 `userScriptMetadata.ts` 与
 *   `UserScriptHostPermissionBroker.ts` 里既有的手写校验，不另立标准。
 *
 * 两个 channel 的返回值都只含存在性与过期信息，不含 Cookie 值（`getSafeSummaryFor*`
 * 的名字就是这个约定）。这次改的只是"收什么"，返回什么一个字没动。
 */
const siteId = z.string().min(1).max(200)
const domain = z.string().min(1).max(253)

export const getSiteSummaryInput = [siteId] as const
/* R3 起单对象参数（原先是 `(siteId, domain)` 两个位置参数）。 */
export const getDomainSummaryInput = [z.strictObject({ siteId, domain })] as const
