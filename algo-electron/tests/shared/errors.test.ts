import assert from 'node:assert/strict'
import { test } from 'vitest'
import { errorMessage, errorName } from '../../electron/shared/errors'

// 这两个函数背后挂着二十多个调用点（迁移的"列已存在"判断、同步失败回给用户的文案、
// 日志分类字段），所以两条分支都要钉住：`Error` 走属性、非 `Error` 走退化值。

test('errorMessage reads the message property, not the stringified error', () => {
  // String(new Error('boom')) 是 'Error: boom'——多出的前缀会直接出现在用户看到的
  // 同步失败提示里，也会让迁移的 includes('duplicate column name') 判断意外仍然成立。
  assert.strictEqual(errorMessage(new Error('boom')), 'boom')
})

test('errorMessage degrades non-Error throws to a string', () => {
  // 抛非 Error 的路径真实存在（网络层、原生模块），此前调用点直接读 `.message`：
  // 对 null 会抛 TypeError，把真正的失败原因替换成"读不到 undefined 的属性"。
  assert.strictEqual(errorMessage('plain string throw'), 'plain string throw')
  assert.strictEqual(errorMessage(null), 'null')
  assert.strictEqual(errorMessage(undefined), 'undefined')
  assert.strictEqual(errorMessage({ message: 'not an Error' }), '[object Object]')
})

test('errorName reads the constructor name and degrades to typeof', () => {
  assert.strictEqual(errorName(new TypeError('bad')), 'TypeError')
  assert.strictEqual(errorName('plain string throw'), 'string')
  assert.strictEqual(errorName(undefined), 'undefined')
})
