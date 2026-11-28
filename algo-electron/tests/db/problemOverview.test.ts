import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import {
  getLastActiveTime,
  getOverviewStats,
  getPlatformDistribution,
  getProblemCount,
  getTodayVisitedCount,
} from '../../electron/db/repositories/problemRepository'
import { subscribeDataChanges } from '../../electron/shared/dataEvents'
import type { DataChangedPayload } from '../../src/shared/types/data'
import type { OverviewStats, PlatformDistributionRow } from '../../src/shared/types/stats'

// This date also exercises a 23-hour local day when run with TZ=America/New_York.
const FROZEN_NOW = new Date(2026, 2, 8, 12, 34, 56, 789).getTime()
const DAY_START = new Date(2026, 2, 8).getTime()
const DAY_END = new Date(2026, 2, 9).getTime()

beforeEach(() => {
  vi.useFakeTimers({ now: FROZEN_NOW, toFake: ['Date'] })
  initDbAtPath(':memory:')
})

afterEach(() => {
  closeDb()
  vi.useRealTimers()
})

function insertProblem(
  id: string | null,
  platform: string,
  platformProblemId: string,
  deletedAt: number | null = null,
): void {
  getDb()
    .prepare(
      `INSERT INTO problems
        (id, platform, platform_problem_id, canonical_url, first_seen_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      platform,
      platformProblemId,
      `https://example.test/${platform}/${platformProblemId}`,
      FROZEN_NOW,
      FROZEN_NOW,
      FROZEN_NOW,
      deletedAt,
    )
}

function insertVisit(
  id: string | null,
  problemId: string,
  enteredAt: number,
  deletedAt: number | null = null,
): void {
  getDb()
    .prepare(
      `INSERT INTO problem_visits
        (id, problem_id, platform, url, entered_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, 'codeforces', 'https://example.test/visit', ?, ?, ?, ?)`,
    )
    .run(id, problemId, enteredAt, enteredAt, enteredAt, deletedAt)
}

function insertActivity(id: string, occurredAt: number, deletedAt: number | null = null): void {
  getDb()
    .prepare(
      `INSERT INTO activity_events
        (id, event_type, occurred_at, local_day, created_at, deleted_at)
       VALUES (?, 'visit_start', ?, '2026-03-08', ?, ?)`,
    )
    .run(id, occurredAt, occurredAt, deletedAt)
}

function readLegacyOverview(): OverviewStats {
  const db = getDb()
  const total = db
    .prepare<[], { count: number }>(
      'SELECT COUNT(*) as count FROM problems WHERE deleted_at IS NULL',
    )
    .get()
  const visited = db
    .prepare<[number, number], { count: number }>(
      `SELECT COUNT(DISTINCT problem_id) as count FROM problem_visits
       WHERE entered_at >= ? AND entered_at < ?`,
    )
    .get(DAY_START, DAY_END)
  assert.ok(total)
  assert.ok(visited)
  const distribution = db
    .prepare<[], PlatformDistributionRow>(
      `SELECT platform, COUNT(*) as count FROM problems WHERE deleted_at IS NULL
       GROUP BY platform ORDER BY count DESC`,
    )
    .all()
  const active = db
    .prepare<[], { occurred_at: number }>(
      'SELECT occurred_at FROM activity_events ORDER BY occurred_at DESC LIMIT 1',
    )
    .get()
  return {
    totalProblems: total.count,
    todayVisited: visited.count,
    platformDistribution: distribution,
    lastActiveTime: active?.occurred_at ?? null,
  }
}

function expectLegacyParity(): void {
  const expected = readLegacyOverview()
  expect(getOverviewStats()).toEqual(expected)
  expect(getProblemCount()).toBe(expected.totalProblems)
  expect(getPlatformDistribution()).toEqual(expected.platformDistribution)
  expect(getTodayVisitedCount()).toBe(expected.todayVisited)
  expect(getLastActiveTime()).toBe(expected.lastActiveTime)
}

describe('problem overview reads', () => {
  it('should return synchronous zero counts and a null last activity for an empty database', () => {
    expect(getOverviewStats()).toEqual({
      totalProblems: 0,
      todayVisited: 0,
      platformDistribution: [],
      lastActiveTime: null,
    })
    expectLegacyParity()
  })

  it('should count active rows including nullable IDs and order unequal platform counts descending', () => {
    insertProblem(null, 'codeforces', 'null-a')
    insertProblem(null, 'codeforces', 'null-b')
    insertProblem('cf', 'codeforces', 'cf')
    insertProblem('luogu-a', 'luogu', 'a')
    insertProblem('luogu-b', 'luogu', 'b')
    insertProblem('pta', 'pta', 'pta')
    insertProblem('deleted-zero', 'deleted-platform', 'zero', 0)
    insertProblem(null, 'deleted-platform', 'null-id', FROZEN_NOW)

    expect(getProblemCount()).toBe(6)
    expect(getPlatformDistribution()).toEqual([
      { platform: 'codeforces', count: 3 },
      { platform: 'luogu', count: 2 },
      { platform: 'pta', count: 1 },
    ])
    expectLegacyParity()
  })

  it('should use the half-open local day and count distinct problem keys rather than visit IDs', () => {
    for (const id of ['before', 'start', 'last', 'end']) {
      insertProblem(id, 'codeforces', id)
    }
    insertVisit('before', 'before', DAY_START - 1)
    insertVisit(null, 'start', DAY_START)
    insertVisit(null, 'start', DAY_START + 1)
    insertVisit(null, 'last', DAY_END - 1)
    insertVisit('end', 'end', DAY_END)

    expect(getTodayVisitedCount()).toBe(2)
    expectLegacyParity()
    expect(
      getDb().prepare('SELECT DISTINCT typeof(entered_at) AS storage FROM problem_visits').all(),
    ).toEqual([{ storage: 'integer' }])
  })

  it('should retain deleted visits and visits linked to deleted problems in the daily count', () => {
    insertProblem('active', 'codeforces', 'active')
    insertProblem('deleted', 'codeforces', 'deleted', 0)
    insertVisit('deleted-visit', 'active', FROZEN_NOW, 0)
    insertVisit('deleted-problem-visit', 'deleted', FROZEN_NOW)

    expect(getProblemCount()).toBe(1)
    expect(getTodayVisitedCount()).toBe(2)
    expectLegacyParity()
  })

  it('should keep epoch zero and millisecond precision while including deleted activity', () => {
    insertActivity('epoch', 0, 0)
    expect(getLastActiveTime()).toBe(0)
    expect(getOverviewStats().lastActiveTime).toBe(0)
    expectLegacyParity()

    insertActivity('latest-deleted', FROZEN_NOW, 0)
    insertActivity('older-active', FROZEN_NOW - 1)
    expect(getLastActiveTime()).toBe(FROZEN_NOW)
    expect(typeof getLastActiveTime()).toBe('number')
    expectLegacyParity()
  })

  it('should match the original SQL across a mixed snapshot without projecting Dates', () => {
    insertProblem(null, 'codeforces', 'null')
    insertProblem('active', 'codeforces', 'active')
    insertProblem('other', 'pta', 'other')
    insertProblem('deleted', 'pta', 'deleted', 0)
    insertVisit(null, 'active', DAY_START)
    insertVisit('repeat', 'active', FROZEN_NOW)
    insertVisit('deleted', 'deleted', DAY_END - 1, 0)
    insertVisit('tomorrow', 'other', DAY_END)
    insertActivity('latest', FROZEN_NOW, 0)

    expect(getOverviewStats()).toEqual({
      totalProblems: 3,
      todayVisited: 2,
      platformDistribution: [
        { platform: 'codeforces', count: 2 },
        { platform: 'pta', count: 1 },
      ],
      lastActiveTime: FROZEN_NOW,
    })
    expectLegacyParity()
  })

  it('should leave data, migration history, connection settings and R4 subscriptions untouched', () => {
    insertProblem('read-only', 'codeforces', 'read-only')
    insertVisit('visit', 'read-only', FROZEN_NOW)
    insertActivity('activity', FROZEN_NOW)
    const db = getDb()
    const observed: DataChangedPayload[] = []
    const unsubscribe = subscribeDataChanges((payload) => observed.push(payload))
    db.pragma('query_only = ON')
    const before = db.serialize()
    const changes = db.prepare('SELECT total_changes() AS count').get()
    const settings = {
      foreignKeys: db.pragma('foreign_keys', { simple: true }),
      busyTimeout: db.pragma('busy_timeout', { simple: true }),
      journalMode: db.pragma('journal_mode', { simple: true }),
    }
    try {
      for (let index = 0; index < 3; index += 1) expectLegacyParity()
      expect(getDb()).toBe(db)
      expect(db.open).toBe(true)
      expect(db.inTransaction).toBe(false)
      expect(db.serialize()).toEqual(before)
      expect(db.prepare('SELECT total_changes() AS count').get()).toEqual(changes)
      expect(db.pragma('query_only', { simple: true })).toBe(1)
      expect({
        foreignKeys: db.pragma('foreign_keys', { simple: true }),
        busyTimeout: db.pragma('busy_timeout', { simple: true }),
        journalMode: db.pragma('journal_mode', { simple: true }),
      }).toEqual(settings)
      expect(
        db.prepare("SELECT name FROM sqlite_schema WHERE name = '__drizzle_migrations'").get(),
      ).toBeUndefined()
      expect(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({
        count: 30,
      })
      expect(observed).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  it('should read the current transaction and follow the lifecycle owner after close and reinitialization', async () => {
    const first = getDb()
    expect(() =>
      first.transaction(() => {
        insertProblem('uncommitted', 'codeforces', 'uncommitted')
        insertVisit('uncommitted-visit', 'uncommitted', FROZEN_NOW)
        insertActivity('uncommitted-activity', 0)
        expect(getOverviewStats()).toEqual({
          totalProblems: 1,
          todayVisited: 1,
          platformDistribution: [{ platform: 'codeforces', count: 1 }],
          lastActiveTime: 0,
        })
        expect(first.inTransaction).toBe(true)
        throw new Error('rollback fixture')
      })(),
    ).toThrow('rollback fixture')
    expect(getProblemCount()).toBe(0)
    closeDb()
    expect(first.open).toBe(false)
    await import('../../electron/db/repositories/problem/overview')
    expect(() => getDb()).toThrow('Database not initialized')
    expect(() => getOverviewStats()).toThrow('Database not initialized')

    const second = initDbAtPath(':memory:')
    expect(second).not.toBe(first)
    expect(getOverviewStats()).toEqual(readLegacyOverview())
    expect(getLastActiveTime()).toBeNull()
    insertProblem('new-connection', 'pta', 'new-connection')
    expect(getPlatformDistribution()).toEqual([{ platform: 'pta', count: 1 }])
    expectLegacyParity()
  })
})
