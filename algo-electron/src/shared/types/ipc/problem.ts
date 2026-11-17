import { z } from 'zod'

/*
 * 题目域各 channel 的输入 schema。消费方：electron/ipc/registerProblemIpc.ts。
 *
 * limit 上限 1000，同 stats 域（本通道最大调用点是 `ProblemSidebar` 的 200）。
 * 平台 7 项 = `electron/adapters/sites/` 已登记的全部平台 ID，与 `ProblemSidebar` 下拉框
 * 一一对应；状态 3 项同下拉框。
 *
 * 三个参数都用 optional 而不是 nullable：下拉框的"全部"选项 value 是 `''`，
 * 但调用点 `loadRecentProblems(200, filterPlatform || undefined, ...)` 已经把空串折成
 * `undefined` 了，`''` 不会上线——真上线了也该拒，因为 repository 侧把
 * "没传"当成不过滤，空串会变成一次匹配不到任何行的等值比较。
 */

/** 标识符类字符串：非空、上限 200（problemId，标识符 200 的既有口径）。 */
const identifier = z.string().min(1).max(200)

/*
 * R3 起 `problem:listRecent` 的 wire 形状是单对象参数（原先是 `(limit, platform, status)`
 * 三个位置参数）。字段界与原先的元组逐位一致，只是搬进了对象；strictObject 拒绝多余
 * 字段，与 getDetail/delete 单参数通道那两列的"多传即拒"口径相同。
 */
export const listRecentInput = [
  z.strictObject({
    limit: z.number().int().min(1).max(1000).optional(),
    platform: z
      .enum(['acwing', 'codeforces', 'leetcode-cn', 'luogu', 'nowcoder', 'pta', 'vjudge'])
      .optional(),
    status: z.enum(['solved', 'attempted', 'visited']).optional(),
  }),
] as const

export const getDetailInput = [identifier] as const
export const deleteInput = [identifier] as const
