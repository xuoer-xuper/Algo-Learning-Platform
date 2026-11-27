import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, initDbAtPath } from '../../electron/db/connection'
import {
  AI_CONTEXT_VERSION,
  exportAIContext,
  renderContextAsMarkdown,
} from '../../electron/ai/contextExporter'
import { getPeriodSummary, renderSummaryAsMarkdown } from '../../electron/ai/summary/periodSummary'
import {
  attachParsedContext,
  buildAIContextSnapshotRecord,
} from '../../electron/db/repositories/aiContextSnapshot/serialization'
import type {
  getDailyActiveStats,
  getStreakDays,
  getTimeline,
  getUnreviewedProblems,
  getWrongProblems,
} from '../../electron/db/repositories/statsRepository'
import type {
  getSnapshotByDate,
  listSnapshots,
} from '../../electron/db/repositories/aiContextSnapshotRepository'
import { formatForDisplay } from '../../src/shared/time'

const mocks = vi.hoisted(() => ({
  daily: vi.fn<typeof getDailyActiveStats>(),
  streak: vi.fn<typeof getStreakDays>(),
  timeline: vi.fn<typeof getTimeline>(),
  wrong: vi.fn<typeof getWrongProblems>(),
  unreviewed: vi.fn<typeof getUnreviewedProblems>(),
  snapshot: vi.fn<typeof getSnapshotByDate>(),
  snapshots: vi.fn<typeof listSnapshots>(),
}))
vi.mock('../../electron/db/repositories/statsRepository', () => ({
  getDailyActiveStats: mocks.daily,
  getStreakDays: mocks.streak,
  getTimeline: mocks.timeline,
  getWrongProblems: mocks.wrong,
  getUnreviewedProblems: mocks.unreviewed,
  getPlatformDistribution: () => [{ platform: 'codeforces', count: 7 }],
}))
vi.mock('../../electron/db/repositories/aiContextSnapshotRepository', () => ({
  getSnapshotByDate: mocks.snapshot,
  listSnapshots: mocks.snapshots,
}))
vi.mock('../../electron/ai/contextTagStats', () => ({ aggregateContextTagStats: () => [] }))

const day = '2026-11-27'
const instant = 1795737600123
const expectedWrong = [
  {
    platform: 'codeforces',
    platform_problem_id: '4A',
    title: 'Watermelon',
    wrong_count: 0,
    last_attempt: 0,
  },
  {
    platform: 'luogu',
    platform_problem_id: 'P1001',
    title: null,
    wrong_count: 3,
    last_attempt: instant,
  },
]
const expectedUnreviewed = [
  {
    platform: 'codeforces',
    platform_problem_id: '1A',
    title: 'Theatre Square',
    last_visited_at: 0,
    days_since: 31,
  },
  {
    platform: 'luogu',
    platform_problem_id: 'P1000',
    title: null,
    last_visited_at: -1,
    days_since: 32,
  },
  {
    platform: 'codeforces',
    platform_problem_id: '',
    title: 'Empty local ID',
    last_visited_at: instant,
    days_since: 33,
  },
  {
    platform: 'luogu',
    platform_problem_id: 'P1002',
    title: 'Identified review',
    last_visited_at: instant + 1,
    days_since: 34,
  },
]
const expectedActivity = [
  { event_type: 'visit_start', occurred_at: 0, platform: 'codeforces' },
  { event_type: 'visit_end', occurred_at: -1, platform: null },
  { event_type: 'submission', occurred_at: instant, platform: 'luogu' },
  { event_type: 'visit_start', occurred_at: instant + 1, platform: 'codeforces' },
  { event_type: 'visit_end', occurred_at: instant + 2, platform: null },
]
const wrongIds = ['', 'PRIVATE_WRONG_ID']
const unreviewedIds = [null, null, '', 'PRIVATE_UNREVIEWED_ID']
const eventIds = [null, null, '', '0', 'PRIVATE_EVENT_ID']

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 10, 27, 12), toFake: ['Date'] })
  initDbAtPath(':memory:')
  mocks.daily.mockReturnValue([
    {
      local_day: day,
      active_seconds: 600,
      duration_seconds: 900,
      visited: 4,
      solved: 2,
      submissions: 5,
      ac: 3,
    },
  ])
  mocks.streak.mockReturnValue({ current: 2, longest: 5 })
  mocks.wrong.mockReturnValue(
    expectedWrong.map((row, index) => ({
      ...row,
      id: wrongIds[index],
      canonical_url: `https://example.test/PRIVATE_WRONG_URL_${index}`,
      payload_json: `PRIVATE_WRONG_PAYLOAD_${index}`,
    })),
  )
  mocks.unreviewed.mockReturnValue(
    expectedUnreviewed.map((row, index) => ({
      ...row,
      id: unreviewedIds[index],
      canonical_url: `https://example.test/PRIVATE_UNREVIEWED_URL_${index}`,
      payload_json: `PRIVATE_UNREVIEWED_PAYLOAD_${index}`,
    })),
  )
  mocks.timeline.mockReturnValue(
    expectedActivity.map((row, index) => ({
      ...row,
      id: eventIds[index],
      url: `https://example.test/PRIVATE_ACTIVITY_URL_${index}`,
      problem_id: `PRIVATE_ACTIVITY_PROBLEM_${index}`,
      payload_json: `PRIVATE_ACTIVITY_PAYLOAD_${index}`,
    })),
  )
  mocks.snapshots.mockReturnValue([])
  mocks.snapshot.mockReturnValue(null)
})
afterEach(() => {
  closeDb()
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('insight lists through the unchanged AI consumer boundary', () => {
  it('retains exact allowlisted rows/counts/raw times while omitting all local identity and URL fields', () => {
    const context = exportAIContext()
    expect(AI_CONTEXT_VERSION).toBe(2)
    expect(context.schema_version).toBe(2)
    expect(context.exported_at).toBe(new Date(2026, 10, 27, 12).getTime())
    expect(mocks.wrong).toHaveBeenCalledExactlyOnceWith(50)
    expect(mocks.unreviewed).toHaveBeenCalledExactlyOnceWith(30, 50)
    expect(mocks.timeline).toHaveBeenCalledExactlyOnceWith(30)
    expect(context.wrong_problems).toStrictEqual(expectedWrong)
    expect(context.unreviewed_problems).toStrictEqual(expectedUnreviewed)
    expect(context.recent_activity).toStrictEqual(expectedActivity)
    for (const row of context.wrong_problems) {
      expect(Object.keys(row)).toEqual([
        'platform',
        'platform_problem_id',
        'title',
        'wrong_count',
        'last_attempt',
      ])
    }
    for (const row of context.unreviewed_problems) {
      expect(Object.keys(row)).toEqual([
        'platform',
        'platform_problem_id',
        'title',
        'last_visited_at',
        'days_since',
      ])
    }
    for (const row of context.recent_activity) {
      expect(Object.keys(row)).toEqual(['event_type', 'occurred_at', 'platform'])
    }
    const json = JSON.stringify(context)
    expect(json).toContain('"last_attempt":0')
    expect(json).toContain('"last_visited_at":-1')
    expect(json).toContain(`"occurred_at":${instant}`)
    expect(json).not.toContain('PRIVATE_')
    const markdown = renderContextAsMarkdown(context)
    expect(markdown).toContain('schema v2')
    expect(markdown).toContain('codeforces 7')
    expect(markdown).toContain('错题（2）')
    expect(markdown).toContain('待复习（4）')
    expect(markdown).toContain('[codeforces 4A] Watermelon')
    expect(markdown).toContain(`错误 0 次，最近 ${formatForDisplay(0)}`)
    expect(markdown).toContain('[luogu P1000] 无标题 — 32 天未访问')
    expect(markdown).not.toContain('PRIVATE_')
  })

  it('counts every review row in period summaries without exposing IDs or changing snapshot times', () => {
    const record = buildAIContextSnapshotRecord({
      id: 'PRIVATE_SNAPSHOT_ID',
      snapshotDate: day,
      context: exportAIContext(),
      schemaVersion: 2,
      createdAt: 0,
    })
    const snapshot = attachParsedContext(record)
    mocks.snapshots.mockReturnValue([
      {
        id: record.id,
        snapshot_date: day,
        schema_version: 2,
        created_at: 0,
      },
    ])
    mocks.snapshot.mockImplementation((date) => (date === day ? snapshot : null))
    mocks.wrong.mockClear()
    mocks.unreviewed.mockClear()
    const summary = getPeriodSummary({ start_date: day, end_date: day })
    expect(mocks.snapshots).toHaveBeenCalledExactlyOnceWith(90)
    expect(mocks.wrong).toHaveBeenCalledExactlyOnceWith(100)
    expect(mocks.unreviewed).toHaveBeenCalledExactlyOnceWith(30, 100)
    expect(summary.generated_at).toBe(new Date(2026, 10, 27, 12).getTime())
    expect(summary.rule_version).toBe(1)
    expect(summary.period).toEqual({ type: 'custom', start_date: day, end_date: day, days: 1 })
    expect(summary.wrong_problems_count).toBe(2)
    expect(summary.unreviewed_count).toBe(4)
    expect(summary.study_stats).toEqual({
      active_days: 1,
      total_problems_visited: 4,
      total_problems_solved: 2,
      total_submissions: 5,
      total_ac: 3,
      avg_daily_minutes: 10,
      streak: { current: 2, longest: 5 },
    })
    expect(summary.platform_distribution).toEqual([{ platform: 'codeforces', count: 7 }])
    expect(summary.source_snapshots).toEqual([{ snapshot_date: day, created_at: 0 }])
    expect(summary.comparison).toBeNull()
    expect(JSON.stringify(summary)).not.toContain('PRIVATE_')
    const markdown = renderSummaryAsMarkdown(summary)
    expect(markdown).toContain('错题数：2')
    expect(markdown).toContain('待复习：4 题')
    expect(markdown).toContain('codeforces：7 题')
    expect(markdown).not.toContain('PRIVATE_')
  })
})
