import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from 'electron'
import { TabManager } from '../../electron/browser/TabManager.ts'
import { PendingUserScriptInstallRegistry } from '../../electron/downloads/userScriptNavigation.ts'

async function drainNavigationEvents(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  resetElectronMock()
})

describe('TabManager find in page', () => {
  test('scopes results to the active tab and stacks document-flow insets', async () => {
    const window = new MockBrowserWindow({ width: 1200, height: 800 })
    const manager = new TabManager(window as never)
    const tabId = manager.createTab('https://example.com/problem')
    await drainNavigationEvents()
    const view = window.contentView.children[0]
    const results: FindInPageViewState[] = []
    manager.setFindInPageStateChangedHandler((state) => results.push(state))

    expect(manager.openFindInPage()).toBe(true)
    manager.setDownloadNoticeVisible(true)
    expect(view.getBounds().y).toBe(154)
    manager.setContestNoticeVisible(true)
    expect(view.getBounds().y).toBe(192)

    const pending = manager.findInPage(tabId, { type: 'query', query: 'graph' })
    expect(pending?.requestId).toBe(1)
    expect(view.webContents.findInPageCalls).toEqual([{
      text: 'graph',
      options: { forward: true, findNext: true },
    }])

    view.webContents.simulateFoundInPage({
      requestId: 1,
      activeMatchOrdinal: 2,
      matches: 5,
      selectionArea: { x: 0, y: 0, width: 10, height: 10 },
      finalUpdate: true,
    })
    expect(results.at(-1)).toMatchObject({
      tabId,
      activeMatchOrdinal: 2,
      matches: 5,
      finalUpdate: true,
    })

    manager.findInPage(tabId, { type: 'close' })
    expect(view.webContents.stopFindInPageCalls.at(-1)).toBe('keepSelection')
    expect(view.getBounds().y).toBe(154)
    manager.setContestNoticeVisible(false)
    expect(view.getBounds().y).toBe(116)
  })
})

describe('TabManager zoom preferences', () => {
  test('uses Chrome presets, saves before applying, and restores the committed origin', async () => {
    const saved = new Map([['https://example.com', 1.25]])
    const saveZoomFactorForUrl = vi.fn((url: string, factor: number) => {
      saved.set(new URL(url).origin, factor)
      return factor
    })
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never, {
      getZoomFactorForUrl: (url) => saved.get(new URL(url).origin) ?? 1,
      saveZoomFactorForUrl,
    })
    const tabId = manager.createTab('https://example.com/problem')
    await drainNavigationEvents()
    const view = window.contentView.children[0]

    expect(view.webContents.getZoomFactor()).toBe(1.25)
    expect(manager.setZoom(tabId, 'in')).toEqual({ tabId, factor: 1.5 })
    expect(saveZoomFactorForUrl).toHaveBeenCalledWith('https://example.com/problem', 1.5)
    expect(view.webContents.getZoomFactor()).toBe(1.5)

    saveZoomFactorForUrl.mockImplementationOnce(() => { throw new Error('read only') })
    expect(manager.setZoom(tabId, 'out')).toBeNull()
    expect(view.webContents.getZoomFactor()).toBe(1.5)
  })
})

describe('TabManager userscript navigation', () => {
  test('routes .user.js directly to a volatile internal confirmation tab', () => {
    const window = new MockBrowserWindow()
    const registry = new PendingUserScriptInstallRegistry({ idFactory: () => 'install-1' })
    const manager = new TabManager(window as never, { userScriptInstallRegistry: registry })

    const tabId = manager.createTab('https://example.com/helper.user.js')

    expect(manager.getTabList()).toMatchObject([{
      id: tabId,
      kind: 'internal',
      page: { type: 'script-install', installId: 'install-1' },
    }])
    expect(window.contentView.children).toHaveLength(0)
    expect(registry.get('install-1')?.sourceFileName).toBe('helper.user.js')
    expect(manager.getSessionSnapshot().tabs).toEqual([])

    manager.closeTab(tabId)
    expect(registry.get('install-1')).toBeNull()
  })
})
