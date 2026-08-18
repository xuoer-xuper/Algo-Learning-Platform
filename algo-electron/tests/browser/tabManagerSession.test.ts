import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from 'electron'
import { TabManager } from '../../electron/browser/TabManager.ts'
import type { TabSessionSnapshot } from '../../electron/browser/tabManagerTypes.ts'
import {
  checkOjSender,
  resetTrustedSenderRegistry,
} from '../../electron/ipc/trustedSender.ts'

const harness = vi.hoisted(() => ({
  createAttempts: 0,
  createdContents: [] as TestWebContents[],
  createdViews: [] as Array<{ webContents: TestWebContents }>,
  failViewCreationAt: null as number | null,
  randomUuids: [] as string[],
}))

interface TestWebContents {
  id: number
  mainFrame: { url: string }
  getURL(): string
  isDestroyed(): boolean
  emit(event: string, ...args: unknown[]): boolean
  setTitle(title: string): void
}

vi.mock('electron', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const BaseWebContentsView = actual.WebContentsView as new (
    options?: Record<string, unknown>,
  ) => { webContents: TestWebContents }

  class InstrumentedWebContentsView extends BaseWebContentsView {
    constructor(options: Record<string, unknown> = {}) {
      harness.createAttempts += 1
      if (harness.createAttempts === harness.failViewCreationAt) {
        throw new Error('injected WebContentsView construction failure')
      }
      super(options)
      harness.createdContents.push(this.webContents)
      harness.createdViews.push(this)
    }
  }

  return { ...actual, WebContentsView: InstrumentedWebContentsView }
})

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return {
    ...actual,
    randomUUID: () => harness.randomUuids.shift() ?? actual.randomUUID(),
  }
})

function webSession(): TabSessionSnapshot {
  return {
    version: 1,
    activeTabId: 'restored-middle',
    tabs: [
      {
        id: 'restored-first',
        kind: 'web',
        url: 'https://example.com/first',
        title: 'First restored tab',
      },
      {
        id: 'restored-middle',
        kind: 'web',
        url: 'https://example.com/middle?problem=two-sum#discussion',
        title: 'Middle restored tab',
      },
      {
        id: 'restored-last',
        kind: 'web',
        url: 'https://example.com/last',
        title: 'Last restored tab',
      },
    ],
  }
}

async function drainNavigationEvents(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function ojSenderCheck(webContents: TestWebContents) {
  return checkOjSender({
    sender: webContents,
    senderFrame: webContents.mainFrame,
  } as never)
}

beforeEach(() => {
  resetElectronMock()
  resetTrustedSenderRegistry()
  harness.createAttempts = 0
  harness.createdContents.length = 0
  harness.createdViews.length = 0
  harness.failViewCreationAt = null
  harness.randomUuids.length = 0
})

describe('TabManager session restore', () => {
  test('keeps crashed metadata when immediate replacement creation fails and retries later', async () => {
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    const tabId = manager.createTab('https://example.com/retry')
    await drainNavigationEvents()
    const contents = harness.createdContents[0]
    harness.failViewCreationAt = 2

    contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
    contents.emit('destroyed')

    expect(manager.getTabList()).toMatchObject([{
      id: tabId,
      url: 'https://example.com/retry',
      isCrashed: true,
    }])
    expect(harness.createAttempts).toBe(2)

    harness.failViewCreationAt = null
    manager.reloadTab(tabId)
    await drainNavigationEvents()

    expect(manager.getTabList()).toMatchObject([{
      id: tabId,
      url: 'https://example.com/retry',
      isCrashed: false,
    }])
    expect(harness.createAttempts).toBe(3)
    expect(window.contentView.children).toEqual([harness.createdViews[1]])
  })

  test('restores ordered web tabs with stable metadata and mounts only the active view after setup', async () => {
    const window = new MockBrowserWindow({ width: 1200, height: 800 })
    const manager = new TabManager(window as never)
    const sessionChanges = vi.fn()
    const mountedAfterAttempts: number[] = []
    const addChildView = window.contentView.addChildView
    window.contentView.addChildView = (view) => {
      mountedAfterAttempts.push(harness.createAttempts)
      addChildView(view)
    }
    manager.addSessionChangeListener(sessionChanges)

    expect(manager.restoreSession(webSession())).toBe(true)
    await drainNavigationEvents()

    expect(manager.getTabList()).toEqual([
      {
        id: 'restored-first',
        kind: 'web',
        url: 'https://example.com/first',
        title: 'First restored tab',
        favicon: null,
        isLoading: false,
        isCrashed: false,
        isUnresponsive: false,
        isUnresponsiveNoticeDismissed: false,
        isActive: false,
      },
      {
        id: 'restored-middle',
        kind: 'web',
        url: 'https://example.com/middle?problem=two-sum#discussion',
        title: 'Middle restored tab',
        favicon: null,
        isLoading: false,
        isCrashed: false,
        isUnresponsive: false,
        isUnresponsiveNoticeDismissed: false,
        isActive: true,
      },
      {
        id: 'restored-last',
        kind: 'web',
        url: 'https://example.com/last',
        title: 'Last restored tab',
        favicon: null,
        isLoading: false,
        isCrashed: false,
        isUnresponsive: false,
        isUnresponsiveNoticeDismissed: false,
        isActive: false,
      },
    ])
    expect(manager.getActiveTabId()).toBe('restored-middle')
    expect(harness.createdViews).toHaveLength(3)
    expect(window.contentView.children).toEqual([harness.createdViews[1]])
    expect(mountedAfterAttempts).toEqual([3])
    expect(sessionChanges).not.toHaveBeenCalled()
  })

  test('emits session changes only for persistent tab state after restore', async () => {
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    const sessionChanges = vi.fn()
    manager.addSessionChangeListener(sessionChanges)
    expect(manager.restoreSession(webSession())).toBe(true)
    await drainNavigationEvents()
    expect(sessionChanges).not.toHaveBeenCalled()

    const activeContents = window.contentView.children[0].webContents as TestWebContents
    activeContents.emit('did-start-loading')
    activeContents.emit('page-favicon-updated', {}, ['https://example.com/favicon.ico'])
    activeContents.emit('did-stop-loading')
    expect(sessionChanges).not.toHaveBeenCalled()

    manager.navigate('https://example.com/navigated')
    await drainNavigationEvents()
    expect(sessionChanges).toHaveBeenCalledTimes(1)

    activeContents.setTitle('Navigated title')
    expect(sessionChanges).toHaveBeenCalledTimes(2)

    manager.switchTab('restored-first')
    expect(sessionChanges).toHaveBeenCalledTimes(3)

    const newId = manager.createTab('https://example.com/new')
    expect(newId).not.toBe('')
    expect(sessionChanges.mock.calls.length).toBeGreaterThanOrEqual(4)
    const afterCreate = sessionChanges.mock.calls.length

    manager.closeTab(newId)
    expect(sessionChanges.mock.calls.length).toBeGreaterThan(afterCreate)
  })

  test('serializes only stable tab fields and excludes loading, favicon, views, and renderer state', async () => {
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    expect(manager.restoreSession(webSession())).toBe(true)
    await drainNavigationEvents()

    const activeContents = window.contentView.children[0].webContents as TestWebContents
    activeContents.emit('did-start-loading')
    activeContents.emit('page-favicon-updated', {}, ['https://example.com/favicon.ico'])

    const snapshot = manager.getSessionSnapshot()
    expect(snapshot).toEqual(webSession())
    for (const tab of snapshot.tabs) {
      expect(Object.keys(tab).sort()).toEqual(['id', 'kind', 'title', 'url'])
    }
    expect(JSON.stringify(snapshot)).not.toMatch(
      /favicon|isLoading|isCrashed|view|webContents|form|password|scriptSource/,
    )
  })

  test('rejects restore into a non-empty manager without mutating its live tab', () => {
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    const existingId = manager.createTab('https://example.com/existing')
    const existingView = window.contentView.children[0]
    const before = manager.getTabList()

    expect(manager.restoreSession(webSession())).toBe(false)

    expect(manager.getTabList()).toEqual(before)
    expect(manager.getActiveTabId()).toBe(existingId)
    expect(window.contentView.children).toEqual([existingView])
    expect(existingView.webContents.isDestroyed()).toBe(false)
  })

  test('rejects empty sessions and restores internal sessions without creating views', () => {
    const emptyWindow = new MockBrowserWindow()
    const emptyManager = new TabManager(emptyWindow as never)
    expect(emptyManager.restoreSession({ version: 1, activeTabId: null, tabs: [] })).toBe(false)
    expect(emptyManager.getTabList()).toEqual([])
    expect(emptyWindow.contentView.children).toEqual([])

    const internalWindow = new MockBrowserWindow()
    const internalManager = new TabManager(internalWindow as never)
    expect(internalManager.restoreSession({
      version: 1,
      activeTabId: 'settings-tab',
      tabs: [{
        id: 'settings-tab',
        kind: 'internal',
        page: { type: 'settings' },
        title: 'Settings',
      }],
    })).toBe(true)
    expect(internalManager.getTabList()).toMatchObject([{
      id: 'settings-tab',
      kind: 'internal',
      page: { type: 'settings' },
      url: 'algo://settings',
      title: 'Settings',
      isActive: true,
    }])
    expect(internalWindow.contentView.children).toEqual([])
    expect(harness.createdViews).toEqual([])
  })

  test('restores mixed internal and web tabs while mounting only an active web view', async () => {
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)

    expect(manager.restoreSession({
      version: 1,
      activeTabId: 'web-1',
      tabs: [
        { id: 'home-1', kind: 'internal', page: { type: 'home' }, title: '首页' },
        { id: 'web-1', kind: 'web', url: 'https://example.com/problem', title: 'Problem' },
        { id: 'settings-1', kind: 'internal', page: { type: 'settings' }, title: '设置' },
      ],
    })).toBe(true)
    await drainNavigationEvents()

    expect(manager.getTabList().map((tab) => [tab.id, tab.kind, tab.isActive])).toEqual([
      ['home-1', 'internal', false],
      ['web-1', 'web', true],
      ['settings-1', 'internal', false],
    ])
    expect(harness.createdViews).toHaveLength(1)
    expect(window.contentView.children).toEqual([harness.createdViews[0]])
    expect(manager.getSessionSnapshot()).toEqual({
      version: 1,
      activeTabId: 'web-1',
      tabs: [
        { id: 'home-1', kind: 'internal', page: { type: 'home' }, title: '首页' },
        { id: 'web-1', kind: 'web', url: 'https://example.com/problem', title: 'Problem' },
        { id: 'settings-1', kind: 'internal', page: { type: 'settings' }, title: '设置' },
      ],
    })
  })

  test('rolls back every created view and trusted sender when view creation fails midway', () => {
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    const sessionChanges = vi.fn()
    manager.addSessionChangeListener(sessionChanges)
    harness.failViewCreationAt = 2

    expect(manager.restoreSession(webSession())).toBe(false)

    expect(harness.createAttempts).toBe(2)
    expect(harness.createdViews).toHaveLength(1)
    expect(harness.createdContents[0].isDestroyed()).toBe(true)
    expect(ojSenderCheck(harness.createdContents[0])).toEqual({
      trusted: false,
      reason: 'sender',
    })
    expect(manager.getTabList()).toEqual([])
    expect(manager.getActiveTabId()).toBeNull()
    expect(window.contentView.children).toEqual([])
    expect(sessionChanges).not.toHaveBeenCalled()
  })

  test('generates new tab ids without colliding with restored stable ids', () => {
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    const snapshot = webSession()
    snapshot.tabs[0].id = 'deadbeef'
    snapshot.activeTabId = 'deadbeef'
    harness.randomUuids.push(
      'deadbeef-0000-4000-8000-000000000000',
      'newtab42-0000-4000-8000-000000000000',
    )

    expect(manager.restoreSession(snapshot)).toBe(true)
    const newId = manager.createTab('https://example.com/new')

    expect(newId).toBe('newtab42')
    expect(new Set(manager.getTabList().map((tab) => tab.id)).size).toBe(4)
  })
})
