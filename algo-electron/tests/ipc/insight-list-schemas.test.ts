import { describe, expect, it } from 'vitest'
import {
  revisitStatsItemSchema,
  timelineEventSchema,
  unreviewedProblemItemSchema,
  wrongProblemItemSchema,
} from '../../src/shared/types/stats'
import {
  getProblemVisitStatsInput,
  getRevisitStatsInput,
  getTimelineInput,
  getUnreviewedInput,
  getWrongProblemsInput,
} from '../../src/shared/types/ipc/stats'
import { deleteInput, getDetailInput } from '../../src/shared/types/ipc/problem'

const problem = {
  platform: 'codeforces',
  platform_problem_id: '4A',
  title: null,
  canonical_url: 'https://codeforces.com/problemset/problem/4/A',
}
const nullableOutputs = [
  {
    name: 'timeline',
    schema: timelineEventSchema,
    row: {
      id: 'event',
      event_type: 'visit_start',
      occurred_at: 0,
      platform: null,
      url: null,
      problem_id: null,
    },
  },
  {
    name: 'wrong',
    schema: wrongProblemItemSchema,
    row: { ...problem, id: 'problem', wrong_count: 0, last_attempt: 0 },
  },
  {
    name: 'unreviewed',
    schema: unreviewedProblemItemSchema,
    row: { ...problem, id: 'problem', last_visited_at: 0, days_since: 31 },
  },
]

describe('insight-list read-only ID contracts', () => {
  it.each(nullableOutputs)(
    '$name accepts string/null IDs without changing the row',
    ({ schema, row }) => {
      for (const id of [null, '', '0', 'literal:[]"', '\u4e2d\u6587']) {
        const value = { ...row, id }
        expect(schema.parse(value)).toStrictEqual(value)
      }
    },
  )

  it.each(nullableOutputs)('$name still rejects missing or nonstring IDs', ({ schema, row }) => {
    for (const id of [undefined, 0, 1.5, NaN, {}, [], false]) {
      expect(schema.safeParse({ ...row, id }).success).toBe(false)
    }
    const { id: _id, ...missingId } = row
    expect(schema.safeParse(missingId).success).toBe(false)
  })

  it('keeps the joined revisit ID string-only, including the empty string', () => {
    const row = { ...problem, problem_id: 'problem', visit_count: 2, last_visit: 0 }
    for (const problem_id of ['', '0', 'literal:[]"', '\u4e2d\u6587']) {
      const value = { ...row, problem_id }
      expect(revisitStatsItemSchema.parse(value)).toStrictEqual(value)
    }
    for (const problem_id of [null, undefined, 0, {}, []]) {
      expect(revisitStatsItemSchema.safeParse({ ...row, problem_id }).success).toBe(false)
    }
  })

  it.each([wrongProblemItemSchema, unreviewedProblemItemSchema, revisitStatsItemSchema])(
    'keeps both platform identity fields required strings',
    (schema) => {
      for (const field of [schema.shape.platform, schema.shape.platform_problem_id]) {
        for (const value of ['', 'a:b', 'c', '\u4e2d\u6587']) {
          expect(field.safeParse(value).success).toBe(true)
        }
        for (const value of [null, undefined, 0, {}, []]) {
          expect(field.safeParse(value).success).toBe(false)
        }
      }
    },
  )

  it.each([
    timelineEventSchema.shape.occurred_at,
    revisitStatsItemSchema.shape.last_visit,
    wrongProblemItemSchema.shape.last_attempt,
    unreviewedProblemItemSchema.shape.last_visited_at,
  ])('retains nonnullable integer instant validation', (schema) => {
    for (const value of [0, -1, 1764244800123]) {
      expect(schema.safeParse(value).success).toBe(true)
    }
    for (const value of [null, undefined, 1.5, NaN, Infinity, '2026-11-27', '0', {}]) {
      expect(schema.safeParse(value).success).toBe(false)
    }
  })
})

describe('unchanged insight-list request contracts', () => {
  it.each([getTimelineInput[0], getRevisitStatsInput[0], getWrongProblemsInput[0]])(
    'retains optional integer limits from 1 to 1000',
    (schema) => {
      for (const value of [undefined, 1, 50, 1000]) {
        expect(schema.safeParse(value).success).toBe(true)
      }
      for (const value of [null, 0, -1, 1.5, NaN, Infinity, 1001, '50', {}]) {
        expect(schema.safeParse(value).success).toBe(false)
      }
    },
  )

  it('keeps unreviewed input a strict object with independently bounded optional days/limit', () => {
    const schema = getUnreviewedInput[0]
    for (const value of [{}, { days: 1, limit: 1 }, { days: 3650, limit: 1000 }]) {
      expect(schema.parse(value)).toStrictEqual(value)
    }
    for (const days of [null, 0, -1, 1.5, NaN, Infinity, 3651, '30']) {
      expect(schema.safeParse({ days, limit: 50 }).success).toBe(false)
    }
    for (const limit of [null, 0, -1, 1.5, NaN, Infinity, 1001, '50']) {
      expect(schema.safeParse({ days: 30, limit }).success).toBe(false)
    }
    for (const value of [undefined, null, [30, 50], { days: 30, id: null }]) {
      expect(schema.safeParse(value).success).toBe(false)
    }
  })

  it.each([getProblemVisitStatsInput[0], getDetailInput[0], deleteInput[0]])(
    'does not widen nonempty bounded request IDs with read-only nullability',
    (schema) => {
      for (const id of ['0', 'problem', 'x'.repeat(200)]) {
        expect(schema.safeParse(id).success).toBe(true)
      }
      for (const id of [null, undefined, '', 0, {}, [], 'x'.repeat(201)]) {
        expect(schema.safeParse(id).success).toBe(false)
      }
    },
  )
})
