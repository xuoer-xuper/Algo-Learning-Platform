// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataRefreshProvider } from '../../src/context/DataRefreshContext'
import type { DataChangedPayload } from '../../src/shared/types/data'

const api = vi.hoisted(() => ({
  loadSites: vi.fn(),
  loadCredentialSummaries: vi.fn(),
  loadCookieSummaryForSite: vi.fn(),
  loadPrimaryCodeforcesAccount: vi.fn(),
  loadCodeforcesAccount: vi.fn(),
  syncCodeforcesRatingProfile: vi.fn(),
  getPendingUserScriptInstall: vi.fn(),
  getRemoteUserScriptInstallPreview: vi.fn(),
  cancelRemoteUserScriptInstall: vi.fn(),
  confirmRemoteUserScriptInstall: vi.fn(),
  loadMetricsBundle: vi.fn(),
  listNotesByProblem: vi.fn(),
  loadNote: vi.fn(),
  updateNoteTitle: vi.fn(),
}))
vi.mock('../../src/features/settings/settingsApi', () => api)
vi.mock('../../src/features/coach/coachDataApi', () => api)
vi.mock('../../src/features/problems/problemsApi', () => api)
vi.mock('../../src/hooks/browserShellApi', () => api)
vi.mock('../../src/features/problems/NoteEditorPane', () => ({
  NoteEditorPane: ({
    editorTitle,
    onTitleChange,
  }: {
    editorTitle: string
    onTitleChange: (value: string) => void
  }) => (
    <input
      aria-label="draft title"
      value={editorTitle}
      onChange={(event) => onTitleChange(event.target.value)}
    />
  ),
}))

import { CredentialsPage } from '../../src/features/settings/CredentialsPage'
import { CodeforcesSyncPanel } from '../../src/features/settings/CodeforcesSyncPanel'
import { UserScriptInstallPage } from '../../src/features/scripts/UserScriptInstallPage'
import { CoachMetricsView } from '../../src/features/coach/CoachMetricsView'
import { NotePanelModal } from '../../src/features/problems/NotePanelModal'
import { MOCK_METRICS_BUNDLE } from '../../src/features/coach/mockMetricsBundle'

let listener: (payload: DataChangedPayload) => void
const subscribe = (handler: typeof listener) => {
  listener = handler
  return () => {}
}
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DataRefreshProvider subscribe={subscribe}>{children}</DataRefreshProvider>
)

beforeEach(() => {
  vi.clearAllMocks()
  api.loadSites.mockResolvedValue([{ id: 'cf', name: 'Codeforces', domains: ['codeforces.com'] }])
  api.loadCredentialSummaries.mockResolvedValue([
    {
      credentialId: 'one',
      siteId: 'cf',
      username: 'alice',
      displayName: 'Primary',
      lastUsedAt: null,
    },
  ])
  api.loadCookieSummaryForSite.mockResolvedValue({ has_cookies: false })
  api.loadPrimaryCodeforcesAccount.mockResolvedValue({
    handle: 'alice',
    current_rating: 1400,
    peak_rating: 1500,
  })
  api.loadMetricsBundle.mockResolvedValue(MOCK_METRICS_BUNDLE)
  api.updateNoteTitle.mockResolvedValue(true)
})
afterEach(cleanup)

describe('data refresh surfaces', () => {
  it('should hide stale install actions when revalidation fails', async () => {
    api.getPendingUserScriptInstall.mockResolvedValue({
      sourceUrl: 'https://example.test/demo.user.js',
      sourceFileName: 'demo.user.js',
    })
    api.getRemoteUserScriptInstallPreview
      .mockResolvedValueOnce({
        name: 'Demo',
        finalUrl: 'https://example.test/demo.user.js',
        action: 'create',
        versionComparison: 'newer',
        matches: [],
        includes: [],
        excludes: [],
        excludeMatches: [],
        grants: [],
        connects: [],
        antifeatures: [],
        requires: 0,
        resources: [],
      })
      .mockRejectedValueOnce(new Error('network down'))
    api.confirmRemoteUserScriptInstall.mockResolvedValue({ status: 'stale' })
    render(<UserScriptInstallPage installId="stale" onClose={() => {}} />, { wrapper })
    fireEvent.click(await screen.findByRole('button', { name: '安装脚本' }))
    await screen.findByText('读取远程脚本失败，请稍后重试。')
    expect(screen.queryByRole('button', { name: '安装脚本' })).toBeNull()
    expect(screen.queryByText('本地脚本状态已变化，安装信息已刷新，请重新确认。')).toBeNull()
    expect((screen.getByRole('button', { name: '取消并关闭' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('should expose source and cancellation while remote script preview is pending', async () => {
    api.getPendingUserScriptInstall.mockResolvedValue({
      sourceUrl: 'https://example.test/demo.user.js',
      sourceFileName: 'demo.user.js',
    })
    api.getRemoteUserScriptInstallPreview.mockReturnValue(new Promise(() => {}))
    api.cancelRemoteUserScriptInstall.mockResolvedValue(true)
    const close = vi.fn()
    render(<UserScriptInstallPage installId="pending" onClose={close} />, { wrapper })
    await screen.findByText('demo.user.js')
    expect(screen.queryByText('正在读取安装请求')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '取消并关闭' }))
    await waitFor(() => expect(api.cancelRemoteUserScriptInstall).toHaveBeenCalledWith('pending'))
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  })

  it.each(['credentials', 'sync'])(
    'should keep a newly synced second account selected after background refresh in %s',
    async (surface) => {
      const second = {
        id: 'b',
        platform: 'codeforces',
        handle: 'bob',
        current_rating: 2100,
        peak_rating: 2200,
      }
      api.syncCodeforcesRatingProfile.mockResolvedValue({
        result: { success: true, data: { peak: 2200 } },
        account: second,
      })
      api.loadCodeforcesAccount.mockResolvedValue(second)
      render(
        surface === 'credentials' ? (
          <CredentialsPage onClose={() => {}} />
        ) : (
          <CodeforcesSyncPanel onStatsRefresh={() => {}} />
        ),
        { wrapper },
      )
      const input = screen.getAllByPlaceholderText('Codeforces Handle')[0] as HTMLInputElement
      await waitFor(() => expect(input.value).toBe('alice'))
      fireEvent.change(input, { target: { value: 'bob' } })
      fireEvent.click(
        screen.getByRole('button', {
          name: surface === 'credentials' ? '绑定并同步' : '同步 Rating',
        }),
      )
      await waitFor(() => expect(api.loadCodeforcesAccount).toHaveBeenCalledWith('bob'))
      await waitFor(() => expect(document.body.textContent).toContain('2100'))
      api.loadCodeforcesAccount.mockResolvedValue({ ...second, current_rating: 2300 })
      act(() => listener({ tables: ['stats'] }))
      await waitFor(() => expect(document.body.textContent).toContain('2300'))
      expect(input.value).toBe('bob')
      expect(document.body.textContent).not.toContain('1400')
    },
  )

  it('should retain credentials and editable drafts without skeletons during refresh', async () => {
    render(<CredentialsPage onClose={() => {}} />, { wrapper })
    expect(screen.getByText('平台登录态读取中')).toBeTruthy()
    await screen.findByText('Primary')
    fireEvent.change(screen.getByPlaceholderText('Codeforces Handle'), {
      target: { value: 'draft' },
    })
    fireEvent.click(screen.getByTitle('重命名账户'))
    fireEvent.change(screen.getByPlaceholderText('账户名称'), { target: { value: 'unsaved name' } })
    let finish!: (value: unknown[]) => void
    api.loadCredentialSummaries.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    act(() => listener({ tables: ['credentials'] }))
    await waitFor(() => expect(api.loadCredentialSummaries).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('平台登录态读取中')).toBeNull()
    expect(screen.getByText('Primary')).toBeTruthy()
    await act(async () => {
      finish([
        {
          credentialId: 'one',
          siteId: 'cf',
          username: 'alice',
          displayName: 'Updated',
          lastUsedAt: null,
        },
      ])
    })
    expect(await screen.findByText('Updated')).toBeTruthy()
    expect((screen.getByPlaceholderText('Codeforces Handle') as HTMLInputElement).value).toBe(
      'draft',
    )
    expect((screen.getByPlaceholderText('账户名称') as HTMLInputElement).value).toBe('unsaved name')
  })

  it('should retain coach metrics during refetch and keep mock mode independent', async () => {
    const emptyBundle = {
      since: 0,
      until: 0,
      events: [],
      interventions: [],
      feedback: [],
      problem_ac_status: [],
    }
    api.loadMetricsBundle.mockResolvedValue(emptyBundle)
    render(<CoachMetricsView onClose={() => {}} />, { wrapper })
    expect(screen.getByText('指标加载中')).toBeTruthy()
    await screen.findByText('提示展示数')
    let finish!: (value: typeof emptyBundle) => void
    api.loadMetricsBundle.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    act(() => listener({ tables: ['coach'] }))
    expect(screen.queryByText('指标加载中')).toBeNull()
    expect(screen.getByText('提示展示数')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '加载模拟数据' }))
    await act(async () => {
      finish(emptyBundle)
    })
    expect(screen.getByText('模拟数据')).toBeTruthy()
    const calls = api.loadMetricsBundle.mock.calls.length
    act(() => listener({ tables: ['coach'] }))
    expect(api.loadMetricsBundle).toHaveBeenCalledTimes(calls)
    fireEvent.click(screen.getByRole('button', { name: '恢复真实数据' }))
    await waitFor(() => expect(screen.queryByText('模拟数据')).toBeNull())
    await waitFor(() => expect(api.loadMetricsBundle).toHaveBeenCalledTimes(calls + 1))
  })

  it('should refresh note lists without replacing an unsaved active title', async () => {
    const note = {
      id: 'note',
      title: 'Saved title',
      content: 'body',
      note_type: 'solution',
      updated_at: 0,
    }
    api.listNotesByProblem.mockResolvedValue([note])
    api.loadNote.mockResolvedValue(note)
    render(<NotePanelModal problemId="problem" onClose={() => {}} />, { wrapper })
    fireEvent.click(await screen.findByText('Saved title'))
    await waitFor(() =>
      expect((screen.getByLabelText('draft title') as HTMLInputElement).value).toBe('Saved title'),
    )
    fireEvent.change(screen.getByLabelText('draft title'), { target: { value: 'unsaved draft' } })
    api.listNotesByProblem.mockResolvedValue([{ ...note, title: 'External title' }])
    act(() => listener({ tables: ['notes'] }))
    await screen.findByText('External title')
    expect((screen.getByLabelText('draft title') as HTMLInputElement).value).toBe('unsaved draft')
    expect(api.loadNote).toHaveBeenCalledTimes(1)
  })
})
