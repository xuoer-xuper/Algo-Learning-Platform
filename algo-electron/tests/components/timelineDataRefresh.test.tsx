// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataRefreshProvider } from '../../src/context/DataRefreshContext'
import type { DataChangedPayload } from '../../src/shared/types/data'
import type { ProblemTimelineData } from '../../src/shared/types/coach'

const api = vi.hoisted(() => ({ loadProblemTimeline: vi.fn() }))
vi.mock('../../src/features/coach/coachDataApi', () => api)

import { SessionTimelineView } from '../../src/features/coach/SessionTimelineView'

afterEach(() => {
  cleanup()
  api.loadProblemTimeline.mockReset()
})

function timeline(problemId: string): ProblemTimelineData {
  return {
    problem_id: problemId,
    platform: 'codeforces',
    platform_problem_id: '1000A',
    title: `Timeline ${problemId}`,
    canonical_url: 'https://codeforces.com/problemset/problem/1000/A',
    status: 'visited',
    first_seen_at: Date.parse('2026-11-04T10:00:00'),
    last_visited_at: Date.parse('2026-11-04T10:00:00'),
    visits: [],
    submissions: [],
    events: [],
    interventions: [],
    first_ac_at: null,
    last_activity_at: null,
  }
}

describe('timeline refresh errors', () => {
  it('should keep loaded timeline content after refetch failure and clear it on identity change', async () => {
    let notify: (payload: DataChangedPayload) => void = () => {}
    const subscribe = (listener: typeof notify) => {
      notify = listener
      return () => {}
    }
    api.loadProblemTimeline.mockResolvedValueOnce(timeline('first'))
    const view = (problemId: string) => (
      <DataRefreshProvider subscribe={subscribe}>
        <SessionTimelineView problemId={problemId} onClose={() => {}} />
      </DataRefreshProvider>
    )
    const { rerender } = render(view('first'))
    await screen.findByText('时间轴复盘 · Timeline first')

    api.loadProblemTimeline.mockRejectedValueOnce(new Error('refresh unavailable'))
    act(() => notify({ tables: ['coach'] }))
    expect((await screen.findByRole('alert')).textContent).toContain('refresh unavailable')
    expect(screen.getByText('时间轴复盘 · Timeline first')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()

    let finish: (value: ProblemTimelineData) => void = () => {}
    api.loadProblemTimeline.mockImplementationOnce(
      () =>
        new Promise<ProblemTimelineData>((resolve) => {
          finish = resolve
        }),
    )
    rerender(view('second'))
    expect(screen.queryByText('时间轴复盘 · Timeline first')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('时间轴加载中')
    await act(async () => {
      finish(timeline('second'))
    })
    expect(await screen.findByText('时间轴复盘 · Timeline second')).toBeTruthy()
  })

  it('should show an error rather than an empty timeline when the initial read fails', async () => {
    api.loadProblemTimeline.mockRejectedValueOnce(new Error('initial unavailable'))
    render(
      <DataRefreshProvider subscribe={() => () => {}}>
        <SessionTimelineView problemId="first" onClose={() => {}} />
      </DataRefreshProvider>,
    )
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('initial unavailable'),
    )
    expect(screen.queryByText('未找到该题目的时间轴数据。')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
