import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, initDbAtPath, closeDb } from '../../electron/db/connection'
import {
  exportAIContext,
  AI_CONTEXT_VERSION,
  renderContextAsMarkdown,
} from '../../electron/ai/contextExporter'
import { ContextGatherer } from '../../electron/coach/llm/ContextGatherer'
import {
  buildAIContextSnapshotRecord,
  attachParsedContext,
} from '../../electron/db/repositories/aiContextSnapshot/serialization'
import type { AIContextSnapshotWithContext } from '../../electron/db/repositories/aiContextSnapshot/types'
import { normalizeLegacyAIContext } from '../../electron/db/legacy-ai-context'
import { aggregateFromSnapshots } from '../../electron/ai/summary/periodSummaryAggregation'
import type { DailyActiveStats } from '../../src/shared/types/stats'
import type { CoachEvent } from '../../src/shared/types/coach'

const mocks = vi.hoisted(() => ({
  daily: vi.fn<() => DailyActiveStats[]>(),
  streak: vi.fn<() => { current: number; longest: number }>(),
  snapshot: vi.fn<(date: string) => AIContextSnapshotWithContext | null>(),
}))
vi.mock('../../electron/db/repositories/statsRepository', () => ({
  getDailyActiveStats: mocks.daily,
  getPlatformDistribution: () => [{ platform: 'codeforces', count: 3 }],
  getStreakDays: mocks.streak,
  getTimeline: () => [
    {
      event_type: 'visit_start',
      occurred_at: 0,
      platform: 'codeforces',
      secret: 'PRIVATE_ACTIVITY',
    },
  ],
  getUnreviewedProblems: () => [],
  getWrongProblems: () => [],
}))
vi.mock('../../electron/db/repositories/aiContextSnapshotRepository', () => ({
  getSnapshotByDate: mocks.snapshot,
}))
vi.mock('../../electron/ai/contextTagStats', () => ({ aggregateContextTagStats: () => [] }))

const day = '2026-11-20'
function daily(local_day: string | null, multiplier: number): DailyActiveStats {
  return {
    local_day,
    active_seconds: 120 * multiplier,
    duration_seconds: 150 * multiplier,
    visited: multiplier,
    solved: 2 * multiplier,
    submissions: 3 * multiplier,
    ac: 4 * multiplier,
  }
}
const rows = [daily(null, 10), daily(null, 20), daily('PRIVATE_RAW_DAY', 30), daily(day, 1)]
const event: CoachEvent = {
  event_id: 'event',
  session_id: 'session',
  event_type: 'multiple_wrong',
  severity: 'warn',
  score: 60,
  problem_id: 'problem',
  platform: 'codeforces',
  evidence: { verdict: 'WA' },
  created_at: 0,
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 10, 20, 12), toFake: ['Date'] })
  initDbAtPath(':memory:')
  mocks.daily.mockReturnValue(rows.map((row) => ({ ...row, secret: 'PRIVATE_DAILY' })))
  mocks.streak.mockReturnValue({ current: 0, longest: 1 })
})
afterEach(() => {
  closeDb()
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('daily read shape through existing AI consumers', () => {
  it('exports all seven fields including NULL without changing version, projection, or Markdown privacy', () => {
    const context = exportAIContext()
    expect(AI_CONTEXT_VERSION).toBe(2)
    expect(context.schema_version).toBe(2)
    expect(mocks.daily).toHaveBeenCalledExactlyOnceWith(30)
    expect(context.trends.daily_stats).toEqual(rows)
    expect(context.trends.daily_stats.map((row) => Object.keys(row))).toEqual(
      rows.map((row) => Object.keys(row)),
    )
    const json = JSON.stringify(context)
    expect(json).toContain('"local_day":null')
    expect(json).toContain('PRIVATE_RAW_DAY')
    expect(json).not.toContain('PRIVATE_DAILY')
    expect(json).not.toContain('PRIVATE_ACTIVITY')
    const markdown = renderContextAsMarkdown(context)
    expect(markdown).toContain('schema v2')
    expect(markdown).toContain('codeforces 3')
    expect(markdown).not.toContain('PRIVATE_')
    expect(markdown).not.toContain('1200')
    expect(new ContextGatherer().collect(event, null, null, 1, false).learner_profile_md).toBe(
      markdown,
    )
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM ai_context_snapshots').get()).toEqual({
      count: 0,
    })
  })

  it('preserves NULL and raw strings through snapshot JSON and legacy normalization', () => {
    const context = exportAIContext()
    const record = buildAIContextSnapshotRecord({
      id: 'snapshot',
      snapshotDate: day,
      context,
      schemaVersion: 2,
      createdAt: 0,
    })
    const parsed = attachParsedContext(record)
    expect(record.snapshot_date).toBe(day)
    expect(record.schema_version).toBe(2)
    expect(parsed.context).toEqual(context)
    expect(parsed.context.trends.daily_stats).toEqual(rows)
    expect(
      normalizeLegacyAIContext({
        ...context,
        schema_version: 1,
        exported_at: '2026-11-20 12:00:00',
        recent_activity: [],
      }).trends,
    ).toEqual(context.trends)
    expect(() => normalizeLegacyAIContext({ ...context, exported_at: '2026-11-20' })).toThrow(
      'Invalid AI context timestamp field',
    )
  })

  it('keeps strict snapshot-day aggregation and the original period denominator', () => {
    const record = buildAIContextSnapshotRecord({
      id: 'snapshot',
      snapshotDate: day,
      context: exportAIContext(),
      schemaVersion: 2,
      createdAt: 0,
    })
    const parsed = attachParsedContext(record)
    mocks.snapshot.mockImplementation((date) => (date === day ? parsed : null))
    const result = aggregateFromSnapshots([
      { id: 'snapshot', snapshot_date: day, schema_version: 2, created_at: 0 },
      { id: 'absent', snapshot_date: '2026-11-19', schema_version: 2, created_at: 0 },
    ])
    expect(result).toEqual({
      totalVisited: 1,
      totalSolved: 2,
      totalSubmissions: 3,
      totalAc: 4,
      activeDays: 1,
      totalActiveSeconds: 120,
      avgDailyMinutes: 1,
      platformDistribution: [{ platform: 'codeforces', count: 3 }],
      weakTags: [],
    })
  })

  it('does not heal existing streak errors and retains the Coach empty-profile fallback', () => {
    const failure = new TypeError('Invalid local day')
    mocks.streak.mockImplementation(() => {
      throw failure
    })
    let caught: unknown
    try {
      exportAIContext()
    } catch (error) {
      caught = error
    }
    expect(caught).toBe(failure)
    const context = new ContextGatherer().collect(event, null, null, 1, false)
    expect(context.learner_profile_md).toBe('')
    expect(context.hint_request.event_type).toBe('multiple_wrong')
    expect(JSON.stringify(context)).not.toContain('Invalid local day')
  })
})
