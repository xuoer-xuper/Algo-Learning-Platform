// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const tabApi = vi.hoisted(() => ({
  closeBrowserTab: vi.fn(),
  createBrowserTab: vi.fn(),
  detachBrowserTab: vi.fn(),
  switchBrowserTab: vi.fn(),
}))

vi.mock('../../src/components/tabApi', () => ({
  ...tabApi,
  subscribeTabListChanged: (callback: (tabs: unknown[]) => void) => {
    callback([{ id: 'tab-1', url: 'https://example.com', title: 'Example', isActive: true }])
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
})
