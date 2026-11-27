// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DashboardListsPanel } from '../../src/features/analytics/DashboardListsPanel'
import type {
  DashboardProblemListItem,
  DashboardTimelineEvent,
} from '../../src/features/analytics/types'
import { formatForDisplay } from '../../src/shared/time'

const emptyProps: ComponentProps<typeof DashboardListsPanel> = {
  timeline: [],
  wrongProblems: [],
  unreviewed: [],
  revisits: [],
  onNavigate: () => {},
}
const problemLists: Array<'wrongProblems' | 'unreviewed'> = ['wrongProblems', 'unreviewed']

function problem(
  id: DashboardProblemListItem['id'],
  platform: string,
  platformProblemId: string,
  title: string,
): DashboardProblemListItem {
  return {
    id,
    platform,
    platform_problem_id: platformProblemId,
    title,
    canonical_url: `https://example.test/${title}?source=dashboard#statement`,
    wrong_count: 0,
    days_since: 31,
  }
}

function timelineRow(eventType: string): HTMLElement {
  const row = screen.getByText(eventType).closest<HTMLElement>('.dashboard-timeline-item')
  if (!row) throw new Error(`Missing timeline row: ${eventType}`)
  return row
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Dashboard insight problem identity and URL actions', () => {
  it.each(problemLists)(
    '%s retains every nullable/empty/identified row with tuple identity, focus and URL actions',
    (list) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const first = problem(null, 'a', 'b:c', 'first')
      const second = problem(null, 'a:b', 'c', 'second')
      const third = problem('', 'a,"b', 'c:d', 'empty-id')
      const fourth = problem('0', '', '', 'identified')
      const rows = [first, second, third, fourth]
      const onNavigate = vi.fn()
      const props = { ...emptyProps, [list]: rows, onNavigate }
      const { container, rerender } = render(<DashboardListsPanel {...props} />)
      const originals = rows.map((row) => screen.getByRole('button', { name: `打开 ${row.title}` }))
      expect(screen.getAllByRole('button')).toHaveLength(4)
      expect(container.querySelectorAll('.dashboard-list-count').length).toBe(4)
      for (const count of container.querySelectorAll('.dashboard-list-count')) {
        expect(count.textContent).toBe(list === 'wrongProblems' ? '0 次' : '31 天前')
      }
      for (const [index, row] of rows.entries()) {
        const element = originals[index]
        expect(element.tabIndex).toBe(0)
        expect(element.getAttribute('aria-disabled')).not.toBe('true')
        fireEvent.click(element)
        expect(onNavigate).toHaveBeenLastCalledWith(row.canonical_url)
        fireEvent.keyDown(element, { key: 'Enter' })
        expect(onNavigate).toHaveBeenLastCalledWith(row.canonical_url)
        fireEvent.keyDown(element, { key: ' ' })
        expect(onNavigate).toHaveBeenLastCalledWith(row.canonical_url)
      }
      expect(onNavigate.mock.calls).toEqual(
        rows.flatMap((row) => Array.from({ length: 3 }, () => [row.canonical_url])),
      )

      originals[0].focus()
      const updatedFirst = {
        ...first,
        id: 'changed-local-id',
        canonical_url: 'https://example.test/updated-first',
      }
      const reordered = [fourth, third, second, updatedFirst]
      rerender(<DashboardListsPanel {...props} {...{ [list]: reordered }} />)
      const rendered = [...container.querySelectorAll('.dashboard-list-item')]
      expect(rendered).toHaveLength(4)
      for (const [index, original] of [...originals].reverse().entries()) {
        expect(rendered[index]).toBe(original)
      }
      expect(document.activeElement).toBe(originals[0])
      onNavigate.mockClear()
      for (const row of reordered) {
        const element = screen.getByRole('button', { name: `打开 ${row.title}` })
        fireEvent.click(element)
        fireEvent.keyDown(element, { key: 'Enter' })
        fireEvent.keyDown(element, { key: ' ' })
      }
      expect(onNavigate.mock.calls).toEqual(
        reordered.flatMap((row) => Array.from({ length: 3 }, () => [row.canonical_url])),
      )
      expect(error).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    },
  )

  it('retains empty-string revisit identity and canonical URL actions on reorder', () => {
    const rows = ['', '0'].map((problem_id, index) => ({
      problem_id,
      platform: 'codeforces',
      platform_problem_id: `revisit-${index}`,
      title: `revisit-${index}`,
      canonical_url: `https://example.test/revisit-${index}`,
      visit_count: index + 2,
    }))
    const onNavigate = vi.fn()
    const { rerender } = render(
      <DashboardListsPanel {...emptyProps} revisits={rows} onNavigate={onNavigate} />,
    )
    const originals = rows.map((row) => screen.getByRole('button', { name: `打开 ${row.title}` }))
    originals[0].focus()
    rerender(
      <DashboardListsPanel {...emptyProps} revisits={[rows[1], rows[0]]} onNavigate={onNavigate} />,
    )
    const rendered = screen.getAllByRole('button')
    expect(rendered).toHaveLength(2)
    expect(rendered[0]).toBe(originals[1])
    expect(rendered[1]).toBe(originals[0])
    expect(document.activeElement).toBe(originals[0])
    for (const [index, row] of rows.entries()) {
      fireEvent.click(originals[index])
      fireEvent.keyDown(originals[index], { key: 'Enter' })
      fireEvent.keyDown(originals[index], { key: ' ' })
      expect(onNavigate).toHaveBeenLastCalledWith(row.canonical_url)
    }
    expect(onNavigate.mock.calls).toEqual(
      rows.flatMap((row) => Array.from({ length: 3 }, () => [row.canonical_url])),
    )
  })
})

describe('Dashboard insight timeline identity and loading states', () => {
  it('separates anonymous index zero, real "0" and empty IDs while retaining identified nodes', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const first: DashboardTimelineEvent = {
      id: null,
      event_type: 'anonymous-first',
      occurred_at: 0,
    }
    const second: DashboardTimelineEvent = { id: null, event_type: 'anonymous-second' }
    const zero: DashboardTimelineEvent = { id: '0', event_type: 'identified-zero' }
    const empty: DashboardTimelineEvent = { id: '', event_type: 'identified-empty' }
    const absent: DashboardTimelineEvent = { event_type: 'anonymous-absent-id' }
    const timeline = [first, second, zero, empty, absent]
    const { container, rerender } = render(
      <DashboardListsPanel {...emptyProps} timeline={timeline} />,
    )
    const originals = timeline.map((row) => timelineRow(row.event_type))
    expect(container.querySelectorAll('.dashboard-timeline-item')).toHaveLength(5)
    expect(screen.getByText(formatForDisplay(0))).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()

    rerender(
      <DashboardListsPanel {...emptyProps} timeline={[first, empty, second, zero, absent]} />,
    )
    expect(timelineRow(zero.event_type)).toBe(originals[2])
    expect(timelineRow(empty.event_type)).toBe(originals[3])
    expect(container.querySelectorAll('.dashboard-timeline-item')).toHaveLength(5)
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps anonymous identity positional rather than inventing a stable event ID', () => {
    const first: DashboardTimelineEvent = { id: null, event_type: 'first-anonymous' }
    const second: DashboardTimelineEvent = { id: null, event_type: 'second-anonymous' }
    const identified: DashboardTimelineEvent = { id: 'event', event_type: 'identified' }
    const { rerender } = render(
      <DashboardListsPanel {...emptyProps} timeline={[first, second, identified]} />,
    )
    const firstPosition = timelineRow(first.event_type)
    const secondPosition = timelineRow(second.event_type)
    const identifiedNode = timelineRow(identified.event_type)
    rerender(<DashboardListsPanel {...emptyProps} timeline={[second, first, identified]} />)
    expect(timelineRow(second.event_type)).toBe(firstPosition)
    expect(timelineRow(first.event_type)).toBe(secondPosition)
    expect(timelineRow(identified.event_type)).toBe(identifiedNode)
  })

  it('distinguishes not-yet-loaded null lists from four loaded empty arrays', () => {
    const { rerender } = render(
      <DashboardListsPanel
        {...emptyProps}
        timeline={null}
        wrongProblems={null}
        unreviewed={null}
        revisits={null}
      />,
    )
    expect(screen.getAllByRole('status')).toHaveLength(4)
    expect(screen.queryByText('暂无数据')).toBeNull()
    rerender(<DashboardListsPanel {...emptyProps} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getAllByText('暂无数据')).toHaveLength(4)
  })
})
