import assert from 'node:assert'
import fs from 'node:fs'

const tabManagerSource = fs.readFileSync('electron/browser/TabManager.ts', 'utf-8')
const realtimeServiceSource = fs.readFileSync('electron/submissions/RealtimeSubmissionService.ts', 'utf-8')
const mainSource = fs.readFileSync('electron/main.ts', 'utf-8')

assert.ok(
  tabManagerSource.includes('activeTabChangeListeners'),
  'TabManager should expose a dedicated active-tab event for non-navigation work',
)
assert.ok(
  tabManagerSource.includes('this.emitActiveTabChange(newTab.url)'),
  'TabManager should emit active-tab changes when switching tabs',
)
assert.ok(
  tabManagerSource.includes("view.webContents.on('did-frame-finish-load'"),
  'TabManager should observe sub-frame load events for late iframe submissions',
)
assert.ok(
  tabManagerSource.includes('this.emitDomReady(tab.url)'),
  'TabManager should reuse realtime DOM-ready listeners after sub-frame loads',
)
assert.ok(
  realtimeServiceSource.includes('tabManager.addActiveTabChangeListener'),
  'Realtime submission service should inject hooks when an existing tab becomes active',
)
assert.ok(
  !realtimeServiceSource.includes('this.emitNavigate(newTab.url)'),
  'Realtime hook reinjection should not reuse navigation events that drive visit tracking',
)
assert.ok(
  mainSource.includes('getRealtimeAdapterForUrl(details.url)'),
  'Main process should early-inject realtime hooks on supported main-frame OJ pages',
)
assert.ok(
  mainSource.includes('__ALGO_TOP_PAGE_URL'),
  'Early realtime injection should preserve the top page URL for adapter gating',
)
