/**
 * 把未知 reject 原因转成可展示文案。
 *
 * 各面板原先各写一遍 `e instanceof Error ? e.message : String(e)`，对普通对象会
 * 得到 `[object Object]`。这里统一入口并补上对象分支，让主进程返回的结构化错误
 * 也能读；空 message 的 Error 退回 name，避免通知里出现空白。
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || '未知错误'
  if (typeof error === 'string') return error || '未知错误'
  if (error === null || error === undefined) return '未知错误'
  if (typeof error === 'object') {
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}
