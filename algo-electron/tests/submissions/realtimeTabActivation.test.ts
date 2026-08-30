import assert from 'node:assert/strict'
import { beforeEach, test } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from 'electron'
import {
  TabManager,
  type BrowserPageEvent,
  type BrowserPageEventReason,
} from '../../electron/browser/TabManager.ts'
import { ViewRegistry } from '../../electron/windows/ViewRegistry.ts'
import { RealtimeSubmissionService } from '../../electron/submissions/RealtimeSubmissionService.ts'
import type { Logger } from '../../electron/shared/logger.ts'

async function drain(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function silentLogger(): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    fatal: () => undefined,
    getLogFilePath: () => null,
  }
}

beforeEach(() => {
  resetElectronMock()
})

test('switching to a web tab publishes an active-tab page event alongside the legacy url listener', async () => {
  const window = new MockBrowserWindow()
  const registry = new ViewRegistry()
  const manager = new TabManager(window as never, { windowId: 'window-1', viewRegistry: registry })
  const first = manager.createTab('https://example.com/first')
  const second = manager.createTab('https://example.com/second')
  await drain()
  manager.switchTab(second)

  const pageEvents: BrowserPageEvent[] = []
  const activeUrls: string[] = []
  manager.addPageEventListener(event => pageEvents.push(event))
  manager.addActiveTabChangeListener(url => activeUrls.push(url))

  manager.switchTab(first)

  // Realtime hook injection keys on this event to re-inject when an already
  // loaded page becomes visible again: a plain switch fires no navigation
  // event, so without it a tab the user comes back to stays un-hooked.
  const entry = registry.getByWindow('window-1').find(candidate => candidate.tabId === first)
  assert.equal(entry?.kind, 'tab')
  const activation = pageEvents.filter(event => event.reason === 'active-tab-changed')
  assert.equal(activation.length, 1)
  assert.deepEqual(activation[0], {
    windowId: 'window-1',
    tabId: first,
    webContentsId: entry?.kind === 'tab' ? entry.webContentsId : -1,
    url: 'https://example.com/first',
    isMainFrame: true,
    reason: 'active-tab-changed',
    title: undefined,
  })
  // The url listener predates page events and still has its own consumers.
  assert.deepEqual(activeUrls, ['https://example.com/first'])
})

test('a late sub-frame load reaches dom-ready listeners only for the visible tab', async () => {
  const window = new MockBrowserWindow()
  const registry = new ViewRegistry()
  const manager = new TabManager(window as never, { windowId: 'window-1', viewRegistry: registry })
  const activeTabId = manager.createTab('https://example.com/active')
  const backgroundTabId = manager.createTab('https://example.com/background')
  await drain()
  manager.switchTab(activeTabId)

  const domReadyUrls: string[] = []
  manager.addDomReadyListener(url => domReadyUrls.push(url))
  const viewFor = (tabId: string) => {
    const entry = registry.getByWindow('window-1').find(candidate => candidate.tabId === tabId)
    if (!entry || entry.kind !== 'tab') throw new Error(`tab ${tabId} missing`)
    return entry.view
  }

  // An iframe that finishes after the document is the common shape for OJ
  // submission panels, so legacy dom-ready consumers have to see it too.
  viewFor(activeTabId).webContents.emit('did-frame-finish-load', {}, false)
  assert.deepEqual(domReadyUrls, ['https://example.com/active'])

  // Main frames already went through the dom-ready event itself; re-emitting
  // here would double-inject on every ordinary page load.
  viewFor(activeTabId).webContents.emit('did-frame-finish-load', {}, true)
  // A background tab has no visible document to drive, and its own switch-in
  // will re-inject later.
  viewFor(backgroundTabId).webContents.emit('did-frame-finish-load', {}, false)
  assert.deepEqual(domReadyUrls, ['https://example.com/active'])
})

test('the realtime service forwards exactly the page-event reasons that can expose a new document', () => {
  const forwarded: BrowserPageEventReason[] = [
    'did-navigate',
    'did-navigate-in-page',
    'dom-ready',
    'did-frame-finish-load',
    'did-finish-load',
    'active-tab-changed',
  ]
  // page-title-updated fires on cosmetic title churn and destroyed means the
  // document is already gone; injecting on either wastes work at best and
  // targets a dead webContents at worst.
  const ignored: BrowserPageEventReason[] = ['page-title-updated', 'destroyed']

  for (const reason of [...forwarded, ...ignored]) {
    const service = new RealtimeSubmissionService(() => undefined, silentLogger())
    let listener: ((event: BrowserPageEvent) => void) | null = null
    const tabManager = {
      addPageEventListener(callback: (event: BrowserPageEvent) => void) {
        listener = callback
        return () => { listener = null }
      },
      getTitleForPage: () => null,
      executeScriptAcrossFramesForPage: async () => undefined,
    } as unknown as TabManager
    service.attachTabManager(tabManager)

    // No adapter matches example.com, so injection stops right after the page
    // is recorded — which makes lastPage a side-effect-free probe for
    // "the service decided to inject here".
    const url = `https://example.com/${reason}`
    listener!({
      windowId: 'window-1',
      tabId: 'tab-1',
      webContentsId: 11,
      url,
      isMainFrame: true,
      reason,
    })

    const seen = service.getStatus().lastPage?.url
    if (forwarded.includes(reason)) {
      assert.equal(seen, url, `${reason} must reach hook injection`)
    } else {
      assert.equal(seen, undefined, `${reason} must not reach hook injection`)
    }
    service.dispose()
  }
})
