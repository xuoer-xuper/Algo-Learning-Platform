import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from './trustedSender'
import { int, oneOf, optional, text } from './payloadSchema'
import {
  deleteProblem,
  getProblemDetail,
  getRecentProblems,
} from '../db/repositories/problemRepository'

interface RegisterProblemIpcOptions {
  notifyProblemsUpdated?: (event: IpcMainInvokeEvent) => void
}

export function registerProblemIpc(options: RegisterProblemIpcOptions = {}): void {
  /*
   * limit 上限 1000，同 `registerStatsIpc`（本通道最大调用点是 `ProblemSidebar` 的 200）。
   * 平台 7 项 = `electron/adapters/sites/` 已登记的全部平台 ID，与 `ProblemSidebar` 下拉框
   * 一一对应；状态 3 项同下拉框。
   *
   * 三个参数都用 `optional` 而不是 `nullable`：下拉框的"全部"选项 value 是 `''`，
   * 但调用点 `loadRecentProblems(200, filterPlatform || undefined, ...)` 已经把空串折成
   * `undefined` 了，`''` 不会上线——真上线了也该拒，因为 repository 侧把
   * "没传"当成不过滤，空串会变成一次匹配不到任何行的等值比较。
   */
  ipcMain.handle('problem:listRecent', [
    optional(int({ min: 1, max: 1000 })),
    optional(oneOf(['acwing', 'codeforces', 'leetcode-cn', 'luogu', 'nowcoder', 'pta', 'vjudge'] as const)),
    optional(oneOf(['solved', 'attempted', 'visited'] as const)),
  ], (_event, limit, platform, status) => {
    return getRecentProblems(limit, platform, status)
  })

  ipcMain.handle('problem:getDetail', [text()], (_event, problemId) => {
    return getProblemDetail(problemId)
  })

  ipcMain.handle('problem:delete', [text()], (event, problemId) => {
    const ok = deleteProblem(problemId)
    if (ok) {
      options.notifyProblemsUpdated?.(event)
    }
    return ok
  })
}
