import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  isUserScriptRuntimeInitRequest,
  isUserScriptRuntimePortRequest,
  parseUserScriptRuntimeMutation,
} from '../../electron/scripts/userScriptRuntimeProtocol'

const nonce = 'a'.repeat(32)

test('runtime handshake payloads require exact bounded shapes', () => {
  assert.strictEqual(isUserScriptRuntimeInitRequest({
    nonce,
    frameUrl: 'https://example.com/',
    isMainFrame: true,
  }), true)
  assert.strictEqual(isUserScriptRuntimeInitRequest({
    nonce,
    frameUrl: 'https://example.com/',
    isMainFrame: true,
    source: 'blocked',
  }), false)
  assert.strictEqual(isUserScriptRuntimePortRequest({ nonce, frameUrl: 'https://example.com/' }), true)
  assert.strictEqual(isUserScriptRuntimePortRequest({ nonce: 'short', frameUrl: 'https://example.com/' }), false)
})

test('runtime value mutations reject extra fields, unsafe values, and oversized keys', () => {
  assert.deepStrictEqual(parseUserScriptRuntimeMutation({
    type: 'value:set',
    scriptId: 'script-1',
    key: 'settings',
    value: { enabled: true },
  }), {
    type: 'value:set',
    scriptId: 'script-1',
    key: 'settings',
    value: { enabled: true },
  })
  assert.strictEqual(parseUserScriptRuntimeMutation({
    type: 'value:set', scriptId: 'script-1', key: 'bad', value: undefined,
  }), null)
  assert.strictEqual(parseUserScriptRuntimeMutation({
    type: 'value:delete', scriptId: 'script-1', key: 'x'.repeat(513),
  }), null)
  assert.strictEqual(parseUserScriptRuntimeMutation({
    type: 'value:delete', scriptId: 'script-1', key: 'settings', extra: true,
  }), null)
})
