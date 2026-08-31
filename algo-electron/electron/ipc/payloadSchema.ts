/**
 * 渠道载荷校验：每个 IPC channel 声明自己接受的参数形状。
 *
 * ## 为什么需要这一层
 *
 * `trustedSender.ts` 已有两道防线：`checkShellSender` 管"谁能发"（已登记的 webContents、
 * 主 frame、预期 origin），`checkIpcPayload` 管"结构上能不能收"（深度、体积、成环、原型污染）。
 * 缺的是第三道——**这个 channel 到底接受什么形状**。缺了它，`(_event, days?: number)`
 * 这样的声明只是一句自述：类型会被擦除，渲染进程发什么都能进来。
 *
 * 实测后果不是注入（SQL 全部走参数绑定），而是**看起来正常的错结果**：给
 * `stats:getVisitedTrend` 传 `'abc'`，`localDateDaysAgo` 算出 `'NaN-NaN-NaN'` 当日期绑进
 * SQL，查询匹配不到任何行，于是图表安静地变成空的——没有报错，没有日志。
 *
 * ## 不引入依赖
 *
 * 技术栈是固定的，不为这件事加 zod。所需的组合子只有十来个，且校验规则要能写进注释解释
 * 边界从哪来（比如 `days` 的上限为什么是 3650），这比复用一个通用库更贴合。
 *
 * ## 失败即拒绝
 *
 * 校验不通过时抛 `IpcPayloadError`，由 `trustedSender` 的注册包装转成 invoke 拒绝
 * 或 send 侧的一条 warn 日志。**不做静默兜底**：把 `'abc'` 悄悄当成默认值 30，等于把
 * 上面那个"安静的空图表"换成"安静的错图表"。
 */

/** 校验失败。`path` 指出是哪个参数的哪一层，方便定位到具体 channel 的具体字段。 */
export class IpcPayloadError extends Error {
  constructor(readonly path: string, readonly expected: string, readonly received: unknown) {
    super(`${path}: expected ${expected}, received ${describe(received)}`)
    this.name = 'IpcPayloadError'
  }
}

/**
 * 一个参数的校验器。`parse` 要么返回收窄后的值，要么抛 `IpcPayloadError`。
 *
 * 声明成接口而不是函数别名，是为了让 `optional` / `nullable` 这类包装器能读到被包装者的
 * `describe`（拼错误信息用），也让 schema 元组在类型层可推断出 handler 的参数类型。
 */
export interface IpcSchema<T> {
  readonly describe: string
  parse(value: unknown, path: string): T
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

function schema<T>(describeAs: string, parse: (value: unknown, path: string) => T): IpcSchema<T> {
  return { describe: describeAs, parse }
}

/**
 * 标识符类字符串：非空、有长度上限。
 *
 * 默认上限 200 沿用 `registerBrowserShellIpc` 里既有的手写校验（`tabId` 用的就是 200），
 * 不另立标准。ID、slug、平台名、文件名都归这一类。
 *
 * 默认拒绝空串：这些位置上空串没有一个有意义的解释，放进去只会变成一次查不到的查询。
 * 真要允许空串的（搜索框可以是空的）用 `freeText`。
 */
export function text(options: { max?: number, min?: number } = {}): IpcSchema<string> {
  const max = options.max ?? 200
  const min = options.min ?? 1
  return schema(`string(${min}..${max})`, (value, path) => {
    if (typeof value !== 'string') throw new IpcPayloadError(path, `string(${min}..${max})`, value)
    if (value.length < min || value.length > max) {
      throw new IpcPayloadError(path, `string(${min}..${max})`, value)
    }
    return value
  })
}

/** 自由文本：允许空串，只限长度。搜索词、笔记正文这类。 */
export function freeText(options: { max: number }): IpcSchema<string> {
  return text({ min: 0, max: options.max })
}

/**
 * 按正则约束的字符串。用于形状本身就有要求的参数，比如 `yyyy-mm-dd`。
 *
 * `label` 必填且用在错误信息里：直接打印正则源码对排查没帮助，而且有些正则本身就够长了。
 * 先过长度上限再匹配——避免把超长输入喂给正则引擎。
 */
export function pattern(regex: RegExp, label: string, options: { max?: number } = {}): IpcSchema<string> {
  const max = options.max ?? 200
  return schema(label, (value, path) => {
    if (typeof value !== 'string' || value.length > max || !regex.test(value)) {
      throw new IpcPayloadError(path, label, value)
    }
    return value
  })
}

/** `yyyy-mm-dd` 本地日期。项目里所有日期口径都是北京本地日，不是 UTC ISO 串。 */
export const localDate: IpcSchema<string> = pattern(/^\d{4}-\d{2}-\d{2}$/, 'yyyy-mm-dd', { max: 10 })

/**
 * 整数，必须给出上下界。
 *
 * 强制给界而不是设默认值：这些数字最终会进 `LIMIT ?` 或日期偏移计算，合理范围只有调用方
 * 知道。给不出界说明还没想清楚这个参数能有多大——那正是该想的时候。
 */
export function int(options: { min: number, max: number }): IpcSchema<number> {
  const { min, max } = options
  return schema(`integer(${min}..${max})`, (value, path) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new IpcPayloadError(path, `integer(${min}..${max})`, value)
    }
    return value
  })
}

/**
 * 有界小数。同样强制给界，理由同 `int`。
 *
 * 与 `int` 分开而不是加个 `allowFloat` 开关：绝大多数数值参数（`LIMIT`、天数、索引）
 * 收到 `1.5` 都是错的，默认就该拒。真正需要小数的只有缩放、透明度这类连续量，
 * 让它们显式说出来，比让所有 `int` 调用点都记得关掉开关更难写错。
 *
 * `Number.isFinite` 一并挡掉 `NaN` 与 `Infinity`——`NaN` 能穿过任何 `<` / `>` 比较，
 * 只用区间判断是拦不住它的。
 */
export function decimal(options: { min: number, max: number }): IpcSchema<number> {
  const { min, max } = options
  return schema(`decimal(${min}..${max})`, (value, path) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new IpcPayloadError(path, `decimal(${min}..${max})`, value)
    }
    return value
  })
}

/** 布尔值。不接受 0/1/'true' 这类等价物：渠道两端都是我们自己的代码，没有兼容负担。 */
export const bool: IpcSchema<boolean> = schema('boolean', (value, path) => {
  if (typeof value !== 'boolean') throw new IpcPayloadError(path, 'boolean', value)
  return value
})

/**
 * 可缺省参数。`undefined` 直接通过，其余交给内层。
 *
 * 只认 `undefined`，不认 `null`：`(_event, days?: number)` 这种声明对应的就是"没传"，
 * 而显式传 `null` 是另一件事（见 `nullable`）。两者混为一谈会让"字段被清空"和"字段没提供"
 * 在 handler 里分不开。
 */
export function optional<T>(inner: IpcSchema<T>): IpcSchema<T | undefined> {
  return schema(`${inner.describe} | undefined`, (value, path) => (
    value === undefined ? undefined : inner.parse(value, path)
  ))
}

/** 可为 null 的参数。语义是"显式的空值"，与 `optional` 的"没传"区分开。 */
export function nullable<T>(inner: IpcSchema<T>): IpcSchema<T | null> {
  return schema(`${inner.describe} | null`, (value, path) => (
    value === null ? null : inner.parse(value, path)
  ))
}

/** 字面量联合。用于 action、type 这类枚举参数。 */
export function oneOf<const T extends readonly (string | number | boolean)[]>(
  values: T,
): IpcSchema<T[number]> {
  const describeAs = values.map(value => JSON.stringify(value)).join(' | ')
  return schema(describeAs, (value, path) => {
    if (!values.includes(value as T[number])) throw new IpcPayloadError(path, describeAs, value)
    return value as T[number]
  })
}

/**
 * 数组，必须给出长度上限。元素逐个校验，路径带下标。
 *
 * `min` 可选、默认 0：多数数组参数（id 名单、历史记录）空着就是"没有"，是合法输入。
 * 但有一类不是——空数组会被下游当成"有这个字段、值为空"写进库，而不是"没传"。
 * `sites:create` 的 `domains` 就是这种：写进 `site_configs` 之后
 * `findMatchingEnabledSite` 用 `.some()` 判定，空数组恒为假，于是那行站点配置在 UI 里
 * 显示已启用、却永远匹配不上任何 URL。上限拦不住这个，得有下限。
 *
 * 不给 `min` 设默认 1：那会让"空名单"这种正常输入在五个现有调用点上一起变成拒绝。
 */
export function arrayOf<T>(inner: IpcSchema<T>, options: { min?: number, max: number }): IpcSchema<T[]> {
  const min = options.min ?? 0
  const describeAs = min > 0
    ? `${inner.describe}[] (${min}..${options.max})`
    : `${inner.describe}[] (max ${options.max})`
  return schema(describeAs, (value, path) => {
    if (!Array.isArray(value)) throw new IpcPayloadError(path, describeAs, value)
    if (value.length > options.max || value.length < min) throw new IpcPayloadError(path, describeAs, value)
    return value.map((entry, index) => inner.parse(entry, `${path}[${index}]`))
  })
}

type ObjectShape = Record<string, IpcSchema<unknown>>
type ParsedObject<S extends ObjectShape> = { [K in keyof S]: S[K] extends IpcSchema<infer T> ? T : never }

/**
 * 对象，逐字段校验。
 *
 * **默认拒绝多余字段**。这不是洁癖：渠道两端都是我们自己的代码，多余字段只可能来自
 * 拼错的字段名或被篡改的载荷，两种都该报出来而不是忽略。字段拼错时"忽略多余"会让
 * 必填字段同时报缺失，错误信息指向后者，排查方向就偏了。
 *
 * 返回值只包含声明过的字段，原型固定为 `Object.prototype`——`checkIpcPayload` 已挡掉
 * 原型污染，这里重建对象是第二层，也顺带让返回值不再持有渲染进程传来的那个对象引用。
 */
export function object<S extends ObjectShape>(
  shape: S,
  options: { extra?: 'reject' | 'ignore' } = {},
): IpcSchema<ParsedObject<S>> {
  const keys = Object.keys(shape)
  const describeAs = `{ ${keys.join(', ')} }`
  return schema(describeAs, (value, path) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new IpcPayloadError(path, describeAs, value)
    }
    const source = value as Record<string, unknown>
    if ((options.extra ?? 'reject') === 'reject') {
      for (const key of Object.keys(source)) {
        if (!(key in shape)) throw new IpcPayloadError(`${path}.${key}`, 'no such field', source[key])
      }
    }
    const parsed = {} as Record<string, unknown>
    for (const key of keys) {
      const fieldValue = shape[key].parse(source[key], `${path}.${key}`)
      // 缺省字段不写进结果，免得 `'k' in parsed` 为真而值是 undefined——
      // 下游用 `in` 判断存在性时那是两种不同的答案。
      if (fieldValue !== undefined) parsed[key] = fieldValue
    }
    return parsed as ParsedObject<S>
  })
}

/** 二进制载荷（图片粘贴等）。`checkIpcPayload` 已限 16 MiB，这里按 channel 再收紧。 */
export function binary(options: { maxBytes: number }): IpcSchema<ArrayBuffer | Uint8Array> {
  const describeAs = `binary(max ${options.maxBytes} bytes)`
  return schema(describeAs, (value, path) => {
    const byteLength = value instanceof ArrayBuffer
      ? value.byteLength
      : value instanceof Uint8Array ? value.byteLength : null
    if (byteLength === null || byteLength > options.maxBytes) {
      throw new IpcPayloadError(path, describeAs, value)
    }
    return value as ArrayBuffer | Uint8Array
  })
}

/**
 * 显式放行：这个参数由 handler 自己校验。
 *
 * 存在的意义是让"没校验"和"在别处校验"在代码里可区分。守卫
 * （`check-architecture.mjs` 的 IPC 规则）统计 `raw()` 的用量并要求只减不增——
 * 没有它，未迁移的 channel 和刻意自校验的 channel 长得一模一样，棘轮就无从下手。
 *
 * `reason` 必填，且必须写明校验发生在哪里。
 */
export function raw(reason: string): IpcSchema<unknown> {
  if (reason.trim().length === 0) throw new Error('raw() requires a reason')
  return schema(`unknown (${reason})`, value => value)
}

/** schema 元组 → handler 的参数类型。让校验与类型标注只有一个来源。 */
export type IpcSchemaTuple = readonly IpcSchema<unknown>[]
export type ParsedArgs<S extends IpcSchemaTuple> = {
  [K in keyof S]: S[K] extends IpcSchema<infer T> ? T : never
}

/**
 * 按 schema 元组校验一次调用的实参。
 *
 * 多传的参数一律拒绝：渲染进程侧的调用点是 `preload.ts` 里逐个写死的，参数个数对不上
 * 只可能是两边改动没同步——那正是要在这里拦住的情况，而不是默默忽略尾部实参。
 */
export function parseIpcArgs<S extends IpcSchemaTuple>(
  channel: string,
  schemas: S,
  args: readonly unknown[],
): ParsedArgs<S> {
  if (args.length > schemas.length) {
    throw new IpcPayloadError(`${channel}(${schemas.length}..)`, `at most ${schemas.length} arguments`, args.length)
  }
  return schemas.map((entry, index) => entry.parse(args[index], `${channel}#${index}`)) as ParsedArgs<S>
}
