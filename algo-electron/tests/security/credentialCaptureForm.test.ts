import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
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

test('submit listener observes forms without preventing normal submission', () => {
  const target = new EventEmitter() as EventEmitter & {
    addEventListener?: (...args: unknown[]) => void
    removeEventListener?: (...args: unknown[]) => void
  }
  const listeners = new Map<string, (...args: any[]) => void>()
  target.addEventListener = (type, listener) => { listeners.set(type, listener as (...args: any[]) => void) }
  target.removeEventListener = (type) => { listeners.delete(type) }
  const sent: unknown[] = []
  const dispose = installCredentialCaptureListener(target as never, {} as never, (payload) => sent.push(payload))
  let prevented = false
  listeners.get('submit')?.({
    target: { tagName: 'FORM', ...form({
      'input[name="email"]': { value: 'alice@example.com' },
      'input[name="password"]': { value: 'secret' },
    }) },
    preventDefault: () => { prevented = true },
  })
  assert.deepStrictEqual(sent, [{ username: 'alice@example.com', password: 'secret' }])
  assert.strictEqual(prevented, false)
  dispose()
  assert.strictEqual(listeners.has('submit'), false)
})

test('ignores non-form submit targets', () => {
  const listeners = new Map<string, (...args: any[]) => void>()
  const windowLike = {
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener as (...args: any[]) => void),
    removeEventListener: () => undefined,
  }
  const sent: unknown[] = []
  installCredentialCaptureListener(windowLike as never, {} as never, (payload) => sent.push(payload))
  listeners.get('submit')?.({ target: { tagName: 'DIV' } })
  assert.deepStrictEqual(sent, [])
})
