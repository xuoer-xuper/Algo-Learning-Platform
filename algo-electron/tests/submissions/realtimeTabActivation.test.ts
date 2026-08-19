import { test } from 'vitest'
import assert from 'node:assert'
import fs from 'node:fs'

test('submissions/realtimeTabActivation.test.ts', async () => {

const tabManagerSource = fs.readFileSync('electron/browser/TabManager.ts', 'utf-8')
const realtimeServiceSource = fs.readFileSync('electron/submissions/RealtimeSubmissionService.ts', 'utf-8')
const realtimeInjectorSource = fs.readFileSync('electron/submissions/RealtimeHookInjector.ts', 'utf-8')
const ojSessionSource = fs.readFileSync('electron/browser/ojSession.ts', 'utf-8')

assert.ok(
  tabManagerSource.includes('activeTabChangeListeners'),
  'TabManager should expose a dedicated active-tab event for non-navigation work',
)
assert.ok(
  tabManagerSource.includes('this.emitActiveTabChange(newTab.url)'),
  'TabManager should emit active-tab changes when switching tabs',
)
assert.ok(
  tabManagerSource.includes("contents.on('did-frame-finish-load'"),
  'TabManager should observe sub-frame load events for late iframe submissions',
)
assert.ok(
  tabManagerSource.includes("owner.emitPageEvent(tab, contentsId, url, isMainFrame, 'did-frame-finish-load')"),
  'TabManager should publish exact page ownership for main-frame and sub-frame loads',
)
assert.ok(
  tabManagerSource.includes('owner.emitDomReady(url)'),
  'TabManager should preserve legacy active-tab DOM-ready listeners after sub-frame loads',
)
assert.ok(
  realtimeServiceSource.includes("event.reason === 'active-tab-changed'"),
  'Realtime submission service should inject hooks when an exact existing page becomes active',
)
assert.ok(
  realtimeServiceSource.includes("event.reason === 'did-navigate-in-page'"),
  'Realtime hook injection should follow exact SPA navigation events',
)
assert.ok(
  realtimeInjectorSource.includes('executeScriptAcrossFramesForPage'),
  'Realtime hook injection should target all frames through the exact page owner',
)
assert.ok(
  ojSessionSource.includes('getRealtimeAdapterForUrl(details.url)'),
  'OJ session setup should early-inject realtime hooks on supported main-frame OJ pages',
)
assert.ok(
  ojSessionSource.includes('__ALGO_TOP_PAGE_URL'),
  'Early realtime injection should preserve the top page URL for adapter gating',
)

})
