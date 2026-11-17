import { z } from 'zod'

/*
 * 提交同步域各 channel 的输入 schema。消费方：electron/ipc/registerSubmissionsIpc.ts。
 *
 * `submissions:syncCodeforces` 的 `handle` 走标识符 1..200 的既有口径。
 *
 * 下界 1 对得上唯一调用点：`CodeforcesSyncPanel` 的 `handleSyncCF` 先
 * `if (!cfHandle.trim())` 挡掉空串才发，所以空串到这里只可能是调用两端脱节。
 *
 * `syncService.syncCodeforces` 里那句 `if (!handle)` 刻意不删：它是主进程内部调用的
 * 兜底，而且返回的是一条给用户看的中文提示，不是校验失败。schema 拦的是"渲染进程
 * 发了非法载荷"，两者不是同一件事。
 *
 * 另两个 channel（syncVjudge / syncCurrentPage）是零参 handler，没有参数就没有
 * 形状可校验。
 */
export const syncCodeforcesInput = [z.string().min(1).max(200)] as const
