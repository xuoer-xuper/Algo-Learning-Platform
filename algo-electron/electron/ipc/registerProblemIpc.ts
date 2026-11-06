import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from './trustedSender'
import { deleteInput, getDetailInput, listRecentInput } from '../../src/shared/types/ipc/problem'
import {
  deleteProblem,
  getProblemDetail,
  getRecentProblems,
} from '../db/repositories/problemRepository'
import { IPC_CHANNELS } from '../../src/shared/constants/channels'

interface RegisterProblemIpcOptions {
  notifyProblemsUpdated?: (event: IpcMainInvokeEvent) => void
}

/*
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/problem.ts`；
 * limit 1000、平台/状态枚举、"optional 而非 nullable"的理由写在那里。
 */
export function registerProblemIpc(options: RegisterProblemIpcOptions = {}): void {
  ipcMain.handle(IPC_CHANNELS.PROBLEM.LIST_RECENT, listRecentInput, (_event, input) => {
    return getRecentProblems(input.limit, input.platform, input.status)
  })

  ipcMain.handle(IPC_CHANNELS.PROBLEM.GET_DETAIL, getDetailInput, (_event, problemId) => {
    return getProblemDetail(problemId)
  })

  ipcMain.handle(IPC_CHANNELS.PROBLEM.DELETE, deleteInput, (event, problemId) => {
    const ok = deleteProblem(problemId)
    if (ok) {
      options.notifyProblemsUpdated?.(event)
    }
    return ok
  })
}
