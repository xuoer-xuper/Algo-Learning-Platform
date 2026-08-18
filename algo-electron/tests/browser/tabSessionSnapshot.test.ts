import { describe, expect, it } from 'vitest'
import { MAX_TABS } from '../../electron/browser/tabManagerConfig'
import {
  createTabSessionSnapshot,
  normalizeRestorableWebUrl,
  parseTabSessionSnapshot,
  parseTabSessionSnapshotJson,
} from '../../electron/browser/tabSessionSnapshot'
import type { InternalPage, TabSnapshot } from '../../electron/browser/tabManagerTypes'

function webTab(id: string, url = `https://example.com/${id}`, title = id): TabSnapshot {
  return { id, kind: 'web', url, title }
}

function internalTab(id: string, page: InternalPage = { type: 'home' }, title = id): TabSnapshot {
  return { id, kind: 'internal', page, title }
}

function envelope(tabs: unknown[], activeTabId: string | null = tabs.length > 0 ? 'tab-1' : null) {
  return { version: 1, activeTabId, tabs }
}

describe('tab session snapshot validation', () => {
  it('preserves a mixed ordered web and internal session', () => {
    const value = {
      version: 1,
      activeTabId: 'notes',
      tabs: [
        webTab('judge', 'https://codeforces.com/problemset/problem/1/A?order=BY_RATING_ASC#submission-42', 'OJ'),
        internalTab('notes', { type: 'notes', problemId: 'cf-1a' }, 'Notes'),
        internalTab('settings', { type: 'settings' }, 'Settings'),
      ],
    }

    expect(parseTabSessionSnapshot(value)).toEqual({
      ok: true,
      snapshot: {
        ...value,
        tabs: [
          webTab('judge', 'https://codeforces.com/problemset/problem/1/A?order=BY_RATING_ASC#submission-42', 'OJ'),
          internalTab('notes', { type: 'notes', problemId: 'cf-1a' }, 'Notes'),
          internalTab('settings', { type: 'settings' }, 'Settings'),
        ],
      },
    })
  })

  it.each([
    ['null envelope', null],
    ['array envelope', []],
    ['missing version', { activeTabId: null, tabs: [] }],
    ['missing active id', { version: 1, tabs: [] }],
    ['missing tabs', { version: 1, activeTabId: null }],
    ['extra envelope field', { version: 1, activeTabId: null, tabs: [], selectedIndex: 0 }],
  ])('rejects an invalid exact-shape envelope: %s', (_label, value) => {
    expect(parseTabSessionSnapshot(value)).toEqual({ ok: false, reason: 'invalid-envelope' })
  })

  it.each([0, 2, '1', null])('rejects unsupported version %j', (version) => {
    expect(parseTabSessionSnapshot({ version, activeTabId: null, tabs: [] })).toEqual({
      ok: false,
      reason: 'unsupported-version',
    })
  })

  it('distinguishes invalid tabs containers and the MAX_TABS boundary', () => {
    expect(parseTabSessionSnapshot({ version: 1, activeTabId: null, tabs: null })).toEqual({
      ok: false,
      reason: 'invalid-tabs',
    })

    const maximumTabs = Array.from({ length: MAX_TABS }, (_, index) => webTab(`tab-${index}`))
    expect(parseTabSessionSnapshot(envelope(maximumTabs, 'tab-0'))).toEqual({
      ok: true,
      snapshot: envelope(maximumTabs, 'tab-0'),
    })
    expect(parseTabSessionSnapshot(envelope([...maximumTabs, webTab('overflow')], 'tab-0'))).toEqual({
      ok: false,
      reason: 'too-many-tabs',
    })
  })

  it.each([
    ['extra web field', { ...webTab('tab-1'), favicon: 'https://example.com/favicon.ico' }],
    ['missing web URL', { id: 'tab-1', kind: 'web', title: 'Title' }],
    ['non-string web URL', { id: 'tab-1', kind: 'web', url: 42, title: 'Title' }],
    ['extra internal field', { ...internalTab('tab-1'), url: 'algo://home' }],
    ['missing internal page', { id: 'tab-1', kind: 'internal', title: 'Title' }],
    ['unknown kind', { id: 'tab-1', kind: 'popup', url: 'https://example.com', title: 'Title' }],
  ])('rejects an invalid exact-shape tab: %s', (_label, tab) => {
    expect(parseTabSessionSnapshot(envelope([tab]))).toEqual({ ok: false, reason: 'invalid-tab' })
  })

  it('validates unique bounded ASCII tab ids', () => {
    const validId = `a_${'x'.repeat(60)}-z`
    expect(validId).toHaveLength(64)
    expect(parseTabSessionSnapshot(envelope([webTab(validId)], validId)).ok).toBe(true)

    for (const id of ['', 'x'.repeat(65), 'has space', 'has.dot', 'slash/id', 'nonascii-\u00e9']) {
      expect(parseTabSessionSnapshot(envelope([webTab(id)], id))).toEqual({
        ok: false,
        reason: 'invalid-tab',
      })
    }

    expect(parseTabSessionSnapshot(envelope([webTab('same'), internalTab('same')], 'same'))).toEqual({
      ok: false,
      reason: 'duplicate-tab-id',
    })
  })

  it('accepts a 512-character title and rejects longer or control-bearing titles', () => {
    expect(parseTabSessionSnapshot(envelope([webTab('tab-1', undefined, 'x'.repeat(512))]))).toEqual({
      ok: true,
      snapshot: envelope([webTab('tab-1', undefined, 'x'.repeat(512))]),
    })
    expect(parseTabSessionSnapshot(envelope([webTab('tab-1', undefined, 'x'.repeat(513))]))).toEqual({
      ok: false,
      reason: 'invalid-tab',
    })
    expect(parseTabSessionSnapshot(envelope([webTab('tab-1', undefined, 'before\u0000after')]))).toEqual({
      ok: false,
      reason: 'invalid-tab',
    })
    expect(parseTabSessionSnapshot(envelope([webTab('tab-1', undefined, 'before\u0080after')]))).toEqual({
      ok: false,
      reason: 'invalid-tab',
    })
  })

  it('accepts every supported strict internal page shape', () => {
    const pages: InternalPage[] = [
      { type: 'home' },
      { type: 'settings' },
      { type: 'dashboard' },
      { type: 'scripts' },
      { type: 'coach-metrics' },
      { type: 'problem-detail', problemId: 'problem-1' },
      { type: 'notes', problemId: 'problem-1' },
      { type: 'credentials' },
      { type: 'script-install', installId: 'install-1' },
    ]
    const tabs = pages.map((page, index) => internalTab(`tab-${index}`, page))

    expect(parseTabSessionSnapshot(envelope(tabs, 'tab-0'))).toEqual({
      ok: true,
      snapshot: envelope(tabs, 'tab-0'),
    })
  })

  it.each([
    { type: 'unknown' },
    { type: 'home', section: 'extra' },
    { type: 'problem-detail' },
    { type: 'problem-detail', problemId: '' },
    { type: 'problem-detail', problemId: 'has space' },
    { type: 'notes', problemId: 'x'.repeat(201) },
    { type: 'script-install', installId: '' },
    { type: 'script-install', installId: 'ok', secret: 'extra' },
  ])('rejects invalid internal page payload $type', (page) => {
    expect(parseTabSessionSnapshot(envelope([
      { id: 'tab-1', kind: 'internal', page, title: 'Internal' },
    ]))).toEqual({ ok: false, reason: 'invalid-tab' })
  })

  it('requires activeTabId to match the validated tab set', () => {
    expect(parseTabSessionSnapshot(envelope([], null))).toEqual({
      ok: true,
      snapshot: envelope([], null),
    })
    expect(parseTabSessionSnapshot(envelope([], 'tab-1'))).toEqual({
      ok: false,
      reason: 'invalid-active-tab',
    })
    expect(parseTabSessionSnapshot(envelope([webTab('tab-1')], null))).toEqual({
      ok: false,
      reason: 'invalid-active-tab',
    })
    expect(parseTabSessionSnapshot(envelope([webTab('tab-1')], 'missing'))).toEqual({
      ok: false,
      reason: 'invalid-active-tab',
    })
  })

  it('rejects the whole session when any one tab is invalid', () => {
    expect(parseTabSessionSnapshot(envelope([
      webTab('tab-1'),
      webTab('tab-2', 'javascript:alert(1)'),
      webTab('tab-3'),
    ]))).toEqual({ ok: false, reason: 'invalid-tab' })
  })
})

describe('restorable web URL policy', () => {
  it('allows HTTPS and preserves ordinary OJ query and fragment state', () => {
    const url = 'https://codeforces.com/contest/1/problem/A?locale=en&order=BY_SOLVED_DESC#/submissions?verdict=OK&author=tourist'
    expect(normalizeRestorableWebUrl(url)).toBe(url)
  })

  it('allows insecure HTTP only for loopback hosts in development mode', () => {
    const options = { allowInsecureLocalhost: true }
    expect(normalizeRestorableWebUrl('http://localhost:5173/problems', options)).toBe('http://localhost:5173/problems')
    expect(normalizeRestorableWebUrl('http://127.0.0.1:4173/', options)).toBe('http://127.0.0.1:4173/')
    expect(normalizeRestorableWebUrl('http://[::1]:3000/', options)).toBe('http://[::1]:3000/')
    expect(normalizeRestorableWebUrl('http://localhost:5173/problems')).toBeNull()
    expect(normalizeRestorableWebUrl('http://192.168.1.20:5173/', options)).toBeNull()
    expect(normalizeRestorableWebUrl('http://codeforces.com/')).toBeNull()
  })

  it.each([
    '',
    'about:blank',
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///C:/secrets.txt',
    'ftp://example.com/file',
    'not a url',
    'https://user@example.com/path',
    'https://user:password@example.com/path',
    'https://example.com/bad%escape',
    'https://example.com/encoded%0Acontrol',
    'https://example.com/invalid-utf8%E4',
    `https://example.com/${'x'.repeat(4_096)}`,
    'https://example.com/control\u0000character',
  ])('rejects unsafe or malformed URL %j', (url) => {
    expect(normalizeRestorableWebUrl(url)).toBeNull()
  })

  it.each([
    'https://example.com/?token=value',
    'https://example.com/?access_token=value',
    'https://example.com/?Authorization=value',
    'https://example.com/?session-id=value',
    'https://example.com/?password=value',
    'https://example.com/?code=value',
    'https://example.com/?state=value',
    'https://example.com/?ticket=value',
    'https://example.com/?signature=value',
    'https://example.com/#jwt=value',
    'https://example.com/#access_token=value&expires=60',
    'https://example.com/#/callback?refresh-token=value',
    'https://example.com/#/callback?%74oken=value',
  ])('rejects sensitive query or fragment data in %s', (url) => {
    expect(normalizeRestorableWebUrl(url)).toBeNull()
  })

  it('accepts valid percent escapes without weakening malformed-percent checks', () => {
    expect(normalizeRestorableWebUrl('https://example.com/problem/%E4%B8%AD%E6%96%87?q=a%20b')).toBe(
      'https://example.com/problem/%E4%B8%AD%E6%96%87?q=a%20b',
    )
  })
})

describe('tab session JSON parsing', () => {
  it('parses a valid JSON session', () => {
    const snapshot = envelope([webTab('tab-1')])
    expect(parseTabSessionSnapshotJson(JSON.stringify(snapshot))).toEqual({ ok: true, snapshot })
  })

  it.each(['', '{', '{"version":1', 'null trailing'])('rejects damaged JSON %j', (raw) => {
    expect(parseTabSessionSnapshotJson(raw)).toEqual({ ok: false, reason: 'invalid-json' })
  })

  it('rejects JSON larger than 128 KiB before parsing', () => {
    expect(parseTabSessionSnapshotJson('x'.repeat(128 * 1_024 + 1))).toEqual({
      ok: false,
      reason: 'oversized-json',
    })
  })
})

describe('tab session snapshot creation', () => {
  it('writes only the serializable allowlisted fields', () => {
    const webCandidate = {
      ...webTab('web-1', 'https://example.com/problem', 'Problem'),
      favicon: 'data:image/png;base64,secret',
      isLoading: true,
      isCrashed: true,
      isUnresponsive: true,
      isUnresponsiveNoticeDismissed: true,
      isActive: true,
      formData: { answer: 'secret' },
      password: 'secret',
      scriptSource: 'alert(1)',
    } as unknown as TabSnapshot
    const internalCandidate = {
      ...internalTab('home-1', { type: 'home' }, 'Home'),
      transientState: { scrollTop: 100 },
    } as unknown as TabSnapshot

    expect(createTabSessionSnapshot([webCandidate, internalCandidate], 'web-1')).toEqual({
      version: 1,
      activeTabId: 'web-1',
      tabs: [
        { id: 'web-1', kind: 'web', url: 'https://example.com/problem', title: 'Problem' },
        { id: 'home-1', kind: 'internal', page: { type: 'home' }, title: 'Home' },
      ],
    })
  })

  it('sanitizes control characters and truncates titles while filtering invalid ids and duplicates', () => {
    const snapshot = createTabSessionSnapshot([
      webTab('valid', 'https://example.com', `before\u0000after${'x'.repeat(600)}`),
      webTab('bad id'),
      webTab('valid', 'https://example.org'),
    ], 'valid')

    expect(snapshot.tabs).toHaveLength(1)
    expect(snapshot.tabs[0]).toMatchObject({ id: 'valid', title: expect.not.stringContaining('\u0000') })
    expect(snapshot.tabs[0].title).toHaveLength(512)
  })

  it('selects the surviving right neighbor when the active tab is unsafe', () => {
    expect(createTabSessionSnapshot([
      webTab('left'),
      webTab('unsafe', 'https://example.com/?token=secret'),
      internalTab('right', { type: 'dashboard' }),
    ], 'unsafe')).toMatchObject({
      activeTabId: 'right',
      tabs: [{ id: 'left' }, { id: 'right' }],
    })
  })

  it('falls back to the surviving left neighbor when there is no right neighbor', () => {
    expect(createTabSessionSnapshot([
      internalTab('left', { type: 'scripts' }),
      webTab('unsafe', 'javascript:alert(1)'),
    ], 'unsafe')).toMatchObject({
      activeTabId: 'left',
      tabs: [{ id: 'left' }],
    })
  })

  it('returns an empty session when no safe tab survives', () => {
    expect(createTabSessionSnapshot([
      webTab('unsafe', 'https://example.com/?password=secret'),
    ], 'unsafe')).toEqual({ version: 1, activeTabId: null, tabs: [] })
  })

  it('never selects an invalid internal candidate that was not written', () => {
    const invalidInternal = {
      id: 'invalid-active',
      kind: 'internal',
      page: { type: 'unknown' },
      title: 'Invalid',
    } as unknown as TabSnapshot

    expect(createTabSessionSnapshot([
      internalTab('left', { type: 'home' }),
      invalidInternal,
      internalTab('right', { type: 'settings' }),
    ], 'invalid-active')).toMatchObject({
      activeTabId: 'right',
      tabs: [{ id: 'left' }, { id: 'right' }],
    })
  })

  it('uses the first surviving tab when the requested active id is absent', () => {
    expect(createTabSessionSnapshot([
      internalTab('first', { type: 'credentials' }),
      webTab('second'),
    ], 'missing')).toMatchObject({ activeTabId: 'first' })
  })
})
