// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TabStripTabInfo } from '../../src/components/tabApi'

const tabApi = vi.hoisted(() => ({
  closeBrowserTab: vi.fn(),
  createBrowserTab: vi.fn(),
  finishBrowserTabDrag: vi.fn(),
  getBrowserTabList: vi.fn(),
  moveBrowserTabToNewWindow: vi.fn(),
  subscribeTabListChanged: vi.fn(),
  switchBrowserTab: vi.fn(),
  unsubscribe: vi.fn(),
  listener: null as ((tabs: TabStripTabInfo[]) => void) | null,
}))

vi.mock('../../src/components/tabApi', () => tabApi)

import { TabStrip } from '../../src/components/TabStrip'

const initialTab: TabStripTabInfo = {
  id: 'tab-1',
  kind: 'web',
  url: 'https://example.com',
  title: 'Example',
  favicon: null,
  isLoading: false,
  isCrashed: false,
  isUnresponsive: false,
  isUnresponsiveNoticeDismissed: false,
  isActive: true,
}

function tab(id: string, title: string, isActive = false): TabStripTabInfo {
  return { ...initialTab, id, title, url: `https://example.com/${id}`, isActive }
}

beforeEach(() => {
  tabApi.listener = null
  tabApi.getBrowserTabList.mockResolvedValue([initialTab])
  tabApi.finishBrowserTabDrag.mockResolvedValue(true)
  tabApi.moveBrowserTabToNewWindow.mockResolvedValue(true)
  tabApi.subscribeTabListChanged.mockImplementation((callback: (tabs: TabStripTabInfo[]) => void) => {
    tabApi.listener = callback
    callback([initialTab])
    return tabApi.unsubscribe
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('TabStrip', () => {
  it('reports active-tab health changes even when the active id stays the same', () => {
    const onActiveTabChange = vi.fn()
    render(<TabStrip onActiveTabChange={onActiveTabChange} />)

    act(() => {
      tabApi.listener?.([{ ...initialTab, isUnresponsive: true }])
    })

    expect(onActiveTabChange).toHaveBeenLastCalledWith({
      ...initialTab,
      isUnresponsive: true,
    })
  })

  it('subscribes before requesting the current restored tab list', async () => {
    tabApi.subscribeTabListChanged.mockImplementation((callback: (tabs: TabStripTabInfo[]) => void) => {
      tabApi.listener = callback
      return tabApi.unsubscribe
    })

    render(<TabStrip />)

    expect(tabApi.subscribeTabListChanged).toHaveBeenCalledOnce()
    expect(tabApi.getBrowserTabList).toHaveBeenCalledOnce()
    expect(tabApi.subscribeTabListChanged.mock.invocationCallOrder[0])
      .toBeLessThan(tabApi.getBrowserTabList.mock.invocationCallOrder[0])
    expect(await screen.findByRole('tab', { name: 'Example' })).not.toBeNull()
  })

  it('does not let a late initial list overwrite a newer list-changed event', async () => {
    let resolveInitial: ((tabs: TabStripTabInfo[]) => void) | undefined
    tabApi.getBrowserTabList.mockReturnValue(new Promise((resolve) => {
      resolveInitial = resolve
    }))
    tabApi.subscribeTabListChanged.mockImplementation((callback: (tabs: TabStripTabInfo[]) => void) => {
      tabApi.listener = callback
      return tabApi.unsubscribe
    })
    render(<TabStrip />)

    act(() => {
      tabApi.listener?.([{ ...initialTab, id: 'tab-2', title: 'Newer' }])
    })
    expect(screen.getByRole('tab', { name: 'Newer' })).not.toBeNull()

    await act(async () => {
      resolveInitial?.([initialTab])
      await Promise.resolve()
    })

    expect(screen.getByRole('tab', { name: 'Newer' })).not.toBeNull()
    expect(screen.queryByRole('tab', { name: 'Example' })).toBeNull()
  })

  it('unsubscribes and ignores the initial list after unmount', async () => {
    let resolveInitial: ((tabs: TabStripTabInfo[]) => void) | undefined
    const onTabUrlChange = vi.fn()
    tabApi.getBrowserTabList.mockReturnValue(new Promise((resolve) => {
      resolveInitial = resolve
    }))
    tabApi.subscribeTabListChanged.mockImplementation((callback: (tabs: TabStripTabInfo[]) => void) => {
      tabApi.listener = callback
      return tabApi.unsubscribe
    })
    const { unmount } = render(<TabStrip onTabUrlChange={onTabUrlChange} />)

    unmount()
    await act(async () => {
      resolveInitial?.([initialTab])
      await Promise.resolve()
    })

    expect(tabApi.unsubscribe).toHaveBeenCalledOnce()
    expect(onTabUrlChange).not.toHaveBeenCalled()
  })

  it('renders loading, favicon and internal-page icon states', () => {
    const { container } = render(<TabStrip />)

    act(() => {
      tabApi.listener?.([{ ...initialTab, isLoading: true }])
    })
    expect(screen.getByLabelText('正在加载')).not.toBeNull()

    act(() => {
      tabApi.listener?.([{ ...initialTab, favicon: 'https://example.com/favicon.ico' }])
    })
    const favicon = container.querySelector<HTMLImageElement>('.tab-item-favicon')
    expect(favicon?.src).toBe('https://example.com/favicon.ico')
    expect(favicon?.getAttribute('referrerpolicy')).toBe('no-referrer')

    act(() => {
      tabApi.listener?.([{
        ...initialTab,
        kind: 'internal',
        page: { type: 'home' },
        url: 'algo://home',
        favicon: null,
      }])
    })
    expect(container.querySelector('[data-icon="home"]')).not.toBeNull()
  })

  it('closes a tab with the middle mouse button after the close animation', () => {
    vi.useFakeTimers()
    render(<TabStrip />)
    const tabElement = screen.getByRole('tab', { name: 'Example' })

    fireEvent(tabElement, new MouseEvent('auxclick', { bubbles: true, button: 1 }))
    expect(tabApi.closeBrowserTab).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(140) })
    expect(tabApi.closeBrowserTab).toHaveBeenCalledWith('tab-1')
  })

  it('does not close a tab for other auxiliary buttons', () => {
    render(<TabStrip />)
    fireEvent(
      screen.getByRole('tab', { name: 'Example' }),
      new MouseEvent('auxclick', { bubbles: true, button: 2 }),
    )
    expect(tabApi.closeBrowserTab).not.toHaveBeenCalled()
  })

  it('reorders with a pointer drag and suppresses the click released after dragging', () => {
    const tabs = [tab('tab-1', 'First', true), tab('tab-2', 'Second'), tab('tab-3', 'Third')]
    tabApi.subscribeTabListChanged.mockImplementation((callback: (tabs: TabStripTabInfo[]) => void) => {
      tabApi.listener = callback
      callback(tabs)
      return tabApi.unsubscribe
    })
    const { container } = render(<TabStrip />)
    const items = Array.from(container.querySelectorAll<HTMLElement>('[data-tab-id]'))
    items.forEach((item, index) => {
      vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({
        x: index * 100,
        y: 0,
        left: index * 100,
        right: index * 100 + 100,
        top: 0,
        bottom: 32,
        width: 100,
        height: 32,
        toJSON: () => ({}),
      })
    })
    const first = screen.getByRole('tab', { name: 'First' })

    fireEvent.pointerDown(first, { button: 0, pointerId: 7, clientX: 20, isPrimary: true })
    fireEvent.pointerMove(first, { pointerId: 7, clientX: 350, isPrimary: true })
    fireEvent.pointerUp(first, { pointerId: 7, clientX: 350, isPrimary: true })
    fireEvent.click(first)

    expect(tabApi.finishBrowserTabDrag).toHaveBeenCalledWith('tab-1', 2, 0, 0)
    expect(tabApi.switchBrowserTab).not.toHaveBeenCalled()
  })

  it('keeps a normal pointer click below the drag threshold as tab activation', () => {
    render(<TabStrip />)
    const current = screen.getByRole('tab', { name: 'Example' })
    fireEvent.pointerDown(current, { button: 0, pointerId: 2, clientX: 20, isPrimary: true })
    fireEvent.pointerMove(current, { pointerId: 2, clientX: 23, isPrimary: true })
    fireEvent.pointerUp(current, { pointerId: 2, clientX: 23, isPrimary: true })
    fireEvent.click(current)
    expect(tabApi.finishBrowserTabDrag).not.toHaveBeenCalled()
    expect(tabApi.switchBrowserTab).toHaveBeenCalledWith('tab-1')
  })

  it('navigates tabs with arrow, Home and End keys', () => {
    const tabs = [tab('tab-1', 'First', true), tab('tab-2', 'Second'), tab('tab-3', 'Third')]
    tabApi.subscribeTabListChanged.mockImplementation((callback: (tabs: TabStripTabInfo[]) => void) => {
      tabApi.listener = callback
      callback(tabs)
      return tabApi.unsubscribe
    })
    render(<TabStrip />)
    const first = screen.getByRole('tab', { name: 'First' })
    const second = screen.getByRole('tab', { name: 'Second' })
    const third = screen.getByRole('tab', { name: 'Third' })

    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(tabApi.switchBrowserTab).toHaveBeenLastCalledWith('tab-2')
    expect(document.activeElement).toBe(second)

    fireEvent.keyDown(first, { key: 'ArrowLeft' })
    expect(tabApi.switchBrowserTab).toHaveBeenLastCalledWith('tab-3')
    expect(document.activeElement).toBe(third)

    fireEvent.keyDown(second, { key: 'Home' })
    expect(tabApi.switchBrowserTab).toHaveBeenLastCalledWith('tab-1')
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(first, { key: 'End' })
    expect(tabApi.switchBrowserTab).toHaveBeenLastCalledWith('tab-3')
    expect(document.activeElement).toBe(third)
  })

  it('converts vertical wheel movement into horizontal tab scrolling', () => {
    const { container } = render(<TabStrip />)
    const strip = container.querySelector<HTMLElement>('.tab-strip-tabs')!
    Object.defineProperties(strip, {
      scrollWidth: { configurable: true, value: 600 },
      clientWidth: { configurable: true, value: 200 },
      scrollLeft: { configurable: true, value: 0, writable: true },
    })

    fireEvent.wheel(strip, { deltaY: 80 })
    expect(strip.scrollLeft).toBe(80)
  })

  it('moves a tab to a complete new shell on double click', () => {
    render(<TabStrip />)

    fireEvent.doubleClick(screen.getByRole('tab', { name: 'Example' }))

    expect(tabApi.moveBrowserTabToNewWindow).toHaveBeenCalledWith('tab-1')
  })
})
