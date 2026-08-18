// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TabBarTabInfo } from '../../src/components/tabApi'

const tabApi = vi.hoisted(() => ({
  closeBrowserTab: vi.fn(),
  createBrowserTab: vi.fn(),
  detachBrowserTab: vi.fn(),
  getBrowserTabList: vi.fn(),
  subscribeTabListChanged: vi.fn(),
  switchBrowserTab: vi.fn(),
  unsubscribe: vi.fn(),
  listener: null as ((tabs: TabBarTabInfo[]) => void) | null,
}))

vi.mock('../../src/components/tabApi', () => tabApi)

import { TabBar } from '../../src/components/TabBar'

const initialTab: TabBarTabInfo = {
  id: 'tab-1',
  kind: 'web',
  url: 'https://example.com',
  title: 'Example',
  favicon: null,
  isLoading: false,
  isCrashed: false,
  isActive: true,
}

beforeEach(() => {
  tabApi.listener = null
  tabApi.getBrowserTabList.mockResolvedValue([initialTab])
  tabApi.subscribeTabListChanged.mockImplementation((callback: (tabs: TabBarTabInfo[]) => void) => {
    tabApi.listener = callback
    callback([initialTab])
    return tabApi.unsubscribe
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TabBar', () => {
  it('subscribes before requesting the current restored tab list', async () => {
    tabApi.subscribeTabListChanged.mockImplementation((callback: (tabs: TabBarTabInfo[]) => void) => {
      tabApi.listener = callback
      return tabApi.unsubscribe
    })

    render(<TabBar />)

    expect(tabApi.subscribeTabListChanged).toHaveBeenCalledOnce()
    expect(tabApi.getBrowserTabList).toHaveBeenCalledOnce()
    expect(tabApi.subscribeTabListChanged.mock.invocationCallOrder[0])
      .toBeLessThan(tabApi.getBrowserTabList.mock.invocationCallOrder[0])
    expect(await screen.findByRole('button', { name: 'Example' })).not.toBeNull()
  })

  it('does not let a late initial list overwrite a newer list-changed event', async () => {
    let resolveInitial: ((tabs: TabBarTabInfo[]) => void) | undefined
    tabApi.getBrowserTabList.mockReturnValue(new Promise((resolve) => {
      resolveInitial = resolve
    }))
    tabApi.subscribeTabListChanged.mockImplementation((callback: (tabs: TabBarTabInfo[]) => void) => {
      tabApi.listener = callback
      return tabApi.unsubscribe
    })
    render(<TabBar />)

    act(() => {
      tabApi.listener?.([{ ...initialTab, id: 'tab-2', title: 'Newer' }])
    })
    expect(screen.getByRole('button', { name: 'Newer' })).not.toBeNull()

    await act(async () => {
      resolveInitial?.([initialTab])
      await Promise.resolve()
    })

    expect(screen.getByRole('button', { name: 'Newer' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Example' })).toBeNull()
  })

  it('unsubscribes and ignores the initial list after unmount', async () => {
    let resolveInitial: ((tabs: TabBarTabInfo[]) => void) | undefined
    const onTabUrlChange = vi.fn()
    tabApi.getBrowserTabList.mockReturnValue(new Promise((resolve) => {
      resolveInitial = resolve
    }))
    tabApi.subscribeTabListChanged.mockImplementation((callback: (tabs: TabBarTabInfo[]) => void) => {
      tabApi.listener = callback
      return tabApi.unsubscribe
    })
    const { unmount } = render(<TabBar onTabUrlChange={onTabUrlChange} />)

    unmount()
    await act(async () => {
      resolveInitial?.([initialTab])
      await Promise.resolve()
    })

    expect(tabApi.unsubscribe).toHaveBeenCalledOnce()
    expect(onTabUrlChange).not.toHaveBeenCalled()
  })

  it('closes a tab with the middle mouse button', () => {
    render(<TabBar />)
    const tab = screen.getByRole('button', { name: 'Example' })

    fireEvent(tab, new MouseEvent('auxclick', { bubbles: true, button: 1 }))

    expect(tabApi.closeBrowserTab).toHaveBeenCalledWith('tab-1')
  })

  it('does not close a tab for other auxiliary buttons', () => {
    render(<TabBar />)
    fireEvent(
      screen.getByRole('button', { name: 'Example' }),
      new MouseEvent('auxclick', { bubbles: true, button: 2 }),
    )
    expect(tabApi.closeBrowserTab).not.toHaveBeenCalled()
  })

  it('replaces the legacy detach gesture with the multi-window notice', () => {
    const onNotice = vi.fn()
    render(<TabBar onNotice={onNotice} />)

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Example' }))

    expect(onNotice).toHaveBeenCalledWith('拆分窗口将在多窗口版本以更完整形态回归')
    expect(tabApi.detachBrowserTab).not.toHaveBeenCalled()
  })
})
