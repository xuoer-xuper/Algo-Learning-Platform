// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ProblemRecord } from '../../src/shared/types/problem'
import { DataRefreshProvider } from '../../src/context/DataRefreshContext'
import type { DataRefreshListener } from '../../src/context/data-refresh-context'
import { ProblemSidebar } from '../../src/features/problems/ProblemSidebar'
import { HomePage } from '../../src/features/home/HomePage'

const mocks = vi.hoisted(() => ({ recent: vi.fn<() => Promise<ProblemRecord[]>>() }))
vi.mock('../../src/features/problems/problemsApi', () => ({
  loadRecentProblems: () => mocks.recent(),
  setProblemSidebarWidth: vi.fn(),
}))
vi.mock('../../src/features/home/homeApi', () => ({
  loadHomeRecentProblems: () => mocks.recent(),
  loadHomeOverviewStats: async () => ({
    totalProblems: 3,
    todayVisited: 0,
    platformDistribution: [],
    lastActiveTime: null,
  }),
  loadHomeShortcuts: async () => [],
  loadHomeRecommendations: async () => [],
}))

const reason = '题目 ID 无效，无法打开笔记或详情；仍可访问原网站。'
const listeners = new Set<DataRefreshListener>()
function subscribe(listener: DataRefreshListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function problem(id: string | null, key: string, platform = 'codeforces'): ProblemRecord {
  return {
    id,
    platform,
    platform_problem_id: key,
    canonical_url: `https://example.test/${encodeURIComponent(key)}`,
    title: `Problem ${key}`,
    status: 'attempted',
    last_visited_at: null,
    submission_count: 3,
  }
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  listeners.clear()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('recent problem actions', () => {
  it('retains every invalid-ID row and site action, with disabled internal buttons and a visible accessible reason', async () => {
    const ids = [null, null, '', ' ', 'a b', 'a\tb', 'a\u0000b', 'a\u007fb', 'x'.repeat(201)]
    const rows = ids.map((id, index) => problem(id, `invalid-${index}`))
    mocks.recent.mockResolvedValue(rows)
    const onNavigate = vi.fn()
    const onShowNotes = vi.fn()
    const onShowDetail = vi.fn()
    render(
      <DataRefreshProvider subscribe={subscribe}>
        <ProblemSidebar
          onNavigate={onNavigate}
          onShowNotes={onShowNotes}
          onShowDetail={onShowDetail}
        />
      </DataRefreshProvider>,
    )
    await screen.findByText(`题库 (${rows.length})`)
    expect(screen.getAllByText(reason)).toHaveLength(rows.length)
    for (const row of rows) {
      const main = screen.getByRole('button', { name: `打开 ${row.title}；${reason}` })
      const item = main.parentElement
      if (!item) throw new Error('Missing sidebar item')
      const notes = within(item).getByRole<HTMLButtonElement>('button', { name: '本地笔记' })
      const detail = within(item).getByRole<HTMLButtonElement>('button', { name: '查看详情' })
      expect(notes.disabled).toBe(true)
      expect(detail.disabled).toBe(true)
      expect(within(item).getByText(reason).tagName).toBe('P')
      expect(within(item).getByText('3')).toBeTruthy()
      expect(main.querySelector('button')).toBeNull()
      fireEvent.click(notes)
      fireEvent.click(detail)
      fireEvent.keyDown(notes, { key: 'Enter' })
      fireEvent.keyDown(detail, { key: ' ' })
      fireEvent.click(main)
      fireEvent.keyDown(main, { key: 'Enter' })
      fireEvent.keyDown(main, { key: ' ' })
      expect(onNavigate).toHaveBeenLastCalledWith(row.canonical_url)
    }
    expect(onNavigate).toHaveBeenCalledTimes(rows.length * 3)
    expect(onShowNotes).not.toHaveBeenCalled()
    expect(onShowDetail).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each(['normal-id', 'x'.repeat(200), '\u200b', '\ud800', 'a:/?=&#%b'])(
    'preserves exact callbacks for currently accepted ID %j',
    async (id) => {
      const row = problem(id, 'valid')
      mocks.recent.mockResolvedValue([row])
      const onNavigate = vi.fn()
      const onShowNotes = vi.fn()
      const onShowDetail = vi.fn()
      render(
        <DataRefreshProvider subscribe={subscribe}>
          <ProblemSidebar
            onNavigate={onNavigate}
            onShowNotes={onShowNotes}
            onShowDetail={onShowDetail}
          />
        </DataRefreshProvider>,
      )
      const main = await screen.findByRole('button', { name: `打开 ${row.title}` })
      expect(screen.queryByText(reason)).toBeNull()
      const notes = screen.getByRole<HTMLButtonElement>('button', { name: '本地笔记' })
      const detail = screen.getByRole<HTMLButtonElement>('button', { name: '查看详情' })
      expect(notes.disabled).toBe(false)
      expect(detail.disabled).toBe(false)
      fireEvent.click(notes)
      fireEvent.click(detail)
      expect(onShowNotes).toHaveBeenCalledExactlyOnceWith(id)
      expect(onShowDetail).toHaveBeenCalledExactlyOnceWith(id)
      expect(onNavigate).not.toHaveBeenCalled()
      fireEvent.click(main)
      expect(onNavigate).toHaveBeenCalledExactlyOnceWith(row.canonical_url)
    },
  )

  it.each(['sidebar', 'home'] as const)(
    '%s retains distinct tuple identities through reorder and ID changes',
    async (surface) => {
      const first = problem(null, 'b:c', 'a')
      const second = problem(null, 'c', 'a:b')
      const third = problem('', 'ordinary')
      const rows = [first, second, third]
      mocks.recent.mockResolvedValue(rows)
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const onNavigate = vi.fn()
      const onShowDetail = vi.fn()
      render(
        <DataRefreshProvider subscribe={subscribe}>
          {surface === 'sidebar' ? (
            <ProblemSidebar
              onNavigate={onNavigate}
              onShowNotes={() => {}}
              onShowDetail={onShowDetail}
            />
          ) : (
            <HomePage onNavigate={onNavigate} />
          )}
        </DataRefreshProvider>,
      )
      const label = (row: ProblemRecord) =>
        surface === 'sidebar' && row.id !== 'now-valid'
          ? `打开 ${row.title}；${reason}`
          : `打开 ${row.title}`
      await screen.findByRole('button', { name: label(first) })
      const originals = rows.map((row) => screen.getByRole('button', { name: label(row) }))
      const selector = surface === 'sidebar' ? '.sidebar-item-main' : '.home-recent-item'
      originals[0].focus()
      mocks.recent.mockResolvedValue([third, second, { ...first, id: 'now-valid' }])
      act(() => {
        for (const listener of listeners) listener({ tables: ['problems'] })
      })
      await waitFor(() => {
        expect([...document.querySelectorAll(selector)]).toEqual([
          originals[2],
          originals[1],
          originals[0],
        ])
        expect(originals[0].getAttribute('aria-label')).toBe(`打开 ${first.title}`)
      })
      expect(document.activeElement).toBe(originals[0])
      for (let index = 0; index < rows.length; index += 1) {
        fireEvent.click(originals[index])
        expect(onNavigate).toHaveBeenLastCalledWith(rows[index].canonical_url)
      }
      if (surface === 'sidebar') {
        const item = originals[0].parentElement
        if (!item) throw new Error('Missing sidebar item')
        fireEvent.click(within(item).getByRole('button', { name: '查看详情' }))
        expect(onShowDetail).toHaveBeenCalledExactlyOnceWith('now-valid')
      }
      expect(error).not.toHaveBeenCalled()
    },
  )
})
