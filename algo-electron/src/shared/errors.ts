/**
 * 把未知 reject 原因转成可展示文案。
 *
 * 各面板原先各写一遍 `e instanceof Error ? e.message : String(e)`，对普通对象会
 * 得到 `[object Object]`。这里统一入口并补上对象分支，让主进程返回的结构化错误
 * 也能读；空 message 的 Error 退回 name，避免通知里出现空白。
 */

/**
 * 非字符串值的字符串化。
 *
 * 基本类型走 `String()`，与改之前一致（`String(42)` 是 `'42'`，若一律用
 * `Object.prototype.toString.call` 会退化成 `[object Number]`）；对象用
 * `Object.prototype.toString.call`——普通对象给出 `[object Object]`，该口径由
 * `tests/components/rendererErrors.test.ts` 钉住，且不依赖可被改写的实例 `toString`。
 * `null` / `undefined` 已由 `errorMessage` 的"未知错误"分支处理，不会走到这里。
 */
function unknownToString(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value)
  }
  return Object.prototype.toString.call(value)
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || '未知错误'
  if (typeof error === 'string') return error || '未知错误'
  if (error === null || error === undefined) return '未知错误'
  if (typeof error === 'object') {
    try {
      return JSON.stringify(error)
    } catch {
      return unknownToString(error)
    }
  }
  return unknownToString(error)
}
