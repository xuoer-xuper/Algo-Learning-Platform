import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import { findProblemIdByPlatformKey } from '../../electron/db/repositories/problemRepository'
import { subscribeDataChanges } from '../../electron/shared/dataEvents'
import type { DataChangedPayload } from '../../src/shared/types/data'

beforeEach(() => {
  initDbAtPath(':memory:')
})

afterEach(closeDb)

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
       VALUES (?, ?, ?, 'https://example.test/lookup', 0, 0, 0, ?)`,
    )
    .run(id, platform, platformProblemId, deletedAt)
}

function readLegacyLookup(platform: string, platformProblemId: string): string | null {
  const row = getDb()
    .prepare<[string, string], { id: string | null }>(
      'SELECT id FROM problems WHERE platform = ? AND platform_problem_id = ? AND deleted_at IS NULL',
    )
    .get(platform, platformProblemId)
  return row?.id ?? null
}

function expectLookup(platform: string, platformProblemId: string, expected: string | null): void {
  expect(readLegacyLookup(platform, platformProblemId)).toBe(expected)
  expect(findProblemIdByPlatformKey(platform, platformProblemId)).toBe(expected)
}

describe('problem platform-key lookup', () => {
  it('should return a synchronous ID only when both platform and problem key match', () => {
    expectLookup('codeforces', '1000A', null)
    insertProblem('cf-a', 'codeforces', '1000A')
    insertProblem('cf-b', 'codeforces', '1000B')
    insertProblem('pta-a', 'pta', '1000A')

    expectLookup('codeforces', '1000A', 'cf-a')
    expectLookup('codeforces', '1000B', 'cf-b')
    expectLookup('pta', '1000A', 'pta-a')
    expectLookup('codeforces', 'missing', null)
    expectLookup('missing', '1000A', null)
    expectLookup('pta', '1000B', null)
  })

  it('should keep case-sensitive equality without trimming either lookup input', () => {
    insertProblem('exact', 'Codeforces', '1000A')

    expectLookup('Codeforces', '1000A', 'exact')
    expectLookup('codeforces', '1000A', null)
    expectLookup('Codeforces', '1000a', null)
    expectLookup(' Codeforces', '1000A', null)
    expectLookup('Codeforces', '1000A ', null)
  })

  it('should exclude deleted rows even when the deletion timestamp is zero', () => {
    insertProblem('active', 'codeforces', 'active')
    insertProblem('deleted-zero', 'codeforces', 'zero', 0)
    insertProblem('deleted-positive', 'codeforces', 'positive', 1768443630123)

    expectLookup('codeforces', 'active', 'active')
    expectLookup('codeforces', 'zero', null)
    expectLookup('codeforces', 'positive', null)
  })

  it('should preserve the distinction between a null ID, an empty ID and a missing row', () => {
    insertProblem(null, 'codeforces', 'null-a')
    insertProblem(null, 'codeforces', 'null-b')
    insertProblem('', 'codeforces', 'empty')

    expectLookup('codeforces', 'null-a', null)
    expectLookup('codeforces', 'null-b', null)
    expectLookup('codeforces', 'empty', '')
    expectLookup('codeforces', 'missing', null)
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM problems').get()).toEqual({ count: 3 })
  })

  it.each(["O'Reilly", '100%', 'A_B', 'path\\key', "' OR 1=1 --", ''])(
    'should bind %j as a literal platform and problem key',
    (literal) => {
      insertProblem('decoy', 'codeforces', 'decoy')
      expectLookup('codeforces', literal, null)
      expectLookup(literal, 'literal-key', null)
      insertProblem('key-match', 'codeforces', literal)
      insertProblem('platform-match', literal, 'literal-key')
      expectLookup('codeforces', literal, 'key-match')
      expectLookup(literal, 'literal-key', 'platform-match')
      expectLookup('codeforces', `${literal}x`, null)
      expectLookup(`${literal}x`, 'literal-key', null)
    },
  )

  it('should not write, migrate, change connection settings or emit R4 notifications', () => {
    insertProblem('active', 'codeforces', 'active')
    insertProblem('', 'codeforces', 'empty')
    insertProblem(null, 'codeforces', 'null')
    insertProblem('deleted', 'codeforces', 'deleted', 0)
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
      for (let index = 0; index < 3; index += 1) {
        expectLookup('codeforces', 'active', 'active')
        expectLookup('codeforces', 'empty', '')
        expectLookup('codeforces', 'null', null)
        expectLookup('codeforces', 'deleted', null)
        expectLookup('codeforces', 'missing', null)
      }
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

  it('should read the existing uncommitted transaction without committing or emitting changes', () => {
    const db = getDb()
    const observed: DataChangedPayload[] = []
    const unsubscribe = subscribeDataChanges((payload) => observed.push(payload))
    try {
      expect(() =>
        db.transaction(() => {
          insertProblem('uncommitted', 'codeforces', 'uncommitted')
          expectLookup('codeforces', 'uncommitted', 'uncommitted')
          expect(db.inTransaction).toBe(true)
          throw new Error('rollback fixture')
        })(),
      ).toThrow('rollback fixture')
      expect(db.inTransaction).toBe(false)
      expectLookup('codeforces', 'uncommitted', null)
      expect(observed).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  it('should follow the lifecycle owner after closing and reinitializing the database', () => {
    const first = getDb()
    insertProblem('first', 'codeforces', 'same-key')
    expectLookup('codeforces', 'same-key', 'first')
    closeDb()
    expect(first.open).toBe(false)
    expect(() => findProblemIdByPlatformKey('codeforces', 'same-key')).toThrow(
      'Database not initialized',
    )
    expect(() => getDb()).toThrow('Database not initialized')

    const second = initDbAtPath(':memory:')
    expect(second).not.toBe(first)
    expectLookup('codeforces', 'same-key', null)
    insertProblem('second', 'codeforces', 'same-key')
    expectLookup('codeforces', 'same-key', 'second')
  })

  it('should propagate SQLite failures rather than treating them as missing rows', () => {
    getDb().exec('ALTER TABLE problems RENAME COLUMN platform_problem_id TO unavailable_key')
    expect(() => readLegacyLookup('codeforces', '1000A')).toThrow(/no such column/i)
    expect(() => findProblemIdByPlatformKey('codeforces', '1000A')).toThrow(/no such column/i)
  })
})
