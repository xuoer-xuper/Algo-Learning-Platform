import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from './trustedSender'
import { deleteInput, getDetailInput, listRecentInput } from '../../src/shared/types/ipc/problem'
import {
  deleteProblem,
  getProblemDetail,
  getRecentProblems,
} from '../db/repositories/problemRepository'

interface RegisterProblemIpcOptions {
  notifyProblemsUpdated?: (event: IpcMainInvokeEvent) => void
}

/*
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/problem.ts`；
 * limit 1000、平台/状态枚举、"optional 而非 nullable"的理由写在那里。
 */
export function registerProblemIpc(options: RegisterProblemIpcOptions = {}): void {
  ipcMain.handle('problem:listRecent', listRecentInput, (_event, limit, platform, status) => {
    return getRecentProblems(limit, platform, status)
  })

  ipcMain.handle('problem:getDetail', getDetailInput, (_event, problemId) => {
    return getProblemDetail(problemId)
  })

  ipcMain.handle('problem:delete', deleteInput, (event, problemId) => {
    const ok = deleteProblem(problemId)
    if (ok) {
      options.notifyProblemsUpdated?.(event)
    }
    return ok
  })
}
