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

/** 取错误的可读文本。非 `Error` 值退化为 `String(value)`，保证返回值一定是字符串。 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 取错误的类型名，用于日志分类而非展示给用户。非 `Error` 值退化为 `typeof`
 * ——`'string'`、`'undefined'` 这类结果本身就说明了抛出方没按约定抛 `Error`。
 */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error
}
