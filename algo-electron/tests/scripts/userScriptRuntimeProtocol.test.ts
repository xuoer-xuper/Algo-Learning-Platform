import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  isUserScriptRuntimeInitRequest,
  isUserScriptRuntimePortRequest,
  parseUserScriptRuntimeCommand,
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
  assert.strictEqual(isUserScriptRuntimePortRequest({ nonce, frameUrl: 'https://example.com/', generation: 4 }), true)
  assert.strictEqual(isUserScriptRuntimePortRequest({ nonce: 'short', frameUrl: 'https://example.com/', generation: 4 }), false)
  assert.strictEqual(isUserScriptRuntimePortRequest({ nonce, frameUrl: 'https://example.com/', generation: -1 }), false)
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

test('runtime commands accept bounded xhr, clipboard, and menu payloads with exact shapes', () => {
  assert.deepStrictEqual(parseUserScriptRuntimeCommand({
    type: 'xhr:start',
    scriptId: 'script-1',
    requestId: 'request-1',
    details: {
      method: 'post',
      url: 'https://api.example.com/data',
      headers: { Accept: 'application/json' },
      data: '{"value":1}',
      responseType: 'json',
      timeout: 5_000,
      anonymous: false,
    },
  }), {
    type: 'xhr:start',
    scriptId: 'script-1',
    requestId: 'request-1',
    details: {
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: { Accept: 'application/json' },
      data: '{"value":1}',
      responseType: 'json',
      timeout: 5_000,
      anonymous: false,
    },
  })
  assert.deepStrictEqual(parseUserScriptRuntimeCommand({
    type: 'clipboard:set', scriptId: 'script-1', requestId: 'clipboard-1', data: 'answer', dataType: 'text',
  }), {
    type: 'clipboard:set', scriptId: 'script-1', requestId: 'clipboard-1', data: 'answer', dataType: 'text',
  })
  assert.deepStrictEqual(parseUserScriptRuntimeCommand({
    type: 'menu:register', scriptId: 'script-1', commandId: 'menu-1', name: 'Refresh rating',
  }), {
    type: 'menu:register', scriptId: 'script-1', commandId: 'menu-1', name: 'Refresh rating',
  })
})

test('runtime commands reject dangerous methods, header injection, oversized values, and extra fields', () => {
  const baseDetails = {
    method: 'GET',
    url: 'https://api.example.com/data',
    headers: {},
    data: null,
    responseType: '',
    timeout: 0,
    anonymous: false,
  }
  assert.strictEqual(parseUserScriptRuntimeCommand({
    type: 'xhr:start', scriptId: 'script-1', requestId: 'request-1', details: { ...baseDetails, method: 'CONNECT' },
  }), null)
  assert.strictEqual(parseUserScriptRuntimeCommand({
    type: 'xhr:start', scriptId: 'script-1', requestId: 'request-1', details: {
      ...baseDetails, headers: { Accept: 'ok\r\nX-Injected: true' },
    },
  }), null)
  assert.strictEqual(parseUserScriptRuntimeCommand({
    type: 'clipboard:set', scriptId: 'script-1', requestId: 'clipboard-1', data: 'x', dataType: 'text', extra: true,
  }), null)
  assert.strictEqual(parseUserScriptRuntimeCommand({
    type: 'menu:register', scriptId: 'script-1', commandId: 'menu-1', name: '',
  }), null)
})
