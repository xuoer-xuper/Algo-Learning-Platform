// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TabStripTabInfo } from '../../src/components/tabApi'

vi.mock('../../src/features/home/HomePage', () => ({
  HomePage: ({ onNavigate }: { onNavigate: (url: string) => void }) => (
    <button onClick={() => onNavigate('https://example.com')}>Home route</button>
  ),
}))
vi.mock('../../src/features/settings/SettingsPage', () => ({
  SettingsPage: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>Settings route</button>,
}))
vi.mock('../../src/features/analytics/Dashboard', () => ({
  Dashboard: () => <div>Dashboard route</div>,
}))
vi.mock('../../src/features/scripts/UserScriptManager', () => ({
  UserScriptManager: () => <div>Scripts route</div>,
}))
vi.mock('../../src/features/coach/CoachMetricsView', () => ({
  CoachMetricsView: () => <div>Coach route</div>,
}))
vi.mock('../../src/features/problems/ProblemDetail', () => ({
  ProblemDetail: ({ problemId }: { problemId: string }) => <div>Detail {problemId}</div>,
}))
vi.mock('../../src/features/problems/NotePanelModal', () => ({
  NotePanelModal: ({ problemId }: { problemId: string }) => <div>Notes {problemId}</div>,
}))

import { ShellRouter } from '../../src/components/ShellRouter'

const baseTab = {
  id: 'tab-1',
  url: 'algo://home',
  title: '首页',
  favicon: null,
  isLoading: false,
  isCrashed: false,
  isUnresponsive: false,
  isUnresponsiveNoticeDismissed: false,
  isActive: true,
}

function renderRoute(activeTab: TabStripTabInfo) {
  const onNavigate = vi.fn()
  const onCloseActiveTab = vi.fn()
  const onReloadActiveTab = vi.fn()
  render(
    <ShellRouter
      activeTab={activeTab}
      onNavigate={onNavigate}
      onCloseActiveTab={onCloseActiveTab}
      onReloadActiveTab={onReloadActiveTab}
    />,
  )
  return { onNavigate, onCloseActiveTab, onReloadActiveTab }
}

afterEach(() => cleanup())

describe('ShellRouter', () => {
  it('renders internal home and navigates from the current stable tab', () => {
    const callbacks = renderRoute({ ...baseTab, kind: 'internal', page: { type: 'home' } })
    fireEvent.click(screen.getByRole('button', { name: 'Home route' }))
    expect(callbacks.onNavigate).toHaveBeenCalledWith('https://example.com')
  })

  it('lazy-loads internal pages and wires their close action to the active tab', async () => {
    const callbacks = renderRoute({
      ...baseTab,
      kind: 'internal',
      page: { type: 'settings' },
      url: 'algo://settings',
      title: '设置',
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Settings route' }))
    expect(callbacks.onCloseActiveTab).toHaveBeenCalledOnce()
  })

  it('passes validated route parameters to problem pages', async () => {
    renderRoute({
      ...baseTab,
      kind: 'internal',
      page: { type: 'problem-detail', problemId: 'problem-42' },
      url: 'algo://problem-detail?problemId=problem-42',
      title: '题目详情',
    })
    expect(await screen.findByText('Detail problem-42')).not.toBeNull()
  })

  it('renders recovery actions only for a crashed web tab', () => {
    const healthy = { ...baseTab, kind: 'web' as const, url: 'https://example.com' }
    const { rerender } = render(
      <ShellRouter
        activeTab={healthy}
        onNavigate={() => {}}
        onCloseActiveTab={() => {}}
        onReloadActiveTab={() => {}}
      />,
    )
    expect(screen.queryByTestId('browser-crash-state')).toBeNull()

    const onClose = vi.fn()
    const onReload = vi.fn()
    rerender(
      <ShellRouter
        activeTab={{ ...healthy, isCrashed: true }}
        onNavigate={() => {}}
        onCloseActiveTab={onClose}
        onReloadActiveTab={onReload}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    fireEvent.click(screen.getByRole('button', { name: '关闭标签' }))
    expect(onReload).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
