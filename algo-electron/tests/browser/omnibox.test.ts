import { describe, expect, it } from 'vitest'
import {
  buildSearchUrl,
  normalizeSearchEngineConfig,
  resolveOmniboxInput,
  validateCustomSearchTemplate,
  type SearchEngineConfig,
} from '../../electron/browser/omnibox.ts'

describe('omnibox search configuration', () => {
  it.each([
    ['bing', 'https://www.bing.com/search?q=dynamic%20programming'],
    ['google', 'https://www.google.com/search?q=dynamic%20programming'],
    ['baidu', 'https://www.baidu.com/s?wd=dynamic%20programming'],
  ] as const)('builds an encoded %s search URL', (engine, expected) => {
    expect(buildSearchUrl('dynamic programming', { engine, customTemplate: null })).toBe(expected)
  })

  it('accepts one literal query placeholder in an HTTPS custom template', () => {
    const template = 'https://search.example/find?term={query}&source=algo'
    expect(validateCustomSearchTemplate(template)).toEqual({ valid: true, template })
    expect(buildSearchUrl('A+B', { engine: 'custom', customTemplate: template }))
      .toBe('https://search.example/find?term=A%2BB&source=algo')
  })

  it.each([
    ['http://search.example/?q={query}', 'https-required'],
    ['https://user:password@search.example/?q={query}', 'userinfo'],
    ['https://search.example/?q=missing', 'query-placeholder-count'],
    ['https://search.example/?q={query}&again={query}', 'query-placeholder-count'],
    ['https://search.example/?q={query}&lang={locale}', 'other-placeholder'],
    ['not a URL {query}', 'invalid-url'],
    [' https://search.example/?q={query}', 'invalid-length'],
  ])('rejects unsafe custom template %s', (template, issue) => {
    expect(validateCustomSearchTemplate(template)).toEqual({ valid: false, issue })
  })

  it('falls back to Bing when a custom engine has no valid template', () => {
    expect(normalizeSearchEngineConfig({ engine: 'custom', customTemplate: 'http://bad/{query}' }))
      .toEqual({ engine: 'bing', customTemplate: null })
    expect(normalizeSearchEngineConfig({ engine: 'unknown', customTemplate: null }))
      .toEqual({ engine: 'bing', customTemplate: null })
  })
})

describe('omnibox input resolution', () => {
  const google: SearchEngineConfig = { engine: 'google', customTemplate: null }

  it('resolves canonical internal routes before web URLs', () => {
    expect(resolveOmniboxInput('algo://problem-notes?problemId=cf-1-a')).toEqual({
      kind: 'internal',
      page: { type: 'notes', problemId: 'cf-1-a' },
      url: 'algo://problem-notes?problemId=cf-1-a',
    })
  })

  it('normalizes explicit HTTPS and host-like input as web URLs', () => {
    expect(resolveOmniboxInput('https://codeforces.com/problemset')).toEqual({
      kind: 'url',
      url: 'https://codeforces.com/problemset',
    })
    expect(resolveOmniboxInput('leetcode.cn/problems/two-sum')).toEqual({
      kind: 'url',
      url: 'https://leetcode.cn/problems/two-sum',
    })
    expect(resolveOmniboxInput('example.com:443/path')).toEqual({
      kind: 'url',
      url: 'https://example.com/path',
    })
    expect(resolveOmniboxInput('localhost:5173/problems')).toEqual({
      kind: 'url',
      url: 'https://localhost:5173/problems',
    })
  })

  it('uses the configured engine for ordinary text', () => {
    expect(resolveOmniboxInput('  shortest path tutorial  ', { search: google })).toEqual({
      kind: 'search',
      query: 'shortest path tutorial',
      url: 'https://www.google.com/search?q=shortest%20path%20tutorial',
    })
    expect(resolveOmniboxInput('site:codeforces.com shortest path', { search: google })).toEqual({
      kind: 'search',
      query: 'site:codeforces.com shortest path',
      url: 'https://www.google.com/search?q=site%3Acodeforces.com%20shortest%20path',
    })
  })

  it.each([
    ['javascript:alert(1)', 'unsupported-protocol'],
    ['javascript:foo@bar.com', 'unsupported-protocol'],
    ['data:text/html,hello', 'unsupported-protocol'],
    ['file:///C:/secret.txt', 'unsupported-protocol'],
    ['http://codeforces.com/', 'insecure-http'],
    ['https://user:password@example.com/', 'userinfo'],
    ['user:password@example.com', 'userinfo'],
    ['algo://unknown', 'invalid-internal-url'],
    ['', 'empty-input'],
  ])('blocks %s with stable reason %s instead of searching', (value, reason) => {
    expect(resolveOmniboxInput(value)).toEqual({ kind: 'blocked', reason })
  })

  it('allows explicit HTTP only for development loopback hosts', () => {
    expect(resolveOmniboxInput('http://localhost:5173/problems', { allowInsecureLocalhost: true }))
      .toEqual({ kind: 'url', url: 'http://localhost:5173/problems' })
    expect(resolveOmniboxInput('http://127.0.0.1:4173/', { allowInsecureLocalhost: true }))
      .toEqual({ kind: 'url', url: 'http://127.0.0.1:4173/' })
    expect(resolveOmniboxInput('http://192.168.1.20:5173/', { allowInsecureLocalhost: true }))
      .toEqual({ kind: 'blocked', reason: 'insecure-http' })
  })
})
