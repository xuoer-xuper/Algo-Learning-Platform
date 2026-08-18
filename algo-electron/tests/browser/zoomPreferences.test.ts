import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ZOOM_FACTOR,
  MAX_STORED_ZOOM_ORIGINS,
  getAdjacentZoomFactor,
  getZoomFactorForUrl,
  normalizeZoomByOrigin,
  normalizeZoomFactor,
  normalizeZoomOrigin,
  withZoomFactorForUrl,
} from '../../electron/browser/zoomPreferences.ts'

describe('zoom origin normalization', () => {
  it('uses only normalized HTTP(S) origin identity', () => {
    expect(normalizeZoomOrigin('HTTPS://Example.COM:443/a?b=1#c')).toBe('https://example.com')
    expect(normalizeZoomOrigin('http://Example.COM:80/path')).toBe('http://example.com')
    expect(normalizeZoomOrigin('https://example.com:8443/a')).toBe('https://example.com:8443')
  })

  it('rejects opaque, credentialed, invalid, and oversized URLs', () => {
    expect(normalizeZoomOrigin('file:///C:/secret')).toBeNull()
    expect(normalizeZoomOrigin('data:text/plain,hello')).toBeNull()
    expect(normalizeZoomOrigin('https://user:password@example.com/')).toBeNull()
    expect(normalizeZoomOrigin('not a URL')).toBeNull()
    expect(normalizeZoomOrigin(`https://${'a'.repeat(2_050)}.example`)).toBeNull()
  })
})

describe('zoom preference normalization', () => {
  it('accepts bounded finite factors rounded to two decimals', () => {
    expect(normalizeZoomFactor(1.249)).toBe(1.25)
    expect(normalizeZoomFactor(0.25)).toBe(0.25)
    expect(normalizeZoomFactor(5)).toBe(5)
    expect(normalizeZoomFactor(0.24)).toBeNull()
    expect(normalizeZoomFactor(5.01)).toBeNull()
    expect(normalizeZoomFactor(Number.NaN)).toBeNull()
  })

  it('sanitizes keys, values, duplicate normalized origins, and default entries', () => {
    expect(normalizeZoomByOrigin({
      'HTTPS://EXAMPLE.COM:443': 1.25,
      'https://example.com/path': 1.5,
      'https://default.example': 1,
      'file:///tmp/a': 2,
      'https://invalid.example': 20,
    })).toEqual({
      'https://example.com': 1.5,
    })
  })

  it('reads by origin, persists non-default values, and removes reset values', () => {
    const changed = withZoomFactorForUrl({}, 'https://codeforces.com/problemset/problem/1/A', 1.25)
    expect(changed).toEqual({ 'https://codeforces.com': 1.25 })
    expect(getZoomFactorForUrl(changed ?? {}, 'https://codeforces.com/contest/1')).toBe(1.25)
    expect(getZoomFactorForUrl(changed ?? {}, 'https://leetcode.com/problems')).toBe(DEFAULT_ZOOM_FACTOR)
    expect(withZoomFactorForUrl(changed ?? {}, 'https://codeforces.com/', 1)).toEqual({})
  })

  it('bounds stored origins and evicts the oldest normalized entry', () => {
    const preferences = Object.fromEntries(
      Array.from({ length: MAX_STORED_ZOOM_ORIGINS }, (_, index) => [
        `https://site-${index}.example`,
        1.25,
      ]),
    )
    const changed = withZoomFactorForUrl(preferences, 'https://new.example/path', 1.5)

    expect(Object.keys(changed ?? {})).toHaveLength(MAX_STORED_ZOOM_ORIGINS)
    expect(changed?.['https://site-0.example']).toBeUndefined()
    expect(changed?.['https://new.example']).toBe(1.5)
  })

  it('steps across Chrome-style preset factors', () => {
    expect(getAdjacentZoomFactor(1, 'in')).toBe(1.1)
    expect(getAdjacentZoomFactor(1, 'out')).toBe(0.9)
    expect(getAdjacentZoomFactor(1.23, 'in')).toBe(1.25)
    expect(getAdjacentZoomFactor(1.23, 'out')).toBe(1.1)
    expect(getAdjacentZoomFactor(5, 'in')).toBe(5)
    expect(getAdjacentZoomFactor(0.25, 'out')).toBe(0.25)
  })
})
