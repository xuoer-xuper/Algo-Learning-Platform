import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  extractCredentialCapture,
  installCredentialCaptureListener,
} from '../../electron/credentials/captureForm'

function form(fields: Record<string, Partial<{ value: string; disabled: boolean; readOnly: boolean; type: string }>>) {
  return {
    querySelector(selector: string) {
      const field = fields[selector]
      return field ? { value: '', disabled: false, readOnly: false, type: 'text', ...field } : null
    },
  }
}

test('extracts only enabled visible username and password fields', () => {
  assert.deepStrictEqual(extractCredentialCapture(form({
    'input[name="username"]': { value: ' alice ' },
    'input[type="password"]': { value: 'secret' },
  })), { username: 'alice', password: 'secret' })
})

test('fails closed for missing, disabled, readonly, hidden or empty fields', () => {
  assert.strictEqual(extractCredentialCapture(form({
    'input[name="username"]': { value: 'alice', disabled: true },
    'input[type="password"]': { value: 'secret' },
  })), null)
  assert.strictEqual(extractCredentialCapture(form({
    'input[name="username"]': { value: 'alice' },
    'input[type="password"]': { value: 'secret', readOnly: true },
  })), null)
  assert.strictEqual(extractCredentialCapture(form({
    'input[name="username"]': { value: 'alice' },
    'input[type="password"]': { value: 'secret', type: 'hidden' },
  })), null)
  assert.strictEqual(extractCredentialCapture(form({
    'input[name="username"]': { value: ' ' },
    'input[type="password"]': { value: 'secret' },
  })), null)
})

/**
 * 只实现被测代码真正用到的两个方法，并按真实签名声明。
 *
 * 原先第一处替身写的是 `(...args: unknown[]) => void` 再 `as never` 塞进去。两个毛病：
 * 形参成了 `unknown`，`listeners.set(type, …)` 报"unknown 不能当 string 用"；而 `as never`
 * 把参数类型检查整个关掉，等于替身和被测函数之间没有任何契约。按真实签名声明后 `as never`
 * 也就不需要了。顺带去掉了 `EventEmitter` 基类——那两个方法当场就被覆盖，emitter 从没被用到。
 */
function createWindowLike() {
  const listeners = new Map<string, EventListener>()
  const windowLike: Pick<Window, 'addEventListener' | 'removeEventListener'> = {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') listeners.set(type, listener)
    },
    removeEventListener: (type: string) => { listeners.delete(type) },
  }
  // 生产签名第二个参数是 `_documentLike`，实现里没用到，但仍要求 querySelector。
  const documentLike: Pick<Document, 'querySelector'> = { querySelector: () => null }
  return { windowLike, documentLike, listeners }
}

/**
 * 派发一个 submit 事件。只造被测代码读的两个字段（target、preventDefault），
 * 因此 `as unknown as Event` 是必要的——收在这里，缺字段这件事只声明一次。
 */
function dispatchSubmit(listener: EventListener, target: unknown, preventDefault = (): void => {}): void {
  listener({ target, preventDefault } as unknown as Event)
}

test('submit listener observes forms without preventing normal submission', () => {
  const { windowLike, documentLike, listeners } = createWindowLike()
  const sent: unknown[] = []
  const dispose = installCredentialCaptureListener(windowLike, documentLike, (payload) => sent.push(payload))

  const submitListener = listeners.get('submit')
  assert.ok(submitListener, 'installing the capture listener must register a submit handler')
  let prevented = false
  dispatchSubmit(
    submitListener,
    { tagName: 'FORM', ...form({
      'input[name="email"]': { value: 'alice@example.com' },
      'input[name="password"]': { value: 'secret' },
    }) },
    () => { prevented = true },
  )

  assert.deepStrictEqual(sent, [{ username: 'alice@example.com', password: 'secret' }])
  assert.strictEqual(prevented, false)
  dispose()
  assert.strictEqual(listeners.has('submit'), false)
})

test('ignores non-form submit targets', () => {
  const { windowLike, documentLike, listeners } = createWindowLike()
  const sent: unknown[] = []
  installCredentialCaptureListener(windowLike, documentLike, (payload) => sent.push(payload))

  const submitListener = listeners.get('submit')
  assert.ok(submitListener, 'installing the capture listener must register a submit handler')
  dispatchSubmit(submitListener, { tagName: 'DIV' })
  assert.deepStrictEqual(sent, [])
})
