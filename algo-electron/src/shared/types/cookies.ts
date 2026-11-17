import { z } from 'zod'

/*
 * Cookie 概要域的跨进程类型（阶段 2 R2 从 electron-env.d.ts 收口）。
 * 收口前的权威定义：electron/db/repositories/cookieRecord/types.ts（该文件保留
 * CookieRecord 等库内类型）。红线（domain-rules §3）：Cookie 值只活在主进程
 * CookieVault，渲染层拿到的只有名称/计数/过期/标志位——这两个类型就是那条
 * 红线的类型面，任何字段回退成 value 都是被禁止的。
 */

export const cookieSafeDomainSummarySchema = z.object({
  site_id: z.string(),
  domain: z.string(),
  cookie_names: z.array(z.string()),
  cookie_count: z.number(),
  http_only_count: z.number(),
  secure_count: z.number(),
  earliest_expires_at: z.number().int().nullable(),
  last_seen_at: z.number().int().nullable(),
  /** 刻意是字面量 true：同步排除标记在类型上成立，不存在 false 的可能。 */
  sync_excluded: z.literal(true),
})

/** 单域 Cookie 概要（cookies:getDomainSummary）。 */
export type CookieSafeDomainSummary = z.infer<typeof cookieSafeDomainSummarySchema>

export const cookieSafeSiteSummarySchema = z.object({
  site_id: z.string(),
  has_cookies: z.boolean(),
  domains: z.array(cookieSafeDomainSummarySchema),
})

/** 站点级 Cookie 概要（cookies:getSiteSummary）。 */
export type CookieSafeSiteSummary = z.infer<typeof cookieSafeSiteSummarySchema>
