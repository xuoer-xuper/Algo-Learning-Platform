import { z } from 'zod'

/*
 * 站点配置各 channel 的输入 schema。消费方：electron/ipc/registerSitesIpc.ts。
 *
 * 三个 channel（create / confirmImport）与单参数 channel 共用的字段界，写一次：
 *
 * - `siteId` / `siteName` 走标识符 200 的既有口径（沿用 `registerBrowserShellIpc` 里
 *   既有的手写上限，不另立标准）。
 * - `homeUrl` 上限 4096：项目里 URL 的既有口径就是这个数（`tabSessionSnapshot.ts` 的
 *   `MAX_TAB_URL_LENGTH`、`userScriptNavigation.ts` 的 `MAX_NAVIGATION_URL_LENGTH`
 *   都是 4096）。
 * - `domain` 上限 253：FQDN 的长度上限，与 `userScriptMetadata.ts`、
 *   `UserScriptHostPermissionBroker.ts` 里的既有校验一致。
 * - `urlPattern` / `selector` 上限 512：内置站点里最长的 pattern 约 50 字符、最长的
 *   选择器约 45 字符（见 `db/repositories/site/builtins.ts`），512 留足余量。
 * - 数组条数（domains 32 / patterns 64 / selectors 32）：内置站点的实际最大值分别是
 *   3 / 4 / 3，取一个量级的余量。给上限的意义不是猜用户会写多少，而是让
 *   `JSON.stringify` 进 DB 的那一列不会被一次调用撑到任意大。
 * - `cookiePolicy` / `adapter` 上限 64：两者都是短枚举串（`'session-only'`、
 *   `'vault-readable'`、平台名）。刻意不收成闭集枚举——类型声明是 `string`，
 *   收成闭集会让新增平台时在这里静默失败。
 */
const siteId = z.string().min(1).max(200)
const siteName = z.string().min(1).max(200)
const siteHomeUrl = z.string().min(1).max(4096)
const siteDomain = z.string().min(1).max(253)
const siteUrlPattern = z.string().min(1).max(512)
const siteSelector = z.string().min(1).max(512)
const siteCookiePolicy = z.string().min(1).max(64)
const siteAdapter = z.string().min(1).max(64)

/*
 * `domains` 要下限 1，不是形式主义：`createSiteFromDraft` 把输入框按逗号切开再
 * `.filter(Boolean)`，用户只填一个 `,` 就得到 `[]`——而面板那一侧只判了原始串非空
 * （`!domainsStr`），`","` 是真值，放行。落库之后 `findMatchingEnabledSite` 用
 * `.some()` 判定域名，空数组恒为假，于是这条站点在设置页显示"已启用"、实际永远匹配不上。
 *
 * update 侧同样按 1 起：`updateSite` 逐字段判 `!== undefined`，传 `domains: []`
 * 会把一条正常工作的站点的域名清空，症状和上面一样但更隐蔽（原本是好的）。
 */
const siteDomains = z.array(siteDomain).min(1).max(32)
const siteUrlPatterns = z.array(siteUrlPattern).max(64)
const siteSelectors = z.array(siteSelector).max(32)

/*
 * create 与 confirmImport 共用的字段图。可选性不是照抄 `SiteConfigData` 的 `?`，
 * 是照抄调用点：唯一调用点（`settingsApi.ts` 的 `createSiteFromDraft`）只发
 * `{ id, name, domains, homeUrl, enabled, problemUrlPatterns }`，其余字段一律 optional。
 */
const siteDraftFields = {
  id: siteId,
  name: siteName,
  domains: siteDomains,
  homeUrl: siteHomeUrl,
  enabled: z.boolean(),
  problemUrlPatterns: siteUrlPatterns.optional(),
  submitUrlPatterns: siteUrlPatterns.optional(),
  loginUrlPatterns: siteUrlPatterns.optional(),
  loginUsernameSelectors: siteSelectors.optional(),
  loginPasswordSelectors: siteSelectors.optional(),
  cookiePolicy: siteCookiePolicy.optional(),
  adapter: siteAdapter.optional(),
}

/*
 * `sites:create` 的形状是 `Omit<SiteConfigData, 'isBuiltin'>`。
 * `isBuiltin` 刻意不在形状里：strict 对象拒绝多余字段，于是渲染进程没法把自建
 * 站点标成内置站点——与 `createSite` 把 `is_builtin` 写死成 0 的 SQL 是同一个结论。
 */
const siteCreate = z.strictObject(siteDraftFields)

/*
 * `sites:confirmImport` 收的是整份站点数组，所以这里要的是**完整**形状而不是 Partial：
 * `confirmImportSites` 会把每一项当成一条完整记录交给 `createSite` / `updateSite`。
 *
 * `isBuiltin` 是必填的——它和 create/update 不一样：导入预览
 * （`previewImportSites`）产出的每一项都带着这个字段，UI 原样回传。但**形状校验拦不住
 * 越权**：`confirmImportSites` 不会重跑 `parseImportedSite`，而 `updateSite` 不看
 * `is_builtin`，所以一份把内置站点 id 同时写进 `sites` 与 `overwriteIds` 的载荷，
 * 能覆盖掉内置站点行。那个缺口在 `site/importExport.ts` 里堵，不是 schema 的活
 * （见该文件里 `is_builtin` 的守卫）。
 *
 * 50 条上限：导出文件是本应用自己产出的，内置站点 7 个，加上自建的量级远不到这个数。
 */
const siteImport = z.array(z.strictObject({ ...siteDraftFields, isBuiltin: z.boolean() })).max(50)

export const getByIdInput = [siteId] as const
export const createInput = [siteCreate] as const
/* R3 起 toggle / confirmImport 的 wire 形状是单对象参数（原先是两个位置参数）。 */
export const toggleInput = [z.strictObject({ id: siteId, enabled: z.boolean() })] as const
export const deleteInput = [siteId] as const
export const confirmImportInput = [
  z.strictObject({ sites: siteImport, overwriteIds: z.array(siteId).max(50) }),
] as const
