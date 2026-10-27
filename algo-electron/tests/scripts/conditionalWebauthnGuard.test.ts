// @vitest-environment jsdom
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { installConditionalWebauthnGuard } from '../../electron/scripts/conditionalWebauthnGuard'

/**
 * 守卫运行在页面主世界；这里在 jsdom 里直接驱动它。jsdom 没有
 * navigator.credentials，先装可观测替身；可信手势（isTrusted）造不出来，
 * 沿用 impl 槽位改写的办法。
 */
function install(): { calls: unknown[] } {
  delete (globalThis as typeof globalThis & Record<string, unknown>).__algoConditionalWebauthnGuard
  const calls: unknown[] = []
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      get: (options: unknown) => {
        calls.push(options)
        return Promise.resolve('native-result')
      },
    },
  })
  installConditionalWebauthnGuard()
  return { calls }
}

function dispatchTrustedPointerDown(): void {
  const event = new Event('pointerdown')
  const [implSymbol] = Object.getOwnPropertySymbols(event)
  const impl = (event as never as Record<symbol, { isTrusted: boolean }>)[implSymbol]
  Object.defineProperty(impl, 'isTrusted', { configurable: true, get: () => true, set: () => {} })
  window.dispatchEvent(event)
}

test('conditional webauthn without user gesture stays pending without settling', async () => {
  const { calls } = install()
  const pending = navigator.credentials.get({
    mediation: 'conditional',
    publicKey: { challenge: new Uint8Array(4) } as PublicKeyCredentialRequestOptions,
  })
  const settled = await Promise.race([
    pending.then(
      () => 'settled',
      () => 'settled',
    ),
    new Promise((resolve) => setTimeout(() => resolve('pending'), 20)),
  ])
  assert.strictEqual(
    settled,
    'pending',
    'silence means never settling — any rejection gets toasted by the page',
  )
  assert.strictEqual(calls.length, 0, 'native get must not be invoked')
})

test('conditional webauthn rejects with AbortError when the page aborts its own signal', async () => {
  const { calls } = install()
  const controller = new AbortController()
  const request = navigator.credentials.get({
    mediation: 'conditional',
    signal: controller.signal,
    publicKey: { challenge: new Uint8Array(4) } as PublicKeyCredentialRequestOptions,
  })
  controller.abort()
  await assert.rejects(request, (error: DOMException) => error.name === 'AbortError')
  assert.strictEqual(calls.length, 0)
})

test('explicit (non-conditional) webauthn passes through to the platform', async () => {
  const { calls } = install()
  const result = await navigator.credentials.get({
    publicKey: { challenge: new Uint8Array(4) } as PublicKeyCredentialRequestOptions,
  })
  assert.strictEqual(result, 'native-result')
  assert.strictEqual(calls.length, 1)
})

test('conditional webauthn within a trusted gesture window is allowed', async () => {
  const { calls } = install()
  dispatchTrustedPointerDown()
  const result = await navigator.credentials.get({
    mediation: 'conditional',
    publicKey: { challenge: new Uint8Array(4) } as PublicKeyCredentialRequestOptions,
  })
  assert.strictEqual(result, 'native-result')
  assert.strictEqual(calls.length, 1)
})

test('install is idempotent per page', () => {
  const { calls } = install()
  installConditionalWebauthnGuard()
  assert.strictEqual(
    navigator.credentials.get({
      publicKey: { challenge: new Uint8Array(4) } as PublicKeyCredentialRequestOptions,
    }) instanceof Promise,
    true,
  )
  assert.strictEqual(calls.length, 1, 'double install must not double-wrap')
})
