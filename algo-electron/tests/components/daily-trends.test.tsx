// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TrendPanel } from '../../src/features/analytics/TrendPanel'
import { loadDashboardTrends } from '../../src/features/analytics/analyticsApi'
import type { TrendPoint } from '../../src/shared/types/stats'

const missingDay = '\u65e5\u671f\u7f3a\u5931'
const visited: TrendPoint[] = [
  { local_day: null, count: 11 },
  { local_day: null, count: 22 },
  { local_day: '2026-11-19', count: 33 },
  { local_day: '2026-11-20', count: 44 },
]
const accepted: TrendPoint[] = [
  { local_day: null, count: 7 },
  { local_day: null, count: 5 },
  { local_day: '2026-11-18', count: 3 },
  { local_day: '2026-11-20', count: 1 },
]

beforeEach(() => {
  // Supply only the missing jsdom layout API; Recharts and its selectors remain real.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.id === 'recharts_measurement_span'
      ? new DOMRect(0, 0, (this.textContent?.length ?? 0) * 7, 14)
      : new DOMRect(0, 0, 800, 180)
  })
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
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function chartRows(chart: Element, points: TrendPoint[]) {
  await waitFor(() =>
    expect(chart.querySelectorAll('.recharts-line-dot')).toHaveLength(points.length),
  )
  const xs = Array.from(chart.querySelectorAll('.recharts-line-dot'), (dot) =>
    Number(dot.getAttribute('cx')),
  )
  expect(xs.every(Number.isFinite)).toBe(true)
  expect(new Set(xs).size).toBe(points.length)
  for (let index = 1; index < xs.length; index += 1)
    expect(xs[index]).toBeGreaterThan(xs[index - 1])
  fireEvent.focus(chart)
  for (const [index, point] of points.entries()) {
    if (index > 0) fireEvent.keyDown(chart, { key: 'ArrowRight' })
    await waitFor(() => {
      expect(chart.querySelector('.recharts-tooltip-label')?.textContent).toBe(
        point.local_day ?? missingDay,
      )
      expect(chart.querySelector('.recharts-tooltip-item-value')?.textContent).toBe(
        String(point.count),
      )
    })
  }
  fireEvent.blur(chart)
}

function charts(container: HTMLElement) {
  const result = Array.from(container.querySelectorAll('.recharts-wrapper'))
  expect(result).toHaveLength(2)
  return result
}

function panel(visitedTrend: TrendPoint[], acTrend: TrendPoint[], onChange = vi.fn()) {
  return (
    <TrendPanel
      visitedTrend={visitedTrend}
      acTrend={acTrend}
      trendRange={undefined}
      onTrendRangeChange={onChange}
    />
  )
}

describe('daily trends with real Recharts', () => {
  it('keeps two NULL rows and real dates at independent coordinates with matching counts and labels', async () => {
    const originalVisited = structuredClone(visited)
    const originalAc = structuredClone(accepted)
    const { container } = render(panel(visited, accepted))
    const [visitChart, acChart] = charts(container)
    await chartRows(visitChart, visited)
    await chartRows(acChart, accepted)
    expect(visitChart.querySelector('.recharts-xAxis-tick-labels')?.textContent).toContain('11-19')
    expect(acChart.querySelector('.recharts-xAxis-tick-labels')?.textContent).toContain('11-18')
    expect(visited).toEqual(originalVisited)
    expect(accepted).toEqual(originalAc)
  })

  it.each([
    [
      'all null',
      [
        { local_day: null, count: 6 },
        { local_day: null, count: 9 },
      ],
    ],
    ['zero singleton', [{ local_day: null, count: 0 }]],
    [
      'valid only',
      [
        { local_day: '2026-11-19', count: 3 },
        { local_day: '2026-11-20', count: 8 },
      ],
    ],
    [
      'raw strings',
      [
        { local_day: '', count: 1 },
        { local_day: 'bad', count: 2 },
        { local_day: missingDay, count: 3 },
        { local_day: 'not-a-calendar-day', count: 4 },
      ],
    ],
  ] satisfies Array<[string, TrendPoint[]]>)(
    'preserves %s rows without coercing labels',
    async (_name, points) => {
      const { container } = render(panel(points, points))
      for (const chart of charts(container)) await chartRows(chart, points)
    },
  )

  it('uses fresh arrays after reorder/refetch and removes stale tooltips when empty', async () => {
    const { container, rerender } = render(panel(visited, accepted))
    await chartRows(charts(container)[0], visited)
    const reordered = [...visited].reverse()
    rerender(panel(reordered, [...accepted].reverse()))
    const chart = charts(container)[0]
    fireEvent.focus(chart)
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    await waitFor(() => {
      expect(chart.querySelector('.recharts-tooltip-label')?.textContent).toBe(missingDay)
      expect(chart.querySelector('.recharts-tooltip-item-value')?.textContent).toBe('22')
    })
    rerender(panel([], []))
    expect(container.querySelectorAll('.recharts-wrapper')).toHaveLength(0)
    expect(container.querySelectorAll('.recharts-tooltip-wrapper')).toHaveLength(0)
    rerender(panel([{ local_day: null, count: 0 }], [{ local_day: 'new-day', count: 17 }]))
    await chartRows(charts(container)[0], [{ local_day: null, count: 0 }])
    await chartRows(charts(container)[1], [{ local_day: 'new-day', count: 17 }])
  })

  it('keeps the existing range callbacks when no chart data is present', () => {
    const change = vi.fn()
    render(panel([], [], change))
    for (const label of ['7\u5929', '30\u5929', '\u5168\u90e8'])
      fireEvent.click(screen.getByRole('button', { name: label }))
    expect(change.mock.calls).toEqual([[7], [30], [undefined]])
  })
})

describe('unchanged dashboard trend loader', () => {
  it('retains original All arrays and only fills canonical local days for finite windows', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 20, 12), toFake: ['Date'] })
    const raw = [
      ...visited,
      { local_day: '', count: 99 },
      { local_day: 'bad', count: 88 },
      { local_day: '2099-01-01', count: 77 },
    ]
    const getVisitedTrend = vi.fn(async () => raw)
    const getAcTrend = vi.fn(async () => accepted)
    vi.stubGlobal('api', { stats: { getVisitedTrend, getAcTrend } })
    const all = await loadDashboardTrends(undefined)
    expect(all.visitedTrend).toBe(raw)
    expect(all.acTrend).toBe(accepted)
    for (const days of [1, 7, 30]) {
      const finite = await loadDashboardTrends(days)
      expect(finite.visitedTrend).toHaveLength(days)
      expect(finite.acTrend).toHaveLength(days)
      expect(finite.visitedTrend.at(-1)).toEqual({ local_day: '2026-11-20', count: 44 })
      expect(finite.acTrend.at(-1)).toEqual({ local_day: '2026-11-20', count: 1 })
      expect(
        finite.visitedTrend.every(
          ({ local_day }) => typeof local_day === 'string' && /^2026-\d{2}-\d{2}$/.test(local_day),
        ),
      ).toBe(true)
      expect(finite.visitedTrend.reduce((total, row) => total + row.count, 0)).toBe(
        days === 1 ? 44 : 77,
      )
    }
    expect(getVisitedTrend.mock.calls).toEqual([[undefined], [1], [7], [30]])
    expect(getAcTrend.mock.calls).toEqual([[undefined], [1], [7], [30]])
    expect((await loadDashboardTrends(undefined)).visitedTrend).toBe(raw)
  })
})
