import { existsSync, rmSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'

/**
 * 会话运行标记（Chrome "exit type" 的哨兵文件实现）。
 *
 * 约定：启动时创建标记，正常退出且会话落盘完成后删除。下次启动时标记
 * 仍在，说明上次是异常退出（崩溃/被杀/断电/强关）——只有这种情况才自动
 * 恢复上次会话；正常退出走干净启动，快照文件保留供"恢复上次会话"手动
 * 加载。对齐 Chrome 的会话恢复语义。
 *
 * 所有函数显式接收目录，保持可测试（不绑定 electron app）。
 */

export function sessionRunningMarkerPath(userDataDir: string): string {
  return path.join(userDataDir, 'session-running.marker')
}

export async function createSessionRunningMarker(userDataDir: string): Promise<void> {
  try {
    await fs.writeFile(sessionRunningMarkerPath(userDataDir), String(Date.now()), { encoding: 'utf-8' })
  } catch {
    // 标记写不进去时该次运行视为"未知"：宁可下次多一次不恢复，不误恢复。
  }
}

export async function wasLastSessionInterrupted(userDataDir: string): Promise<boolean> {
  try {
    await fs.access(sessionRunningMarkerPath(userDataDir))
    return true
  } catch {
    return false
  }
}

/**
 * 退出路径专用同步版：进程即将退出，异步 rm 可能赶不上落盘。
 * 清不掉的代价只是下次启动多恢复一次，可接受。
 */
export function clearSessionRunningMarkerSync(userDataDir: string): void {
  try {
    if (existsSync(sessionRunningMarkerPath(userDataDir))) {
      rmSync(sessionRunningMarkerPath(userDataDir), { force: true })
    }
  } catch {
    // 同上：失败静默
  }
}
