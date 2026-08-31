import { ipcMain } from 'electron'
import { IpcPayloadError, parseIpcArgs } from '../../electron/ipc/payloadSchema'

/**
 * `trustedSender` 的替身facade：只绕开 sender 校验，不绕开载荷校验。
 *
 * 有两个 register* 测试文件 `vi.mock` 掉整个 trustedSender，好在不构造合法 shell webContents
 * 的前提下单测注册模块的接线（sender 校验本身由 tests/security/trustedSender.test.ts 负责）。
 * 问题出在 `handle` 现在有两种形态：替身只认两参那种的话，schema 数组会被当成 listener 存进
 * handler 表，调用时报 `ipcHandlers.get(...) is not a function`——一个跟"载荷校验"毫无关系的
 * 错误信息，两个文件各踩一次。
 *
 * 所以这里按真实 facade 的契约转发：有 schema 就先 `parseIpcArgs`，失败时抛出与生产
 * **完全一致**的 `Rejected IPC sender (payload)`，好让各测试文件的断言验的是生产真会给出的
 * 行为，而不是替身自己编的一套。
 *
 * 抽成共享模块而不是各文件抄一份：每迁移一个 register* 文件就会多一处需要这段逻辑，
 * 抄的那些副本一旦和 `parseOrReject` 的真实行为漂移，测试就会开始为不存在的行为背书。
 */
export function createTrustedSenderDouble(): {
  handle: (channel: string, second: unknown, third?: IpcDoubleListener) => void
  on: (channel: string, listener: IpcDoubleListener) => void
} {
  return { handle, on: (channel, listener) => { ipcMain.on(channel, listener) } }
}

type IpcDoubleListener = (event: unknown, ...args: unknown[]) => unknown

function handle(channel: string, second: unknown, third?: IpcDoubleListener): void {
  if (!Array.isArray(second)) {
    ipcMain.handle(channel, second as IpcDoubleListener)
    return
  }
  const listener = third as IpcDoubleListener
  ipcMain.handle(channel, (event: unknown, ...args: unknown[]) => {
    let parsed: unknown[]
    try {
      parsed = parseIpcArgs(channel, second, args) as unknown[]
    } catch (error) {
      // 带上 cause：生产的 `parseOrReject` 会先把 path/expected 记进日志再抛，
      // 替身没有日志，那两个字段只能挂在 cause 上，否则测试失败时看不出是哪个字段不合形状。
      if (error instanceof IpcPayloadError) {
        throw new Error('Rejected IPC sender (payload)', { cause: error })
      }
      throw error
    }
    return listener(event, ...parsed)
  })
}
