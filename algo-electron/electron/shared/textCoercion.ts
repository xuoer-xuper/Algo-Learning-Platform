/**
 * 主进程侧的 `unknown` 文案化工具。
 *
 * `String(value)` 对普通对象会落到 `Object.prototype.toString`，也就是 `[object Object]`
 * ——这类结果进了日志或错误文案就只剩噪音。这里把 `unknown` 的取值口径集中一处：
 * 字符串原样返回、数值/布尔/大整数用标准转换、对象走 `JSON.stringify`、取不到内容时
 * 退回空串。调用点因此不需要各自写 `String(value ?? '')`，也不必为非字符串分支
 * 关掉 `no-base-to-string`。
 */

/** 对象序列化失败（循环引用、null 原型上的自定义 `toJSON` 抛错）时的兜底：`[object Object]`。 */
const OPAQUE_OBJECT_FALLBACK = Object.prototype.toString.call({})

/**
 * 把 `unknown` 转成可读文本。
 *
 * - `null` / `undefined` → `''`（与原先 `value ?? ''` 的口径一致）
 * - 字符串 → 原样（调用方按需自行 trim）
 * - 数值 / 布尔 / 大整数 / 符号 → 标准字符串形式
 * - 函数 / 对象 → `JSON.stringify`；不可序列化时退回 `[object Object]`
 */
export function unknownToText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (typeof value === 'symbol') return value.description ?? 'Symbol()'
  try {
    return JSON.stringify(value) ?? OPAQUE_OBJECT_FALLBACK
  } catch {
    return OPAQUE_OBJECT_FALLBACK
  }
}
