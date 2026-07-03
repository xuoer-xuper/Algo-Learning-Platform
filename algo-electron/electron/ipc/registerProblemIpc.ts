import { ipcMain } from 'electron'
import {
  deleteProblem,
  getProblemDetail,
  getRecentProblems,
} from '../db/repositories/problemRepository'

interface RegisterProblemIpcOptions {
  notifyProblemsUpdated?: () => void
}

export function registerProblemIpc(options: RegisterProblemIpcOptions = {}): void {
  ipcMain.handle('problem:listRecent', (_event, limit?: number, platform?: string, status?: string) => {
    return getRecentProblems(limit, platform, status)
  })

  ipcMain.handle('problem:getDetail', (_event, problemId: string) => {
    return getProblemDetail(problemId)
  })

  ipcMain.handle('problem:delete', (_event, problemId: string) => {
    const ok = deleteProblem(problemId)
    if (ok) {
      options.notifyProblemsUpdated?.()
    }
    return ok
  })
}
