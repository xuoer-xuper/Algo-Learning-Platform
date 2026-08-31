import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import {
  IpcPayloadError,
  arrayOf,
  binary,
  bool,
  decimal,
  freeText,
  int,
  nullable,
  object,
  oneOf,
  optional,
  parseIpcArgs,
  raw,
  text,
} from '../../electron/ipc/payloadSchema'

/**
 * 渠道载荷校验的单元测试。
 *
 * 这一层的价值全在拒绝分支上，所以每个组合子都成对写：一条证明合法值原样通过，
 * 一条证明非法值抛 `IpcPayloadError`。只写正向的话，把 `parse` 改成 `value => value`
 * 也能全绿。
 */

/** 断言 parse 抛的是载荷错误，并返回它——便于继续检查 path/expected。 */
function rejects(run: () => unknown): IpcPayloadError {
  try {
    run()
  } catch (error) {
    assert.ok(error instanceof IpcPayloadError, `expected IpcPayloadError, got ${String(error)}`)
    return error
  }
  throw new assert.AssertionError({ message: 'expected the schema to reject this value' })
}

describe('text / freeText', () => {
  test('接受长度在界内的字符串', () => {
    assert.strictEqual(text().parse('problem-1', 'p'), 'problem-1')
    assert.strictEqual(freeText({ max: 10 }).parse('', 'p'), '', '搜索词允许空串')
  })

  test('拒绝空串、超长和非字符串', () => {
    assert.strictEqual(rejects(() => text().parse('', 'p')).expected, 'string(1..200)')
    rejects(() => text({ max: 3 }).parse('abcd', 'p'))
    rejects(() => text().parse(42, 'p'))
    rejects(() => text().parse(null, 'p'))
    rejects(() => text().parse(undefined, 'p'))
  })

  test('错误信息不含字符串内容本身', () => {
    // 载荷可能是笔记正文或搜索词，属于用户数据，不该进日志。
    const error = rejects(() => text({ max: 2 }).parse('secret-note-body', 'p'))
    assert.strictEqual(error.message.includes('secret'), false)
    assert.strictEqual(error.message.includes('length 16'), true, '只报长度')
  })
})

describe('int', () => {
  test('接受界内整数', () => {
    assert.strictEqual(int({ min: 1, max: 3650 }).parse(30, 'p'), 30)
    assert.strictEqual(int({ min: -5, max: 5 }).parse(-5, 'p'), -5)
  })

  test('拒绝小数、越界、NaN、Infinity 和数字字符串', () => {
    rejects(() => int({ min: 1, max: 10 }).parse(1.5, 'p'))
    rejects(() => int({ min: 1, max: 10 }).parse(0, 'p'))
    rejects(() => int({ min: 1, max: 10 }).parse(11, 'p'))
    rejects(() => int({ min: 1, max: 10 }).parse(Number.NaN, 'p'))
    rejects(() => int({ min: 1, max: 10 }).parse(Number.POSITIVE_INFINITY, 'p'))
    // 这条是本层存在的理由：`'30'` 过得去 `checkIpcPayload`，进 `localDateDaysAgo`
    // 也能算出正确日期，但 `'abc'` 会算出 'NaN-NaN-NaN' 绑进 SQL、查不到任何行。
    // 与其分辨哪些字符串恰好能用，不如一律拒绝。
    rejects(() => int({ min: 1, max: 10 }).parse('3', 'p'))
  })
})

describe('decimal', () => {
  test('接受界内小数与端点', () => {
    assert.strictEqual(decimal({ min: 0.5, max: 2 }).parse(1.35, 'p'), 1.35)
    assert.strictEqual(decimal({ min: 0.5, max: 2 }).parse(0.5, 'p'), 0.5)
    assert.strictEqual(decimal({ min: 0.5, max: 2 }).parse(2, 'p'), 2)
  })

  test('拒绝越界、NaN、Infinity 和数字字符串', () => {
    rejects(() => decimal({ min: 0.5, max: 2 }).parse(0.49, 'p'))
    rejects(() => decimal({ min: 0.5, max: 2 }).parse(2.01, 'p'))
    // NaN 能穿过任何 `<` / `>` 比较：只写区间判断的话它会被放过去，
    // 然后变成 CSS 里的 `transform: scale(NaN)`——桌宠直接不可见。
    rejects(() => decimal({ min: 0.5, max: 2 }).parse(Number.NaN, 'p'))
    rejects(() => decimal({ min: 0.5, max: 2 }).parse(Number.POSITIVE_INFINITY, 'p'))
    rejects(() => decimal({ min: 0.5, max: 2 }).parse('1.5', 'p'))
  })
})

describe('bool', () => {
  test('只接受真正的布尔值', () => {
    assert.strictEqual(bool.parse(true, 'p'), true)
    assert.strictEqual(bool.parse(false, 'p'), false)
    for (const value of [0, 1, 'true', 'false', null, undefined, {}]) {
      rejects(() => bool.parse(value, 'p'))
    }
  })
})

describe('optional / nullable', () => {
  test('optional 只放过 undefined，nullable 只放过 null', () => {
    assert.strictEqual(optional(int({ min: 1, max: 9 })).parse(undefined, 'p'), undefined)
    rejects(() => optional(int({ min: 1, max: 9 })).parse(null, 'p'))
    assert.strictEqual(nullable(text()).parse(null, 'p'), null)
    rejects(() => nullable(text()).parse(undefined, 'p'))
  })

  test('内层校验仍然生效', () => {
    rejects(() => optional(int({ min: 1, max: 9 })).parse(99, 'p'))
    rejects(() => nullable(text()).parse('', 'p'))
  })
})

describe('oneOf', () => {
  test('接受列出的字面量，拒绝其他', () => {
    const action = oneOf(['save', 'update', 'cancel'] as const)
    assert.strictEqual(action.parse('update', 'p'), 'update')
    rejects(() => action.parse('delete', 'p'))
    rejects(() => action.parse('Save', 'p'))
    rejects(() => action.parse(0, 'p'))
  })
})

describe('arrayOf', () => {
  test('逐元素校验，路径带下标', () => {
    assert.deepStrictEqual(arrayOf(text(), { max: 3 }).parse(['a', 'b'], 'p'), ['a', 'b'])
    const error = rejects(() => arrayOf(text(), { max: 3 }).parse(['a', 42], 'p'))
    assert.strictEqual(error.path, 'p[1]', '错误应指到具体下标')
  })

  test('拒绝超长数组和非数组', () => {
    rejects(() => arrayOf(text(), { max: 2 }).parse(['a', 'b', 'c'], 'p'))
    rejects(() => arrayOf(text(), { max: 2 }).parse('not-an-array', 'p'))
  })
})

describe('object', () => {
  const shape = object({ id: text(), count: optional(int({ min: 0, max: 10 })) })

  test('逐字段校验并只返回声明过的字段', () => {
    assert.deepStrictEqual(shape.parse({ id: 'x', count: 3 }, 'p'), { id: 'x', count: 3 })
    assert.deepStrictEqual(shape.parse({ id: 'x' }, 'p'), { id: 'x' }, '缺省字段不写进结果')
    assert.strictEqual(Object.hasOwn(shape.parse({ id: 'x' }, 'p'), 'count'), false)
  })

  test('默认拒绝多余字段', () => {
    const error = rejects(() => shape.parse({ id: 'x', bogus: 1 }, 'p'))
    assert.strictEqual(error.path, 'p.bogus')
    assert.deepStrictEqual(
      object({ id: text() }, { extra: 'ignore' }).parse({ id: 'x', bogus: 1 }, 'p'),
      { id: 'x' },
      'extra: ignore 时多余字段被丢掉而不是保留',
    )
  })

  test('拒绝数组、null 和非对象', () => {
    for (const value of [null, [], 'x', 42]) rejects(() => shape.parse(value, 'p'))
  })

  test('返回值不再持有渲染进程传来的那个对象', () => {
    // 校验后重建对象，原型固定为 Object.prototype。这样 handler 拿到的引用不会被
    // 发送侧继续改动，也不会带着 accessor / Symbol 键进入业务代码。
    const source = { id: 'x' }
    const parsed = shape.parse(source, 'p')
    assert.notStrictEqual(parsed, source)
    assert.strictEqual(Object.getPrototypeOf(parsed), Object.prototype)
  })

  test('嵌套对象的错误路径能一路指到底', () => {
    const nested = object({ outer: object({ inner: int({ min: 1, max: 2 }) }) })
    assert.strictEqual(rejects(() => nested.parse({ outer: { inner: 9 } }, 'p')).path, 'p.outer.inner')
  })
})

describe('binary', () => {
  test('接受界内的 ArrayBuffer 与 Uint8Array，拒绝超限和其他类型', () => {
    const buffer = new ArrayBuffer(8)
    assert.strictEqual(binary({ maxBytes: 8 }).parse(buffer, 'p'), buffer)
    const view = new Uint8Array([1, 2, 3])
    assert.strictEqual(binary({ maxBytes: 3 }).parse(view, 'p'), view)
    rejects(() => binary({ maxBytes: 2 }).parse(new ArrayBuffer(3), 'p'))
    rejects(() => binary({ maxBytes: 8 }).parse('not-binary', 'p'))
  })
})

describe('raw', () => {
  test('原样放行，但必须写明理由', () => {
    const passthrough = raw('handler 内按判别联合自行校验')
    const value = { anything: true }
    assert.strictEqual(passthrough.parse(value, 'p'), value)
    assert.throws(() => raw('  '), /requires a reason/)
  })
})

describe('parseIpcArgs', () => {
  const schemas = [text(), optional(int({ min: 1, max: 5 }))] as const

  test('按位校验并保持顺序', () => {
    assert.deepStrictEqual(parseIpcArgs('ch', schemas, ['id-1', 3]), ['id-1', 3])
    assert.deepStrictEqual(parseIpcArgs('ch', schemas, ['id-1']), ['id-1', undefined])
  })

  test('错误路径带 channel 与参数序号', () => {
    assert.strictEqual(rejects(() => parseIpcArgs('stats:x', schemas, ['id', 99])).path, 'stats:x#1')
  })

  test('实参多于 schema 时拒绝', () => {
    // preload 侧调用点是逐个写死的，个数对不上只可能是两边改动没同步。
    rejects(() => parseIpcArgs('ch', schemas, ['id', 1, 'extra']))
  })
})
