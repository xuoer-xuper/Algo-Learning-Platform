import { describe, expect, it } from 'vitest'
import { isInternalPageId } from '../../src/shared/internal-page-id'
import { isInternalPage } from '../../electron/browser/tabManagerTypes'

// Frozen pre-extraction predicate, independent of the shared implementation.
function legacyIsNonEmptyId(value: unknown): boolean {
  function hasWhitespaceOrControl(input: string): boolean {
    return [...input].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return /\s/u.test(character) || codePoint < 32 || codePoint === 127
    })
  }
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    value.trim() === value &&
    !hasWhitespaceOrControl(value)
  )
}

const values: unknown[] = [
  null,
  undefined,
  false,
  0,
  {},
  [],
  '',
  ' ',
  ' leading',
  'trailing ',
  'middle space',
  'problem-1',
  'x'.repeat(200),
  'x'.repeat(201),
  '\u{1f600}'.repeat(100),
  '\u{1f600}'.repeat(101),
  '\ud800',
  '\udfff',
  '\u200b',
  '\u0085',
  'a:/?=&#%b',
  ...Array.from({ length: 128 }, (_, index) => `a${String.fromCodePoint(index)}b`),
  ...[0x00a0, 0x1680, 0x2000, 0x2007, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff].map(
    (codePoint) => `a${String.fromCodePoint(codePoint)}b`,
  ),
]

describe('shared internal-page ID contract', () => {
  it('preserves the complete legacy predicate for representative text and non-text inputs', () => {
    for (const value of values) {
      const expected = legacyIsNonEmptyId(value)
      expect(isInternalPageId(value), JSON.stringify(value)).toBe(expected)
      expect(isInternalPage({ type: 'problem-detail', problemId: value })).toBe(expected)
      expect(isInternalPage({ type: 'notes', problemId: value })).toBe(expected)
      expect(isInternalPage({ type: 'script-install', installId: value })).toBe(expected)
    }
  })

  it('keeps accepted unusual text unchanged and counts UTF-16 code units', () => {
    for (const value of ['\ud800', '\udfff', '\u200b', '\u0085', 'a:/?=&#%b']) {
      expect(isInternalPageId(value)).toBe(true)
    }
    expect(isInternalPageId('\u{1f600}'.repeat(100))).toBe(true)
    expect(isInternalPageId('\u{1f600}'.repeat(101))).toBe(false)
  })

  it('does not relax strict page shapes when sharing the ID check', () => {
    expect(isInternalPage({ type: 'notes', problemId: 'ok', extra: true })).toBe(false)
    expect(isInternalPage({ type: 'script-install', installId: 'ok', extra: true })).toBe(false)
    expect(isInternalPage({ type: 'problem-detail', installId: 'ok' })).toBe(false)
  })
})
