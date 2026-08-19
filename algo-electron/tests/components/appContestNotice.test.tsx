// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

let contestListener: ((payload: CoachContestModePayload) => void) | null = null
const unsubscribeContest = vi.fn()
let getCoachState = vi.fn<() => Promise<CoachStateSnapshot | null>>()

function createCoachState(isContestMode: boolean): CoachStateSnapshot {
  return {
    current_session: null,
    is_contest_mode: isContestMode,
    contest: isContestMode
      ? {
          url: 'https://codeforces.com/contest/1000',
          platform: 'codeforces',
          contest_id: '1000',
          entered_at: '2026-08-19T00:00:00.000Z',
        }
      : null,
    pet_state: 'idle',
    llm_enabled: false,
    suppressed_types: [],
    last_event_at: null,
  }
}

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
  setDownloadNoticeVisible: vi.fn(),
  showBrowserShellContextMenu: vi.fn(),
  subscribeDownloadResult: () => () => undefined,
}))

import App from '../../src/App'

beforeEach(() => {
  contestListener = null
  unsubscribeContest.mockClear()
  getCoachState = vi.fn(async () => null)
  window.electronAPI = {
    coachGetState: () => getCoachState(),
    onCoachContestModeChanged: (listener) => {
      contestListener = listener
      return unsubscribeContest
    },
  } as ElectronAPI
})

afterEach(() => {
  cleanup()
})

test('shows a persistent layout notice while contest mode is active', () => {
  const { unmount } = render(<App />)
  expect(screen.queryByText('Coach 已静默，比赛期间不会显示提示。')).toBeNull()

  act(() => {
    contestListener?.({
      isContestMode: true,
      contest: {
        url: 'https://codeforces.com/contest/1000',
        platform: 'codeforces',
        contest_id: '1000',
        entered_at: '2026-08-19T00:00:00.000Z',
      },
    })
  })
  expect(screen.getByText('比赛模式')).not.toBeNull()
  expect(screen.getByText('Coach 已静默，比赛期间不会显示提示。')).not.toBeNull()

  act(() => {
    contestListener?.({ isContestMode: false, contest: null })
  })
  expect(screen.queryByText('比赛模式')).toBeNull()

  unmount()
  expect(unsubscribeContest).toHaveBeenCalledOnce()
})

test('hydrates contest mode from the current Coach state after subscribing', async () => {
  getCoachState.mockResolvedValue(createCoachState(true))
  render(<App />)

  expect(await screen.findByText('比赛模式')).not.toBeNull()
  expect(screen.getByText('Coach 已静默，比赛期间不会显示提示。')).not.toBeNull()
})

test('does not let a late initial snapshot overwrite a newer contest event', async () => {
  let resolveState!: (state: CoachStateSnapshot | null) => void
  getCoachState.mockImplementation(() => new Promise((resolve) => {
    resolveState = resolve
  }))
  render(<App />)

  act(() => {
    contestListener?.({
      isContestMode: true,
      contest: createCoachState(true).contest,
    })
  })
  expect(screen.getByText('比赛模式')).not.toBeNull()

  await act(async () => {
    resolveState(createCoachState(false))
  })
  expect(screen.getByText('比赛模式')).not.toBeNull()
})
