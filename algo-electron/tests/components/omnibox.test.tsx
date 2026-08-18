// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const shellApi = vi.hoisted(() => ({
  getBrowserOmniboxSuggestions: vi.fn(),
  setBrowserOmniboxOpen: vi.fn(),
  showBrowserAppMenu: vi.fn(),
  subscribeUiCommand: vi.fn(),
  uiCommandListener: null as ((command: UiCommand) => void) | null,
  unsubscribe: vi.fn(),
}))

vi.mock('../../src/hooks/browserShellApi', () => shellApi)

import { BrowserToolbar } from '../../src/components/BrowserToolbar'
import { OmniboxSuggestionsPanel } from '../../src/components/Omnibox'
import { useOmnibox } from '../../src/components/useOmnibox'

const historySuggestion: OmniboxSuggestion = {
  problemId: 'problem-1',
  title: 'Two Sum',
  platform: 'leetcode-cn',
  platformProblemId: '1',
  url: 'https://leetcode.cn/problems/two-sum/',
  lastVisitedAt: '2026-08-18T10:00:00+08:00',
  source: 'history',
}

const problemSuggestion: OmniboxSuggestion = {
  problemId: 'problem-2',
  title: 'Shortest Path',
  platform: 'codeforces',
  platformProblemId: '20C',
  url: 'https://codeforces.com/problemset/problem/20/C',
  lastVisitedAt: null,
  source: 'problem',
}

interface HarnessProps {
  activeUrl?: string
  onNavigate?: (input: string) => void
  onHome?: () => void
  onBack?: () => void
  onForward?: () => void
  onReload?: () => void
  onSyncPage?: () => void
}

function Harness({
  activeUrl = 'https://example.com/active',
  onNavigate = () => {},
  onHome = () => {},
  onBack = () => {},
  onForward = () => {},
  onReload = () => {},
  onSyncPage = () => {},
}: HarnessProps) {
  const { inputRef, controller } = useOmnibox({ activeUrl, onNavigate })
  return (
    <>
      <BrowserToolbar
        omnibox={controller}
        omniboxInputRef={inputRef}
        syncMsg=""
        onHome={onHome}
        onBack={onBack}
        onForward={onForward}
        onReload={onReload}
        onSyncPage={onSyncPage}
      />
      {controller.open && <OmniboxSuggestionsPanel controller={controller} />}
    </>
  )
}

async function advanceDebounce(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(140)
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  shellApi.uiCommandListener = null
  shellApi.getBrowserOmniboxSuggestions.mockResolvedValue([historySuggestion, problemSuggestion])
  shellApi.subscribeUiCommand.mockImplementation((listener: (command: UiCommand) => void) => {
    shellApi.uiCommandListener = listener
    return shellApi.unsubscribe
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('Omnibox', () => {
  it('keeps the draft separate from active URL updates and restores on blur', () => {
    const { rerender } = render(<Harness />)
    const input = screen.getByRole('combobox', { name: '地址和搜索栏' }) as HTMLInputElement

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'draft query' } })
    rerender(<Harness activeUrl="https://example.com/new-active" />)
    expect(input.value).toBe('draft query')

    fireEvent.blur(input)
    expect(input.value).toBe('https://example.com/new-active')
    expect(shellApi.setBrowserOmniboxOpen).toHaveBeenCalledWith(true)
    expect(shellApi.setBrowserOmniboxOpen).toHaveBeenLastCalledWith(false)
  })

  it('debounces empty queries and ignores stale suggestion responses', async () => {
    const resolvers: Array<(suggestions: OmniboxSuggestion[]) => void> = []
    shellApi.getBrowserOmniboxSuggestions.mockImplementation(() => new Promise((resolve) => {
      resolvers.push(resolve)
    }))
    render(<Harness />)
    const input = screen.getByRole('combobox')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByText('正在加载建议...')).not.toBeNull()
    expect(screen.queryByText('暂无本地建议')).toBeNull()
    expect(screen.getByRole('listbox').getAttribute('aria-busy')).toBe('true')
    await advanceDebounce()
    expect(shellApi.getBrowserOmniboxSuggestions).toHaveBeenLastCalledWith('')

    fireEvent.change(input, { target: { value: 'newer' } })
    await advanceDebounce()
    expect(shellApi.getBrowserOmniboxSuggestions).toHaveBeenLastCalledWith('newer')

    await act(async () => {
      resolvers[1]([problemSuggestion])
      await Promise.resolve()
    })
    expect(screen.getByRole('listbox').getAttribute('aria-busy')).toBe('false')
    expect(screen.getByRole('option', { name: /Shortest Path/ })).not.toBeNull()

    await act(async () => {
      resolvers[0]([historySuggestion])
      await Promise.resolve()
    })
    expect(screen.queryByRole('option', { name: /Two Sum/ })).toBeNull()
  })

  it('supports combobox keyboard navigation while ignoring IME Enter', async () => {
    const onNavigate = vi.fn()
    render(<Harness onNavigate={onNavigate} />)
    const input = screen.getByRole('combobox')

    act(() => input.focus())
    await advanceDebounce()
    expect(input.getAttribute('aria-controls')).toBe('omnibox-suggestions-listbox')
    expect(screen.getByRole('listbox')).not.toBeNull()

    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onNavigate).not.toHaveBeenCalled()
    fireEvent.compositionEnd(input)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe('omnibox-suggestion-0')
    expect(screen.getByRole('option', { name: /Two Sum/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onNavigate).toHaveBeenCalledWith(historySuggestion.url)
    expect(shellApi.setBrowserOmniboxOpen).toHaveBeenLastCalledWith(false)
  })

  it('submits a pointer suggestion before blur and Escape restores the active URL', async () => {
    const onNavigate = vi.fn()
    render(<Harness onNavigate={onNavigate} />)
    const input = screen.getByRole('combobox')

    fireEvent.focus(input)
    await advanceDebounce()
    const suggestion = screen.getByRole('option', { name: /Shortest Path/ })
    expect((suggestion as HTMLButtonElement).tabIndex).toBe(-1)
    fireEvent.pointerDown(suggestion, { button: 2 })
    expect(onNavigate).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).not.toBeNull()

    fireEvent.pointerDown(suggestion, { button: 0 })
    expect(onNavigate).toHaveBeenCalledWith(problemSuggestion.url)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(shellApi.setBrowserOmniboxOpen).toHaveBeenLastCalledWith(false)

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'temporary' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect((input as HTMLInputElement).value).toBe('https://example.com/active')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('focuses and selects from the Ctrl+L UI command and clears main state on unmount', () => {
    const { unmount } = render(<Harness />)
    const input = screen.getByRole('combobox') as HTMLInputElement
    const selectSpy = vi.spyOn(input, 'select')

    act(() => shellApi.uiCommandListener?.({ type: 'focus-address-bar' }))
    expect(document.activeElement).toBe(input)
    expect(selectSpy).toHaveBeenCalledOnce()

    unmount()
    expect(shellApi.unsubscribe).toHaveBeenCalledOnce()
    expect(shellApi.setBrowserOmniboxOpen).toHaveBeenLastCalledWith(false)
  })

  it('anchors the native app menu to integer coordinates below the more button', () => {
    render(<Harness />)
    const more = screen.getByRole('button', { name: '更多' })
    vi.spyOn(more, 'getBoundingClientRect').mockReturnValue({
      x: 10.4,
      y: 11.2,
      left: 10.4,
      right: 42.4,
      top: 11.2,
      bottom: 39.6,
      width: 32,
      height: 28.4,
      toJSON: () => ({}),
    })

    fireEvent.click(more)
    expect(shellApi.showBrowserAppMenu).toHaveBeenCalledWith({ x: 10, y: 40 })
  })

  it('keeps the browser navigation and capture controls in the condensed toolbar', () => {
    const onHome = vi.fn()
    const onBack = vi.fn()
    const onForward = vi.fn()
    const onReload = vi.fn()
    const onSyncPage = vi.fn()

    render(
      <Harness
        onHome={onHome}
        onBack={onBack}
        onForward={onForward}
        onReload={onReload}
        onSyncPage={onSyncPage}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '首页' }))
    fireEvent.click(screen.getByRole('button', { name: '后退' }))
    fireEvent.click(screen.getByRole('button', { name: '前进' }))
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    fireEvent.click(screen.getByRole('button', { name: '抓取当前页面提交记录' }))

    expect(onHome).toHaveBeenCalledOnce()
    expect(onBack).toHaveBeenCalledOnce()
    expect(onForward).toHaveBeenCalledOnce()
    expect(onReload).toHaveBeenCalledOnce()
    expect(onSyncPage).toHaveBeenCalledOnce()
  })
})
