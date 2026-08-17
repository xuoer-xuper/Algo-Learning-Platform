import assert from 'node:assert/strict'
import { test } from 'vitest'
import { BrowserDiagnostics } from '../../electron/diagnostics/BrowserDiagnostics.ts'
import { installProblemTitleTracking } from '../../electron/tracking/problemTitleTracking.ts'
import { installUserScriptInjection } from '../../electron/scripts/userScriptInjector.ts'

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
  const callbacks: { navigate?: (url: string) => void; loaded?: (url: string) => Promise<void> } = {}
  const tabManager = {
    setNavigateCallback: (callback: (url: string) => void) => { callbacks.navigate = callback },
    setTitleChangeCallback: () => undefined,
    addActiveTabChangeListener: () => () => undefined,
    getTitleForUrl: () => undefined,
    executeScriptOnUrl: async () => { throw new Error('fallback failed') },
    setPageLoadedCallback: (callback: (url: string) => Promise<void>) => { callbacks.loaded = callback },
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

  callbacks.navigate?.('https://example.com/')
  await callbacks.loaded?.('https://example.com/')
  const entries = diagnostics.getSnapshot().entries
  assert.ok(entries.some((entry) => entry.area === 'tracking' && entry.status === 'skipped'))
  assert.ok(entries.some((entry) => entry.area === 'userscript' && entry.event === 'service-unavailable'))
})
