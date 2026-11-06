import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseVjudgeSolutionData } from '../../electron/adapters/sites/vjudge/submissions'

function parse(submittedAt?: unknown) {
  return parseVjudgeSolutionData({
    pageUrl: 'https://vjudge.net/solution/123456',
    requestUrl: 'https://vjudge.net/solution/data/123456',
    response: {
      _source: 'vjudge-solution-data',
      result: {
        id: '123456',
        verdict: 'Accepted',
        problem: 'CodeForces-1000A',
        ...(submittedAt === undefined ? {} : { submittedAt }),
      },
    },
  })
}

afterEach(() => vi.useRealTimers())

describe('VJudge timestamp ingress', () => {
  it('should normalize equivalent explicit offsets to the same millisecond instant', () => {
    const expected = 1768443630123
    expect(parse('2026-01-15T02:20:30.123Z')?.submittedAt).toBe(expected)
    expect(parse('2026-01-15T10:20:30.123+08:00')?.submittedAt).toBe(expected)
    expect(parse('1970-01-01T00:00:00Z')?.submittedAt).toBe(0)
  })

  it('should interpret legacy wall time locally without losing milliseconds', () => {
    expect(parse('2026-01-15 10:20:30.123')?.submittedAt).toBe(
      new Date(2026, 0, 15, 10, 20, 30, 123).getTime(),
    )
  })

  it('should use the clock only when source time is absent, not malformed', () => {
    vi.useFakeTimers({ now: 123456789 })
    expect(parse()?.submittedAt).toBe(123456789)
    for (const invalid of ['bad-time', '2026-02-30T10:00:00Z', {}, 1700000000]) {
      expect(() => parse(invalid)).toThrow()
    }
  })
})
