import { describe, expect, it } from 'vitest'
import {
  dailyActiveStatsSchema,
  submissionTrendPointSchema,
  trendPointSchema,
  timelineEventSchema,
} from '../../src/shared/types/stats'
import {
  getDailyActiveInput,
  getVisitedTrendInput,
  getAcTrendInput,
  getSubmissionTrendInput,
  recomputeDailyInput,
} from '../../src/shared/types/ipc/stats'

describe('raw daily read contracts', () => {
  it.each([dailyActiveStatsSchema, trendPointSchema, submissionTrendPointSchema])(
    'accepts nullable and raw text days without broadening scalar types',
    (schema) => {
      for (const day of [null, '', 'not-a-calendar-day', '2026-02-31', '2026-11-20']) {
        expect(schema.shape.local_day.safeParse(day).success).toBe(true)
      }
      for (const day of [undefined, 0, 1.5, {}, [], false]) {
        expect(schema.shape.local_day.safeParse(day).success).toBe(false)
      }
    },
  )

  it('keeps every metric and independent submission counter', () => {
    const daily = {
      local_day: null,
      active_seconds: 1,
      duration_seconds: 2,
      visited: 3,
      solved: 4,
      submissions: 5,
      ac: 6,
    }
    expect(dailyActiveStatsSchema.parse(daily)).toEqual(daily)
    expect(trendPointSchema.parse({ local_day: null, count: 7 })).toEqual({
      local_day: null,
      count: 7,
    })
    expect(submissionTrendPointSchema.parse({ local_day: null, total: 8, ac: 9 })).toEqual({
      local_day: null,
      total: 8,
      ac: 9,
    })
    expect(dailyActiveStatsSchema.safeParse({ ...daily, active_seconds: null }).success).toBe(false)
    expect(
      submissionTrendPointSchema.safeParse({ local_day: null, total: '8', ac: 9 }).success,
    ).toBe(false)
  })

  it.each([getDailyActiveInput, getVisitedTrendInput, getAcTrendInput, getSubmissionTrendInput])(
    'does not broaden request days or writer dates',
    (schema) => {
      for (const days of [undefined, 1, 30, 3650]) expect(schema.safeParse(days).success).toBe(true)
      for (const days of [null, 0, -1, 1.5, NaN, Infinity, 3651, '30'])
        expect(schema.safeParse(days).success).toBe(false)
      expect(recomputeDailyInput[0].safeParse(undefined).success).toBe(true)
      expect(recomputeDailyInput[0].safeParse('2026-11-20').success).toBe(true)
      for (const day of [null, '', 0, 'missing'])
        expect(recomputeDailyInput[0].safeParse(day).success).toBe(false)
    },
  )

  it('keeps instant output contracts integer-only and nonnullable', () => {
    const instant = timelineEventSchema.shape.occurred_at
    for (const value of [0, -1, 1763683200000]) expect(instant.safeParse(value).success).toBe(true)
    for (const value of [null, undefined, 1.5, '2026-11-20', NaN])
      expect(instant.safeParse(value).success).toBe(false)
  })
})
