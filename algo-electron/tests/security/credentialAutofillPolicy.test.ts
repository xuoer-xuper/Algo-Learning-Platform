import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  isAllowedSiteUrl,
  matchesLoginUrl,
  resolveCredentialAutofillTarget,
} from '../../electron/credentials/autofill/autofillPolicy'

const site = {
  id: 'codeforces',
  enabled: true,
  domains: ['codeforces.com'],
  loginUrlPatterns: ['/enter', '/login*'],
  loginUsernameSelectors: ['input[name="handleOrEmail"]'],
  loginPasswordSelectors: ['input[name="password"]'],
}

test('autofill policy requires HTTPS, a domain-label match, and a configured login route', () => {
  assert.ok(resolveCredentialAutofillTarget('https://codeforces.com/enter?back=%2F', site))
  assert.ok(resolveCredentialAutofillTarget('https://www.codeforces.com/login/oauth', site))
  assert.strictEqual(resolveCredentialAutofillTarget('https://codeforces.com/problemset', site), null)
  assert.strictEqual(resolveCredentialAutofillTarget('https://codeforces.com.evil.test/enter', site), null)
  assert.strictEqual(resolveCredentialAutofillTarget('http://codeforces.com/enter', site), null)
  assert.strictEqual(resolveCredentialAutofillTarget('https://user:pass@codeforces.com/enter', site), null)
  assert.strictEqual(resolveCredentialAutofillTarget('https://codeforces.com/enter', { ...site, enabled: false }), null)
})

test('login URL patterns accept path globs and same-origin absolute patterns only', () => {
  const login = new URL('https://example.test/accounts/login/?next=/problemset')
  assert.strictEqual(matchesLoginUrl(login, ['/accounts/login/*']), true)
  assert.strictEqual(matchesLoginUrl(login, ['https://example.test/accounts/login/*']), true)
  assert.strictEqual(matchesLoginUrl(login, ['https://other.test/accounts/login/*']), false)
  assert.strictEqual(matchesLoginUrl(login, ['javascript:alert(1)']), false)
})

test('site URL matching rejects suffix tricks, credentials, and insecure transport', () => {
  assert.strictEqual(isAllowedSiteUrl('https://sub.example.test/login', ['example.test']), true)
  assert.strictEqual(isAllowedSiteUrl('https://notexample.test/login', ['example.test']), false)
  assert.strictEqual(isAllowedSiteUrl('https://example.test.evil/login', ['example.test']), false)
  assert.strictEqual(isAllowedSiteUrl('ftp://example.test/login', ['example.test']), false)
})
