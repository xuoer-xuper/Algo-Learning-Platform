import { z } from 'zod'

/*
 * stats 域各 channel 的输入 schema。消费方：electron/ipc/registerStatsIpc.ts。
 *
 * 两个复用的界，理由写在这里而不是每个 channel 重复一遍：
 *
 * - `days` 上限 3650（十年）。趋势查询要么进 `LIMIT ?`，要么经 `localDateDaysAgo` 变成
 *   SQL 里的日期下界。实测传 `'abc'` 时后者算出 `'NaN-NaN-NaN'`，SQL 匹配不到任何行——
 *   于是图表安静地变成空的，既不报错也不记日志。这是本层要拦住的那类失败。
 * - `limit` 上限 1000。当前最大调用点是 20（时间线），1000 留足余量，又不至于让 `LIMIT`
 *   退化成全表扫描。
 *
 * 都用 `.optional()`：这些参数在 repository 侧有默认值（`days = 30`），"没传"是合法输入。
 * 但 `null` 不是——`.optional()` 只放过 `undefined`。
 */
const days = z.number().int().min(1).max(3650).optional()
const rowLimit = z.number().int().min(1).max(1000).optional()

/** `yyyy-mm-dd` 本地日期。项目里所有日期口径都是北京本地日，不是 UTC ISO 串。 */
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** 标识符类字符串：非空、上限 200。ID、slug、平台名、文件名都归这一类（标识符 200 的既有口径）。 */
const identifier = z.string().min(1).max(200)

export const getDailyActiveInput = [days] as const
export const getVisitedTrendInput = [days] as const
export const getAcTrendInput = [days] as const
export const getSubmissionTrendInput = [days] as const
export const getProblemVisitStatsInput = [identifier] as const
export const getTimelineInput = [rowLimit] as const
export const getRevisitStatsInput = [rowLimit] as const
export const recomputeDailyInput = [localDate.optional()] as const
export const getWrongProblemsInput = [rowLimit] as const
/* R3 起单对象参数（原先是 `(days, limit)` 两个位置参数）。 */
export const getUnreviewedInput = [z.strictObject({ days, limit: rowLimit })] as const
