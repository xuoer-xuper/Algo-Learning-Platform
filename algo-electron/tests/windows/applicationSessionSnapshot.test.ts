import { describe, expect, it } from 'vitest'
import { MAX_TABS } from '../../electron/browser/tabManagerConfig'
import type { TabSnapshot } from '../../electron/browser/tabManagerTypes'
import {
  createApplicationSessionSnapshot,
  getApplicationWindowsInRestoreOrder,
  MAX_APPLICATION_SESSION_JSON_BYTES,
  MAX_APPLICATION_SESSION_TABS,
  MAX_APPLICATION_SESSION_WINDOWS,
  parseApplicationSessionSnapshot,
  parseApplicationSessionSnapshotJson,
  type ApplicationWindowSessionCandidate,
} from '../../electron/windows/applicationSessionSnapshot'

function webTab(id: string, url = `https://example.com/${id}`): TabSnapshot {
  return { id, kind: 'web', url, title: `Tab ${id}` }
}

function appWindow(
  id: string,
  tabs: TabSnapshot[] = [webTab(`${id}-tab`)],
  activeTabId: string | null = tabs[0]?.id ?? null,
): ApplicationWindowSessionCandidate {
  return {
    id,
    bounds: { x: 100, y: 80, width: 1280, height: 800 },
    maximized: false,
    activeTabId,
    tabs,
  }
}

function envelope(windows: unknown[], mostRecentWindowId: string | null = 'window-1') {
  return { version: 1, mostRecentWindowId, windows }
}

describe('application session snapshot validation', () => {
  it('preserves window order, per-window tab order, active tabs, bounds, and recency', () => {
    const first = {
      ...appWindow('window-1', [webTab('tab-1'), webTab('tab-2')], 'tab-2'),
      maximized: true,
    }
    const second = {
      ...appWindow('window-2', [{
        id: 'settings',
        kind: 'internal' as const,
        page: { type: 'settings' as const },
        title: 'Settings',
      }]),
      bounds: { x: -1600, y: 40, width: 1200, height: 760 },
    }

    expect(parseApplicationSessionSnapshot(envelope([first, second], 'window-2'))).toEqual({
      ok: true,
      snapshot: envelope([first, second], 'window-2'),
    })
  })

  it.each([
    ['null', null, 'invalid-envelope'],
    ['array', [], 'invalid-envelope'],
    ['missing field', { version: 1, windows: [] }, 'invalid-envelope'],
    ['extra field', { ...envelope([], null), focused: true }, 'invalid-envelope'],
    ['wrong version', { ...envelope([], null), version: 2 }, 'unsupported-version'],
    ['non-array windows', { ...envelope([], null), windows: null }, 'invalid-windows'],
  ])('rejects an invalid envelope: %s', (_label, value, reason) => {
    expect(parseApplicationSessionSnapshot(value)).toEqual({ ok: false, reason })
  })

  it.each([
    ['extra window field', { ...appWindow('window-1'), owner: 'hidden' }],
    ['invalid id', appWindow('has space')],
    ['non-boolean maximized', { ...appWindow('window-1'), maximized: 1 }],
    ['extra bounds field', { ...appWindow('window-1'), bounds: { x: 0, y: 0, width: 800, height: 600, z: 1 } }],
    ['fractional coordinate', { ...appWindow('window-1'), bounds: { x: 0.5, y: 0, width: 800, height: 600 } }],
    ['oversized coordinate', { ...appWindow('window-1'), bounds: { x: 1_000_001, y: 0, width: 800, height: 600 } }],
    ['zero width', { ...appWindow('window-1'), bounds: { x: 0, y: 0, width: 0, height: 600 } }],
    ['oversized height', { ...appWindow('window-1'), bounds: { x: 0, y: 0, width: 800, height: 100_001 } }],
  ])('rejects an invalid window: %s', (_label, value) => {
    expect(parseApplicationSessionSnapshot(envelope([value]))).toEqual({
      ok: false,
      reason: 'invalid-window',
    })
  })

  it('rejects duplicate window IDs and tab IDs across windows', () => {
    expect(parseApplicationSessionSnapshot(envelope([
      appWindow('window-1'),
      appWindow('window-1', [webTab('other-tab')]),
    ]))).toEqual({ ok: false, reason: 'duplicate-window-id' })

    expect(parseApplicationSessionSnapshot(envelope([
      appWindow('window-1', [webTab('shared')]),
      appWindow('window-2', [webTab('shared')]),
    ]))).toEqual({ ok: false, reason: 'duplicate-tab-id' })
  })

  it('enforces per-window, application-wide tab, and window count limits', () => {
    expect(parseApplicationSessionSnapshot(envelope([
      appWindow(
        'window-1',
        Array.from({ length: MAX_TABS + 1 }, (_, index) => webTab(`tab-${index}`)),
        'tab-0',
      ),
    ]))).toEqual({ ok: false, reason: 'too-many-tabs' })

    const fullWindows = Array.from(
      { length: MAX_APPLICATION_SESSION_TABS / MAX_TABS + 1 },
      (_, windowIndex) => appWindow(
        `window-${windowIndex}`,
        Array.from({ length: MAX_TABS }, (_, tabIndex) => webTab(`tab-${windowIndex}-${tabIndex}`)),
        `tab-${windowIndex}-0`,
      ),
    )
    expect(parseApplicationSessionSnapshot(envelope(fullWindows))).toEqual({
      ok: false,
      reason: 'too-many-tabs',
    })

    const tooManyWindows = Array.from(
      { length: MAX_APPLICATION_SESSION_WINDOWS + 1 },
      (_, index) => appWindow(`window-${index}`, [], null),
    )
    expect(parseApplicationSessionSnapshot(envelope(tooManyWindows))).toEqual({
      ok: false,
      reason: 'too-many-windows',
    })
  })

  it('requires recency to reference a stored window and null for an empty session', () => {
    expect(parseApplicationSessionSnapshot(envelope([appWindow('window-1')], null))).toEqual({
      ok: false,
      reason: 'invalid-recent-window',
    })
    expect(parseApplicationSessionSnapshot(envelope([appWindow('window-1')], 'missing'))).toEqual({
      ok: false,
      reason: 'invalid-recent-window',
    })
    expect(parseApplicationSessionSnapshot(envelope([], null))).toEqual({
      ok: true,
      snapshot: envelope([], null),
    })
  })

  it('reuses strict tab validation and rejects a sensitive URL without partial restore', () => {
    expect(parseApplicationSessionSnapshot(envelope([
      appWindow('window-1', [
        webTab('safe'),
        webTab('unsafe', 'https://example.com/callback?access_token=secret'),
      ], 'safe'),
    ]))).toEqual({ ok: false, reason: 'invalid-window' })
  })
})

describe('application session JSON parsing', () => {
  it('parses valid JSON and rejects malformed or oversized input before restore', () => {
    const snapshot = envelope([appWindow('window-1')])
    expect(parseApplicationSessionSnapshotJson(JSON.stringify(snapshot))).toEqual({
      ok: true,
      snapshot,
    })
    expect(parseApplicationSessionSnapshotJson('{not-json')).toEqual({
      ok: false,
      reason: 'invalid-json',
    })
    expect(parseApplicationSessionSnapshotJson('x'.repeat(MAX_APPLICATION_SESSION_JSON_BYTES + 1))).toEqual({
      ok: false,
      reason: 'oversized-json',
    })
  })

  it('keeps the largest creatable snapshot within the parser byte limit', () => {
    const windows = Array.from(
      { length: MAX_APPLICATION_SESSION_TABS / MAX_TABS },
      (_, windowIndex) => appWindow(
        `window-${windowIndex}`,
        Array.from({ length: MAX_TABS }, (_, tabIndex) => webTab(
          `tab-${windowIndex}-${tabIndex}`,
          `https://example.com/${'a'.repeat(4_076)}`,
        )).map((tab) => ({ ...tab, title: '\u0800'.repeat(512) })),
        `tab-${windowIndex}-0`,
      ),
    )
    const snapshot = createApplicationSessionSnapshot(windows, 'window-0')
    const raw = JSON.stringify(snapshot)

    expect(snapshot.windows.flatMap((item) => item.tabs)).toHaveLength(MAX_APPLICATION_SESSION_TABS)
    expect(Buffer.byteLength(raw, 'utf8')).toBeLessThanOrEqual(MAX_APPLICATION_SESSION_JSON_BYTES)
    expect(parseApplicationSessionSnapshotJson(raw).ok).toBe(true)
  })
})

describe('application session snapshot creation', () => {
  it('restores the most recent window first without mutating persisted window order', () => {
    const snapshot = createApplicationSessionSnapshot([
      appWindow('window-1', [webTab('tab-1')]),
      appWindow('window-2', [webTab('tab-2')]),
      appWindow('window-3', [webTab('tab-3')]),
    ], 'window-2')

    expect(getApplicationWindowsInRestoreOrder(snapshot).map((window) => window.id)).toEqual([
      'window-2',
      'window-1',
      'window-3',
    ])
    expect(snapshot.windows.map((window) => window.id)).toEqual([
      'window-1',
      'window-2',
      'window-3',
    ])
  })

  it('never persists transient empty transfer windows', () => {
    const snapshot = createApplicationSessionSnapshot([
      appWindow('empty-window', [], null),
      appWindow('live-window', [webTab('live-tab')], 'live-tab'),
    ], 'empty-window')

    expect(snapshot.windows.map((window) => window.id)).toEqual(['live-window'])
    expect(snapshot.mostRecentWindowId).toBe('live-window')
    expect(parseApplicationSessionSnapshot({
      version: 1,
      mostRecentWindowId: 'empty-window',
      windows: [appWindow('empty-window', [], null)],
    })).toEqual({ ok: false, reason: 'invalid-window' })
  })

  it('sanitizes every tab, removes global duplicates, and repairs active references', () => {
    const snapshot = createApplicationSessionSnapshot([
      appWindow('window-1', [
        webTab('safe'),
        webTab('unsafe', 'https://example.com/?password=secret'),
        webTab('right'),
      ], 'unsafe'),
      appWindow('window-2', [webTab('safe'), webTab('unique')], 'safe'),
    ], 'window-2')

    expect(snapshot).toMatchObject({
      mostRecentWindowId: 'window-2',
      windows: [
        { id: 'window-1', activeTabId: 'right', tabs: [{ id: 'safe' }, { id: 'right' }] },
        { id: 'window-2', activeTabId: 'unique', tabs: [{ id: 'unique' }] },
      ],
    })
  })

  it('does not let rejected candidates consume the per-window tab limit', () => {
    const unsafeTabs = Array.from(
      { length: MAX_TABS },
      (_, index) => webTab(`unsafe-${index}`, `https://example.com/?token=${index}`),
    )
    const safeTabs = Array.from(
      { length: MAX_TABS },
      (_, index) => webTab(`safe-${index}`),
    )

    const snapshot = createApplicationSessionSnapshot([
      appWindow('window-1', [...unsafeTabs, ...safeTabs], 'safe-15'),
    ], 'window-1')

    expect(snapshot.windows[0].tabs.map((tab) => tab.id)).toEqual(
      safeTabs.map((tab) => tab.id),
    )
    expect(snapshot.windows[0].activeTabId).toBe('safe-15')
  })

  it('skips invalid windows, caps output, and falls back to the first surviving recent window', () => {
    const candidates = [
      appWindow('bad id'),
      ...Array.from(
        { length: MAX_APPLICATION_SESSION_WINDOWS + 2 },
        (_, index) => appWindow(`window-${index}`, [webTab(`tab-${index}`)]),
      ),
    ]
    const snapshot = createApplicationSessionSnapshot(candidates, 'bad id')

    expect(snapshot.windows).toHaveLength(MAX_APPLICATION_SESSION_WINDOWS)
    expect(snapshot.windows.map((item) => item.id)).toEqual(
      Array.from({ length: MAX_APPLICATION_SESSION_WINDOWS }, (_, index) => `window-${index}`),
    )
    expect(snapshot.mostRecentWindowId).toBe('window-0')
  })
})
