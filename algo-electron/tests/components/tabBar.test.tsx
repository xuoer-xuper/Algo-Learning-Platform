// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TabBarTabInfo } from '../../src/components/tabApi'

const tabApi = vi.hoisted(() => ({
  closeBrowserTab: vi.fn(),
  createBrowserTab: vi.fn(),
  detachBrowserTab: vi.fn(),
  switchBrowserTab: vi.fn(),
}))

vi.mock('../../src/components/tabApi', () => ({
  ...tabApi,
  subscribeTabListChanged: (callback: (tabs: TabBarTabInfo[]) => void) => {
    callback([{
      id: 'tab-1',
      kind: 'web',
      url: 'https://example.com',
      title: 'Example',
      favicon: null,
      isLoading: false,
      isCrashed: false,
      isActive: true,
    }])
    return () => {}
  },
}))

import { TabBar } from '../../src/components/TabBar'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TabBar', () => {
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
