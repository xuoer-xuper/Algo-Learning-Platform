import { z } from 'zod'

/*
 * 竞赛评分域各 channel 的输入 schema。消费方：electron/ipc/registerRatingIpc.ts。
 *
 * 复用的界，理由写在这里而不是每个 channel 重复一遍：
 *
 * - `platform` 只放行 `'codeforces'`。渲染进程侧 `settingsApi.ts` 里这三个 channel 的
 *   platform 实参全是写死的字面量 `'codeforces'`，且本文件唯一的同步实现就是 CF
 *   （`rating:syncCodeforces` 内部也写死了 `'codeforces'`）。放宽成任意字符串只会让
 *   拼错的平台名变成一次查不到的查询——`platform_accounts.platform` 是裸 TEXT，
 *   没有 CHECK 约束，收窄只能发生在这里。接入第二个平台时这里要跟着加一项。
 * - `handle` 上限 64。CF 用户名实际是 3..24 位，取 64 是留余量而不是照抄那个上限——
 *   本层不想替 CF 判定"什么是合法用户名"，那由 CF API 的响应回答。要拦的是渲染进程那个
 *   自由文本框（`CodeforcesSyncPanel` / `CredentialsPage` 都只做了 `.trim()` 和非空判断，
 *   没有任何长度上限）把一整段文本当 handle 送进来，最后拼进 CF API 的 URL。
 */
const ratingPlatform = z.enum(['codeforces'])
const cfHandle = z.string().min(1).max(64)

/** 标识符类字符串：非空、上限 200（accountId，标识符 200 的既有口径）。 */
const identifier = z.string().min(1).max(200)

/* R3 起 bindHandle / getAccount 的 wire 形状是单对象参数（原先是两个位置参数）。 */
export const bindHandleInput = [
  z.strictObject({ platform: ratingPlatform, handle: cfHandle }),
] as const
export const getAccountInput = [
  z.strictObject({ platform: ratingPlatform, handle: cfHandle }),
] as const
export const getAccountsInput = [ratingPlatform] as const
export const syncCodeforcesInput = [cfHandle] as const
export const getHistoryInput = [identifier] as const
export const getContestResultsInput = [identifier] as const
