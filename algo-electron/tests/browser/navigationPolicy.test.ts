import assert from 'node:assert/strict'
import { test } from 'vitest'
import { evaluateBrowserNavigation } from '../../electron/browser/navigationPolicy.ts'

test('production navigation allows HTTPS and about:blank only when requested', () => {
  assert.deepStrictEqual(evaluateBrowserNavigation('https://codeforces.com/problemset'), { allowed: true })
  assert.deepStrictEqual(evaluateBrowserNavigation('about:blank'), {
    allowed: false,
    reason: 'unsupported-protocol',
  })
  assert.deepStrictEqual(evaluateBrowserNavigation('about:blank', { allowAboutBlank: true }), { allowed: true })
  assert.deepStrictEqual(evaluateBrowserNavigation('http://codeforces.com/problemset'), {
    allowed: false,
    reason: 'insecure-http',
  })
  assert.deepStrictEqual(evaluateBrowserNavigation('javascript:alert(1)'), {
    allowed: false,
    reason: 'unsupported-protocol',
  })
  assert.deepStrictEqual(evaluateBrowserNavigation('not a url'), {
    allowed: false,
    reason: 'invalid-url',
  })
})

test('development navigation only permits insecure loopback origins', () => {
  const options = { allowInsecureLocalhost: true }
  assert.deepStrictEqual(evaluateBrowserNavigation('http://localhost:5173', options), { allowed: true })
  assert.deepStrictEqual(evaluateBrowserNavigation('http://127.0.0.1:4173', options), { allowed: true })
  assert.deepStrictEqual(evaluateBrowserNavigation('http://[::1]:3000', options), { allowed: true })
  assert.deepStrictEqual(evaluateBrowserNavigation('http://192.168.1.20:5173', options), {
    allowed: false,
    reason: 'insecure-http',
  })
})
