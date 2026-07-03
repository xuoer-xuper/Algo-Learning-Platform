import assert from 'node:assert'
import { matchRuleToRegExp, parseScriptMetadata } from '../../electron/scripts/userScriptMetadata'

const code = `
// ==UserScript==
// @name        Sample Helper
// @description Demo script
// @version     1.2.3
// @match       *://*.codeforces.com/*
// @include     https://ac.nowcoder.com/*
// @require     https://example.com/lib.js#sha256-demo
// @resource    style https://example.com/style.css#hash
// @run-at      document-end
// ==/UserScript==
console.log('body')
`

const meta = parseScriptMetadata(code)

assert.strictEqual(meta.name, 'Sample Helper')
assert.strictEqual(meta.description, 'Demo script')
assert.strictEqual(meta.version, '1.2.3')
assert.deepStrictEqual(meta.matches, ['*://*.codeforces.com/*', 'https://ac.nowcoder.com/*'])
assert.deepStrictEqual(meta.requires, ['https://example.com/lib.js'])
assert.deepStrictEqual(meta.resources, [{ name: 'style', url: 'https://example.com/style.css' }])
assert.strictEqual(meta.runAt, 'document-end')

const codeforcesRule = matchRuleToRegExp('*://*.codeforces.com/*')
assert.ok(codeforcesRule.test('https://codeforces.com/problemset/problem/1/A'))
assert.ok(codeforcesRule.test('https://www.codeforces.com/contest/1/problem/A'))
assert.ok(!codeforcesRule.test('https://example.com/contest/1/problem/A'))

const nowcoderRule = matchRuleToRegExp('https://ac.nowcoder.com/*')
assert.ok(nowcoderRule.test('https://ac.nowcoder.com/acm/problem/278465'))
assert.ok(!nowcoderRule.test('http://ac.nowcoder.com/acm/problem/278465'))
