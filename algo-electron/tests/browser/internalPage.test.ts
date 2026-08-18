import { describe, expect, it } from 'vitest'
import {
  getInternalPageUrl,
  parseInternalPageUrl,
} from '../../electron/browser/internalPage.ts'
import type { InternalPage } from '../../electron/browser/tabManagerTypes.ts'

describe('internal page URL parsing', () => {
  it.each<InternalPage>([
    { type: 'home' },
    { type: 'settings' },
    { type: 'dashboard' },
    { type: 'scripts' },
    { type: 'coach-metrics' },
    { type: 'credentials' },
    { type: 'problem-detail', problemId: 'Codeforces-1-A' },
    { type: 'notes', problemId: 'luogu-P1000' },
    { type: 'script-install', installId: 'install_123' },
  ])('round-trips $type canonical URLs', (page) => {
    expect(parseInternalPageUrl(getInternalPageUrl(page))).toEqual(page)
  })

  it.each([
    'algo://unknown',
    'algo://home/',
    'algo://home?extra=1',
    'algo://problem-detail',
    'algo://problem-detail?problemId=',
    'algo://problem-detail?problemId=a&problemId=b',
    'algo://problem-detail?problemId=a&extra=b',
    'algo://problem-notes?problemId=contains%20space',
    'algo://script-install?installId=%ZZ',
    'algo://user:password@home',
    'algo://home#fragment',
    'https://example.com/',
  ])('rejects non-canonical internal address %s', (value) => {
    expect(parseInternalPageUrl(value)).toBeNull()
  })
})
