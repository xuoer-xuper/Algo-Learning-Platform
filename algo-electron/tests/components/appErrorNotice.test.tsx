// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const setErrorNoticeVisible = vi.fn<(visible: boolean) => void>()

vi.mock('../../src/features/problems/ProblemSidebar', () => ({ ProblemSidebar: () => null }))
vi.mock('../../src/components/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../../src/components/WindowControls', () => ({ WindowControls: () => null }))
vi.mock('../../src/components/TabStrip', () => ({ TabStrip: () => null }))
vi.mock('../../src/components/BrowserToolbar', () => ({ BrowserToolbar: () => null }))
vi.mock('../../src/components/Omnibox', () => ({ OmniboxSuggestionsPanel: () => null }))
vi.mock('../../src/components/ShellRouter', () => ({ ShellRouter: () => null }))
vi.mock('../../src/components/FindInPageBar', () => ({ FindInPageBar: () => null }))
vi.mock('../../src/components/useOmnibox', () => ({
  useOmnibox: () => ({ inputRef: { current: null }, controller: { open: false } }),
}))
vi.mock('../../src/components/tabApi', () => ({
  closeBrowserTab: vi.fn(),
  dismissUnresponsiveBrowserTab: vi.fn(),
  openInternalBrowserTab: vi.fn(),
  reloadBrowserTab: vi.fn(),
}))
vi.mock('../../src/hooks/useBrowserNavigation', () => ({
  useBrowserNavigation: () => ({
    url: '',
    syncMsg: '',
    setSidebarWidth: vi.fn(),
    applyUrlState: vi.fn(),
    navigateFromInput: vi.fn(),
    navigateTo: vi.fn(),
    goHome: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    syncCurrentPage: vi.fn(),
  }),
}))
vi.mock('../../src/hooks/browserShellApi', () => ({
  getUserScriptHostPermissionPrompt: async () => null,
  respondUserScriptHostPermission: vi.fn(),
  setDownloadNoticeVisible: vi.fn(),
  setErrorNoticeVisible: (visible: boolean) => setErrorNoticeVisible(visible),
  showBrowserShellContextMenu: vi.fn(),
  subscribeDownloadResult: () => () => undefined,
  subscribeUserScriptHostPermissionPrompt: () => () => undefined,
  getCredentialAutofillPrompt: async () => null,
  subscribeCredentialAutofillPrompt: () => () => undefined,
  respondCredentialAutofill: vi.fn(async () => true),
  getCredentialCapturePrompt: async () => null,
  subscribeCredentialCapturePrompt: () => () => undefined,
  subscribeCredentialCaptureResult: () => () => undefined,
  respondCredentialCapture: vi.fn(async () => true),
}))
vi.mock('../../src/features/coach/coachDataApi', () => ({
  loadCoachState: async () => null,
  subscribeCoachContestMode: () => () => undefined,
}))

import App from '../../src/App'
import {
  reportRendererError,
  resetRendererErrorsForTest,
} from '../../src/rendererErrors'

beforeEach(() => {
  resetRendererErrorsForTest()
  setErrorNoticeVisible.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  resetRendererErrorsForTest()
  vi.restoreAllMocks()
})

test('读路径失败在通知栏呈现，而不是停在空态', () => {
  render(<App />)
  expect(screen.queryByTestId('notice-bar')).toBeNull()

  act(() => {
    reportRendererError('题目侧栏读取', new Error('database is locked'))
  })

  expect(screen.getByText('题目侧栏读取失败')).not.toBeNull()
  expect(screen.getByText('database is locked')).not.toBeNull()
  // 通知栏占布局高度，必须告知主进程调整 WebContentsView 上边距，
  // 否则 web 标签活动时通知会被原生视图盖住。
  expect(setErrorNoticeVisible).toHaveBeenLastCalledWith(true)
})

test('挂载前发生的失败在首帧就能看到', () => {
  // 入口安装监听早于 React 挂载：首屏读取失败必须补发到通知栏。
  reportRendererError('首页概览读取', new Error('no such table: user_daily_stats'))

  render(<App />)

  expect(screen.getByText('首页概览读取失败')).not.toBeNull()
  expect(screen.getByText('no such table: user_daily_stats')).not.toBeNull()
})

test('同一失败重复出现只显示一条并带次数', () => {
  render(<App />)

  act(() => {
    reportRendererError('统计趋势读取', new Error('timeout'))
    reportRendererError('统计趋势读取', new Error('timeout'))
  })

  expect(screen.getAllByTestId('notice-bar')).toHaveLength(1)
  expect(screen.getByText('timeout（2 次）')).not.toBeNull()
})

test('关闭通知后收起，并通知主进程恢复上边距', () => {
  render(<App />)
  act(() => {
    reportRendererError('笔记列表读取', new Error('boom'))
  })

  act(() => {
    screen.getByTitle('关闭错误通知').click()
  })

  expect(screen.queryByTestId('notice-bar')).toBeNull()
  expect(setErrorNoticeVisible).toHaveBeenLastCalledWith(false)
})

test('卸载时清掉主进程侧的上边距', () => {
  const { unmount } = render(<App />)
  act(() => {
    reportRendererError('设置页概览读取', new Error('boom'))
  })
  setErrorNoticeVisible.mockClear()

  unmount()

  expect(setErrorNoticeVisible).toHaveBeenCalledWith(false)
})
