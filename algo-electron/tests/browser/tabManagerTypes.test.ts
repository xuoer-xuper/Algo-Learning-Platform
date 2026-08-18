import { describe, expect, it } from 'vitest'
import { isInternalPage } from '../../electron/browser/tabManagerTypes'

describe('InternalPage validation', () => {
  it('accepts supported pages with strict parameter shapes', () => {
    expect(isInternalPage({ type: 'home' })).toBe(true)
    expect(isInternalPage({ type: 'settings' })).toBe(true)
    expect(isInternalPage({ type: 'problem-detail', problemId: 'problem-1' })).toBe(true)
    expect(isInternalPage({ type: 'notes', problemId: 'problem-1' })).toBe(true)
    expect(isInternalPage({ type: 'script-install', installId: 'install-1' })).toBe(true)
  })

  it('rejects unknown, empty, oversized, and extra parameters', () => {
    expect(isInternalPage({ type: 'unknown' })).toBe(false)
    expect(isInternalPage({ type: 'problem-detail', problemId: '' })).toBe(false)
    expect(isInternalPage({ type: 'problem-detail', problemId: '  ' })).toBe(false)
    expect(isInternalPage({ type: 'problem-detail', problemId: ' problem-1 ' })).toBe(false)
    expect(isInternalPage({ type: 'problem-detail', problemId: 'problem 1' })).toBe(false)
    expect(isInternalPage({ type: 'problem-detail', problemId: 'problem\u0000' })).toBe(false)
    expect(isInternalPage({ type: 'problem-detail' })).toBe(false)
    expect(isInternalPage({ type: 'problem-detail', problemId: 1 })).toBe(false)
    expect(isInternalPage({ type: 'notes', problemId: 'x'.repeat(200) })).toBe(true)
    expect(isInternalPage({ type: 'notes', problemId: 'x'.repeat(201) })).toBe(false)
    expect(isInternalPage({ type: 'settings', section: 'privacy' })).toBe(false)
    expect(isInternalPage({ type: 'script-install', installId: 'ok', secret: 'no' })).toBe(false)
    expect(isInternalPage([])).toBe(false)
    expect(isInternalPage(null)).toBe(false)
  })
})
