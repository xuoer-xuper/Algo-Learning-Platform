import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  includeRuleToRegExp,
  matchRuleToRegExp,
  matchesUserScriptUrl,
  parseScriptMetadata,
  type UserScriptMetadata,
} from '../../electron/scripts/userScriptMetadata'

function matchingMetadata(overrides: Partial<UserScriptMetadata> = {}): UserScriptMetadata {
  return {
    matches: [], includes: [], excludes: [], excludeMatches: [], grants: [], connects: [],
    noframes: false, antifeatures: [], requires: [], resources: [], ...overrides,
  }
}

test('parses the complete B6.1 userscript metadata surface without merging rule kinds', () => {
  const metadata = parseScriptMetadata(`
// ==UserScript==
// @name          Sample Helper
// @namespace     https://example.com/userscripts
// @description   Demo script
// @version       1.2.3
// @match         *://*.codeforces.com/*
// @include       https://ac.nowcoder.com/*
// @exclude       https://ac.nowcoder.com/private/*
// @exclude-match *://*.codeforces.com/contest/private/*
// @grant         GM_getValue
// @grant         GM_setValue
// @connect       self
// @connect       api.example.com
// @noframes
// @updateURL     https://example.com/sample.meta.js
// @downloadURL   https://example.com/sample.user.js
// @antifeature   ads
// @antifeature   tracking
// @icon          https://example.com/icon.png
// @require       https://example.com/lib.js#sha256-demo
// @resource      style https://example.com/style.css#hash
// @run-at        document-end
// ==/UserScript==
console.log('body')
`)
  assert.strictEqual(metadata.name, 'Sample Helper')
  assert.strictEqual(metadata.namespace, 'https://example.com/userscripts')
  assert.strictEqual(metadata.description, 'Demo script')
  assert.strictEqual(metadata.version, '1.2.3')
  assert.deepStrictEqual(metadata.matches, ['*://*.codeforces.com/*'])
  assert.deepStrictEqual(metadata.includes, ['https://ac.nowcoder.com/*'])
  assert.deepStrictEqual(metadata.excludes, ['https://ac.nowcoder.com/private/*'])
  assert.deepStrictEqual(metadata.excludeMatches, ['*://*.codeforces.com/contest/private/*'])
  assert.deepStrictEqual(metadata.grants, ['GM_getValue', 'GM_setValue'])
  assert.deepStrictEqual(metadata.connects, ['self', 'api.example.com'])
  assert.strictEqual(metadata.noframes, true)
  assert.strictEqual(metadata.updateURL, 'https://example.com/sample.meta.js')
  assert.strictEqual(metadata.downloadURL, 'https://example.com/sample.user.js')
  assert.deepStrictEqual(metadata.antifeatures, ['ads', 'tracking'])
  assert.strictEqual(metadata.icon, 'https://example.com/icon.png')
  assert.deepStrictEqual(metadata.requires, [{
    url: 'https://example.com/lib.js',
    integrity: 'sha256-demo',
  }])
  assert.deepStrictEqual(metadata.resources, [{
    name: 'style',
    url: 'https://example.com/style.css',
    integrity: 'hash',
  }])
  assert.strictEqual(metadata.runAt, 'document-end')
})

test('matches strict scheme, host, and case-sensitive path boundaries', () => {
  const metadata = matchingMetadata({ matches: ['*://*.codeforces.com/Problems/*'] })
  assert.strictEqual(matchesUserScriptUrl('https://codeforces.com/Problems/1/A', metadata), true)
  assert.strictEqual(matchesUserScriptUrl('http://www.codeforces.com/Problems/1/A', metadata), true)
  assert.strictEqual(matchesUserScriptUrl('HTTPS://WWW.CODEFORCES.COM/Problems/1/A', metadata), true)
  assert.strictEqual(matchesUserScriptUrl('ftp://codeforces.com/Problems/1/A', metadata), false)
  assert.strictEqual(matchesUserScriptUrl('https://codeforces.com/problems/1/A', metadata), false)
  assert.strictEqual(matchesUserScriptUrl('https://evil.example/x.codeforces.com/Problems/1/A', metadata), false)
  assert.strictEqual(matchesUserScriptUrl('https://codeforces.com.evil.example/Problems/1/A', metadata), false)
  assert.strictEqual(matchRuleToRegExp('file:///*').test('file:///C:/scripts/helper.user.js'), true)
  assert.strictEqual(matchRuleToRegExp('<all_urls>').test('ftp://downloads.example.com/helper.user.js'), true)
})

test('@match and @exclude-match ignore query strings and fragments', () => {
  const allowed = matchingMetadata({ matches: ['https://example.com/problem/1'] })
  assert.strictEqual(matchesUserScriptUrl('https://example.com/problem/1?tab=solutions#editor', allowed), true)
  const excluded = matchingMetadata({
    matches: ['https://example.com/*'],
    excludeMatches: ['https://example.com/problem/private/1'],
  })
  assert.strictEqual(matchesUserScriptUrl('https://example.com/problem/private/1?tab=solutions#editor', excluded), false)
})

test('invalid @match rules fail closed without throwing or blocking later valid rules', () => {
  for (const invalidRule of [
    'https*://*.example.com/*',
    'http*://example.com/*',
    'https://foo*bar.example.com/*',
    'https://example.com:8080/*',
    'not a match pattern',
  ]) {
    assert.doesNotThrow(() => matchRuleToRegExp(invalidRule))
    assert.strictEqual(matchRuleToRegExp(invalidRule).test('https://foo.example.com/path'), false)
  }
  const metadata = matchingMetadata({
    matches: ['https*://*.example.com/*', 'https://valid.example.com/*'],
  })
  assert.strictEqual(matchesUserScriptUrl('https://valid.example.com/path', metadata), true)
})

test('@include supports URL globs and regular expressions while preserving explicit flags', () => {
  const glob = includeRuleToRegExp('https://example.com/problem/*?view=*')
  assert.strictEqual(glob.test('https://example.com/problem/1?view=editor'), true)
  assert.strictEqual(glob.test('https://example.com/contest/1?view=editor'), false)
  const caseSensitive = includeRuleToRegExp(String.raw`/^https:\/\/example\.com\/Problem\//`)
  assert.strictEqual(caseSensitive.test('https://example.com/Problem/1'), true)
  assert.strictEqual(caseSensitive.test('https://example.com/problem/1'), false)
  const caseInsensitive = includeRuleToRegExp(String.raw`/^https:\/\/example\.com\/Problem\//i`)
  assert.strictEqual(caseInsensitive.test('https://example.com/problem/1'), true)
  assert.doesNotThrow(() => includeRuleToRegExp('/[invalid/'))
  assert.strictEqual(includeRuleToRegExp('/[invalid/').test('https://example.com/[invalid'), false)
})

test('both exclusion rule kinds take priority over positive @match and @include rules', () => {
  const metadata = matchingMetadata({
    matches: ['https://example.com/*'],
    includes: ['https://mirror.example.net/*'],
    excludes: ['https://example.com/private/*'],
    excludeMatches: ['https://mirror.example.net/private/*'],
  })
  assert.strictEqual(matchesUserScriptUrl('https://example.com/public/1', metadata), true)
  assert.strictEqual(matchesUserScriptUrl('https://mirror.example.net/public/1', metadata), true)
  assert.strictEqual(matchesUserScriptUrl('https://example.com/private/1', metadata), false)
  assert.strictEqual(matchesUserScriptUrl('https://mirror.example.net/private/1?from=home#top', metadata), false)
})
