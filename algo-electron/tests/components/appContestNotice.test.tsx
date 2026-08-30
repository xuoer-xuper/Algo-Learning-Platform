// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

let contestListener: ((payload: CoachContestModePayload) => void) | null = null
const unsubscribeContest = vi.fn()
let getCoachState = vi.fn<() => Promise<CoachStateSnapshot | null>>()
let permissionListener: ((prompt: UserScriptHostPermissionPrompt) => void) | null = null
const respondPermission = vi.fn(async () => 'allowed' as UserScriptHostPermissionResponse)
let capturePromptListener: ((prompt: CredentialCapturePrompt) => void) | null = null
let captureResultListener: ((result: CredentialCaptureResult) => void) | null = null
const respondCapture = vi.fn(async () => true)

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
  getUserScriptHostPermissionPrompt: async () => null,
  respondUserScriptHostPermission: (promptId: string, allow: boolean) => respondPermission(promptId, allow),
  setDownloadNoticeVisible: vi.fn(),
  setErrorNoticeVisible: vi.fn(),
  showBrowserShellContextMenu: vi.fn(),
  subscribeDownloadResult: () => () => undefined,
  subscribeUserScriptHostPermissionPrompt: (listener: (prompt: UserScriptHostPermissionPrompt) => void) => {
    permissionListener = listener
    return () => { permissionListener = null }
  },
  getCredentialAutofillPrompt: async () => null,
  subscribeCredentialAutofillPrompt: () => () => undefined,
  respondCredentialAutofill: vi.fn(async () => true),
  getCredentialCapturePrompt: async () => null,
  subscribeCredentialCapturePrompt: (listener: (prompt: CredentialCapturePrompt) => void) => {
    capturePromptListener = listener
    return () => { capturePromptListener = null }
  },
  subscribeCredentialCaptureResult: (listener: (result: CredentialCaptureResult) => void) => {
    captureResultListener = listener
    return () => { captureResultListener = null }
  },
  respondCredentialCapture: (captureId: string, action: CredentialCaptureAction) => respondCapture(captureId, action),
}))
vi.mock('../../src/features/coach/coachDataApi', () => ({
  loadCoachState: () => getCoachState(),
  subscribeCoachContestMode: (listener: (payload: CoachContestModePayload) => void) => {
    contestListener = listener
    return unsubscribeContest
  },
}))

import App from '../../src/App'

beforeEach(() => {
  contestListener = null
  permissionListener = null
  capturePromptListener = null
  captureResultListener = null
  unsubscribeContest.mockClear()
  respondPermission.mockClear()
  respondCapture.mockClear()
  getCoachState = vi.fn(async () => null)
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

test('shows the userscript host prompt in the existing NoticeBar and returns the decision', async () => {
  render(<App />)
  act(() => {
    permissionListener?.({
      promptId: 'prompt-1',
      scriptName: 'Ratings helper',
      targetHost: 'api.example.com',
      sourceHost: 'codeforces.com',
    })
  })
  expect(screen.getByText(/Ratings helper/)).toBeTruthy()
  expect(screen.getByText(/api\.example\.com/)).toBeTruthy()
  await act(async () => { screen.getByRole('button', { name: '允许' }).click() })
  expect(respondPermission).toHaveBeenCalledWith('prompt-1', true)
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

test('shows a redacted capture prompt and responds with save/update/cancel actions', async () => {
  render(<App />)
  act(() => {
    capturePromptListener?.({
      captureId: 'capture-1',
      siteId: 'codeforces',
      siteName: 'Codeforces',
      username: 'alice',
      displayName: 'Main',
      masked: '********',
      isUpdate: false,
    })
  })
  expect(screen.getByRole('button', { name: '保存账户' })).toBeTruthy()
  expect(screen.getByText(/alice/)).toBeTruthy()
  expect(document.body.textContent).not.toContain('secret')
  await act(async () => { screen.getByRole('button', { name: '保存账户' }).click() })
  expect(respondCapture).toHaveBeenCalledWith('capture-1', 'save')

  act(() => {
    capturePromptListener?.({
      captureId: 'capture-2',
      siteId: 'codeforces',
      siteName: 'Codeforces',
      username: 'alice',
      displayName: 'Main',
      masked: '********',
      isUpdate: true,
    })
  })
  expect(screen.getByRole('button', { name: '更新密码' })).toBeTruthy()
  await act(async () => { screen.getByRole('button', { name: '暂不保存' }).click() })
  expect(respondCapture).toHaveBeenCalledWith('capture-2', 'cancel')

  act(() => {
    captureResultListener?.({ captureId: 'capture-1', success: false, error: 'save-failed' })
  })
  expect(screen.getByText('凭据保存失败')).toBeTruthy()
})
