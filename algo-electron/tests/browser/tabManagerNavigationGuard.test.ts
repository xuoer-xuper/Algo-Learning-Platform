import { beforeEach, describe, expect, it } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from '../electron/electronMock'
import { TabManager } from '../../electron/browser/TabManager.ts'
import { PendingUserScriptInstallRegistry } from '../../electron/downloads/userScriptNavigation.ts'
import type { NavigationBlockReason } from '../../electron/browser/navigationPolicy.ts'

async function drainNavigationEvents(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

/**
 * `will-navigate` 和 `will-redirect` 共用同一个 guardNavigation 闭包。参数化跑两遍是
 * 为了在将来有人只改其中一个注册点（或漏掉一个）时立刻失败——一个 renderer 发起的
 * 跳转可以经由任意一个事件到达，只守住一个等于白名单形同虚设。
 */
const GUARDED_EVENTS = ['will-navigate', 'will-redirect'] as const

function navigationEvent(): { event: { preventDefault: () => void }; preventedCount: () => number } {
  let prevented = 0
  return {
    event: { preventDefault: () => { prevented += 1 } },
    preventedCount: () => prevented,
  }
}

describe.each(GUARDED_EVENTS)('TabManager navigation guard on %s', (eventName) => {
  beforeEach(() => {
    resetElectronMock()
  })

  it('takes over a .user.js navigation in place instead of letting the page load it', async () => {
    const window = new MockBrowserWindow({ width: 1200, height: 800 })
    const registry = new PendingUserScriptInstallRegistry({ idFactory: () => 'install-guard' })
    const manager = new TabManager(window as never, { userScriptInstallRegistry: registry })
    const tabId = manager.createTab('https://example.com/scripts')
    await drainNavigationEvents()
    const view = window.contentView.children[0]
    const { event, preventedCount } = navigationEvent()

    view.webContents.emit(eventName, event, 'https://example.com/scripts/helper.user.js')
    await drainNavigationEvents()

    expect(preventedCount()).toBe(1)
    // 就地替换：同一个标签页 id、标签页总数不变。若实现改成另开一个标签页，
    // 用户会丢掉原页面的上下文，这里必须失败。
    expect(manager.getTabList()).toMatchObject([{
      id: tabId,
      kind: 'internal',
      page: { type: 'script-install', installId: 'install-guard' },
    }])
    expect(registry.get('install-guard')?.sourceFileName).toBe('helper.user.js')
    expect(window.contentView.children).toHaveLength(0)
  })

  it('blocks a .user.js navigation without a registry and keeps the page as is', async () => {
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    const tabId = manager.createTab('https://example.com/scripts')
    await drainNavigationEvents()
    const view = window.contentView.children[0]
    const { event, preventedCount } = navigationEvent()

    view.webContents.emit(eventName, event, 'https://example.com/scripts/helper.user.js')
    await drainNavigationEvents()

    expect(preventedCount()).toBe(1)
    expect(manager.getTabList()).toMatchObject([{ id: tabId, kind: 'web', url: 'https://example.com/scripts' }])
    expect(window.contentView.children).toEqual([view])
  })

  it('lets an allowed https navigation through untouched', async () => {
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    manager.createTab('https://example.com/problem')
    await drainNavigationEvents()
    const blockedReasons: NavigationBlockReason[] = []
    manager.setNavigationBlockedHandler((reason) => blockedReasons.push(reason))
    const view = window.contentView.children[0]
    const { event, preventedCount } = navigationEvent()

    view.webContents.emit(eventName, event, 'https://example.com/problem/next')
    await drainNavigationEvents()

    expect(preventedCount()).toBe(0)
    expect(blockedReasons).toEqual([])
  })

  it.each([
    ['http://example.com/problem', 'insecure-http'],
    ['file:///C:/Windows/win.ini', 'unsupported-protocol'],
    ['javascript:fetch("https://evil.example")', 'unsupported-protocol'],
    ['not a url', 'invalid-url'],
  ] as const)('blocks %s and reports the decision reason', async (url, expectedReason) => {
    const window = new MockBrowserWindow()
    const manager = new TabManager(window as never)
    manager.createTab('https://example.com/problem')
    await drainNavigationEvents()
    const blockedReasons: NavigationBlockReason[] = []
    manager.setNavigationBlockedHandler((reason) => blockedReasons.push(reason))
    const view = window.contentView.children[0]
    const { event, preventedCount } = navigationEvent()

    view.webContents.emit(eventName, event, url)
    await drainNavigationEvents()

    expect(preventedCount()).toBe(1)
    expect(blockedReasons).toEqual([expectedReason])
    expect(manager.getTabList()).toMatchObject([{ kind: 'web', url: 'https://example.com/problem' }])
  })
})
