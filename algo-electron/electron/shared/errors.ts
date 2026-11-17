/**
 * 主进程侧的 `unknown` 错误取值工具。
 *
 * `catch` 拿到的值在 TypeScript 里是 `unknown`——它确实可以是任何东西：`throw 'oops'`、
 * `Promise.reject(undefined)`、原生模块抛出的普通对象。所以取 `.message` 前必须收窄，
 * 否则只能靠 `catch (e: any)` 绕过检查，而那会连同拼错的属性名一起放过。
 *
 * 渲染进程有一份同名的 `src/shared/errors.ts`。两边刻意不共用：`electron/` 与 `src/`
 * 分属两个编译目标，互相 import 会把主进程代码拖进渲染包（架构守卫也不允许）。
 */

/**
 * 把未知值转成字符串。
 *
 * 基本类型与原先的 `String(value)` 完全一致：字符串原样（`Object.prototype.toString.call('x')`
 * 会给 `[object String]`，所以必须单独分支），`null` / `undefined` 各给 `'null'` / `'undefined'`，
 * 数值/布尔/大整数/符号走标准转换（`'42'`、`'true'`）。
 *
 * 对象与函数用 `Object.prototype.toString.call`：对普通对象同样是 `[object Object]`
 * （`tests/shared/errors.test.ts` 钉住的口径），且不依赖可能被改写的实例 `toString`。
 * 代价是数组/日期/自定义 `toString` 的实例显示为类型标签而不是 `String()` 的拼接文本——
 * 错误文案里"这是什么类型的值"比"内容拼接"更有用，且没有测试钉住旧文本。
 */
function unknownToString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  // 正向枚举基本类型，String() 的入参因此是确定的基本类型联合——用"排除对象"的写法
  // 拿不到同样的窄化，@typescript-eslint/no-base-to-string 仍会报。
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value)
  }
  return Object.prototype.toString.call(value)
}

/** 取错误的可读文本。非 `Error` 值退化为字符串形式，保证返回值一定是字符串。 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : unknownToString(error)
}

/**
 * 把任意 reject 原因转成 `Error`，供 `Promise.reject(...)` 使用。
 *
 * `throw 'oops'`、`Promise.reject(undefined)` 这类非 `Error` 原因会让下游的
 * `error.name` / `error.stack` 全部落空，日志和上报都拿不到分类信息。这里保留原始
 * 描述，文本取自 `errorMessage`。
 */
export function toRejectionError(reason: unknown): Error {
  if (reason instanceof Error) return reason
  return new Error(errorMessage(reason))
}

/**
 * 取错误的类型名，用于日志分类而非展示给用户。非 `Error` 值退化为 `typeof`
 * ——`'string'`、`'undefined'` 这类结果本身就说明了抛出方没按约定抛 `Error`。
 */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error
}
