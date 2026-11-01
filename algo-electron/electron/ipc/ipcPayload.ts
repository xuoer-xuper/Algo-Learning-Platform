import type { z } from 'zod'

/**
 * 按位置解析 IPC 实参：schema 元组 + 实参数组 → 收窄后的实参数组。
 *
 * ## 这一层为什么还在
 *
 * schema 本体已迁到 `src/shared/types/ipc/`（zod，按域一个文件）。留在 electron/ 侧的
 * 是与 Electron 无关的那半截：按调用位置逐个 `safeParse`、把失败变成
 * `IpcPayloadError`、拒绝多传的实参。`trustedSender.ts` 用它实现注册包装，
 * `tests/ipc/trustedSenderDouble.ts` 也 import 同一份——替身转发真实解析逻辑，
 * 测试验到的才是生产真会给出的行为。
 *
 * ## 失败即拒绝
 *
 * 校验不通过时抛 `IpcPayloadError`，由 `trustedSender` 的注册包装转成 invoke 拒绝
 * 或 send 侧的一条 warn 日志。**不做静默兜底**：把 `'abc'` 悄悄当成默认值 30，等于把
 * "安静的空图表"换成"安静的错图表"。
 */

/** 校验失败。`path` 指出是哪个参数的哪一层，方便定位到具体 channel 的具体字段。 */
export class IpcPayloadError extends Error {
  constructor(
    readonly path: string,
    readonly expected: string,
    readonly received: unknown,
  ) {
    super(`${path}: expected ${expected}, received ${describe(received)}`)
    this.name = 'IpcPayloadError'
  }
}

/** 错误信息里怎么称呼实际收到的值。不打印字符串内容本身——载荷可能含用户数据。 */
function describe(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return `array(length ${value.length})`
  if (typeof value === 'string') return `string(length ${value.length})`
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : String(value)
  if (typeof value === 'object') return 'object'
  return typeof value
}

/** 一个 channel 的输入 schema 元组，元素是 `src/shared/types/ipc/` 里的 zod schema。 */
export type ZodSchemaTuple = readonly z.ZodTypeAny[]

/** schema 元组 → handler 的参数类型。让校验与类型标注只有一个来源。 */
export type ZodParsedArgs<S extends ZodSchemaTuple> = {
  [K in keyof S]: z.infer<S[K]>
}

/**
 * 按 schema 元组校验一次调用的实参。
 *
 * 多传的参数一律拒绝：渲染进程侧的调用点是 `preload.ts` 里逐个写死的，参数个数对不上
 * 只可能是两边改动没同步——那正是要在这里拦住的情况，而不是默默忽略尾部实参。
 *
 * 错误路径写成 `arg<序号>.<字段>`：序号定位到实参位置，字段部分来自 zod issue 的
 * path（多余字段在 zod 那边 path 为空，字段名在 message 里，如 `Unrecognized key: "x"`）。
 */
export function parseIpcArgs(
  channel: string,
  schemas: ZodSchemaTuple,
  args: readonly unknown[],
): unknown[] {
  if (args.length > schemas.length) {
    throw new IpcPayloadError(
      `${channel}(${schemas.length}..)`,
      `at most ${schemas.length} arguments`,
      args.length,
    )
  }
  return schemas.map((schema, index) => {
    const result = schema.safeParse(args[index])
    if (!result.success) {
      const issue = result.error.issues[0]
      const path = ['arg' + String(index), ...issue.path].join('.')
      throw new IpcPayloadError(path, issue.message, args[index])
    }
    return result.data
  })
}
