import assert from 'node:assert/strict'
import { test } from 'vitest'
import { BrowserDiagnostics } from '../../electron/diagnostics/BrowserDiagnostics.ts'
import { installProblemTitleTracking } from '../../electron/tracking/problemTitleTracking.ts'
import { installUserScriptInjection } from '../../electron/scripts/userScriptInjector.ts'
import type { BrowserPageEvent } from '../../electron/browser/TabManager.ts'

test('browser diagnostics are bounded, serializable, and redacted to metadata', () => {
  const diagnostics = new BrowserDiagnostics()
  diagnostics.record('userscript', 'inject', 'failed', {
    url: 'https://codeforces.com/problemset/problem/1/A',
    detail: new Error('execution failed'),
  })
  diagnostics.record('tracking', 'navigate', 'skipped', { detail: 'No enabled problem identity' })

  const snapshot = diagnostics.getSnapshot()
  assert.strictEqual(snapshot.entries.length, 2)
  assert.strictEqual(snapshot.entries[0].detail, 'execution failed')
  assert.ok(snapshot.entries[0].at)
  assert.deepStrictEqual(diagnostics.getSnapshot(0), { entries: [] })

  for (let index = 0; index < 120; index += 1) {
    diagnostics.record('title', 'extract', 'skipped', { detail: String(index) })
  }
  assert.strictEqual(diagnostics.getSnapshot().entries.length, 100)
  assert.strictEqual(diagnostics.getSnapshot().entries[0].detail, '20')
})

test('title and userscript silent fallbacks publish injectable diagnostics', async () => {
  const diagnostics = new BrowserDiagnostics()
  const pageListeners: Array<(event: BrowserPageEvent) => void> = []
  const tabManager = {
    addPageEventListener: (callback: (event: BrowserPageEvent) => void) => {
      pageListeners.push(callback)
      return () => undefined
    },
    addActiveTabChangeListener: () => () => undefined,
    getActivePageEvent: () => null,
    getWindowId: () => 'window-1',
    isPageActive: () => true,
    getTitleForPage: () => undefined,
    executeScriptForPage: async () => { throw new Error('fallback failed') },
  }

  installProblemTitleTracking({
    tabManager: tabManager as never,
    getTrackingService: () => null,
    notifyProblemsUpdated: () => undefined,
    diagnostics,
  })
  installUserScriptInjection({
    tabManager: tabManager as never,
    getUserScriptService: () => null,
    diagnostics,
  })

  const pageEvent: BrowserPageEvent = {
    windowId: 'window-1',
    tabId: 'tab-1',
    webContentsId: 101,
    url: 'https://example.com/',
    isMainFrame: true,
    reason: 'did-navigate',
  }
  pageListeners.forEach((listener) => listener(pageEvent))
  pageListeners.forEach((listener) => listener({ ...pageEvent, reason: 'did-finish-load' }))
  await new Promise((resolve) => setTimeout(resolve, 0))
  const entries = diagnostics.getSnapshot().entries
  assert.ok(entries.some((entry) => entry.area === 'tracking' && entry.status === 'skipped'))
  assert.ok(entries.some((entry) => entry.area === 'userscript' && entry.event === 'service-unavailable'))
})
