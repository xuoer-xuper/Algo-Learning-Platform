import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import { getRecentProblems } from '../../electron/db/repositories/problemRepository'
import { subscribeDataChanges } from '../../electron/shared/dataEvents'
import type { DataChangedPayload } from '../../src/shared/types/data'
import { problemRecordSchema } from '../../src/shared/types/problem'
import { getOriginalRecentProblems } from './problem-recent-oracle'

let temporaryDirectory = ''
let serial = 0

beforeEach(() => {
  serial = 0
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-problem-recent-'))
  initDbAtPath(path.join(temporaryDirectory, 'recent.sqlite'))
})

afterEach(() => {
  closeDb()
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
})

type FixtureRow = Record<string, string | number | null>

function insertRow(table: string, row: FixtureRow): void {
  const columns = Object.keys(row)
  getDb()
    .prepare(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(row))
}

function insertProblem(id: string | null, fields: FixtureRow = {}): void {
  insertRow('problems', {
    id,
    platform: 'codeforces',
    platform_problem_id: `problem-${serial++}`,
    canonical_url: 'https://example.test/problem',
    title: 'Fixture',
    status: 'visited',
    first_seen_at: 0,
    created_at: 0,
    updated_at: 0,
    ...fields,
  })
}

function insertSubmission(problemId: string, fields: FixtureRow = {}): void {
  const index = serial++
  insertRow('submissions', {
    id: `submission-${index}`,
    problem_id: problemId,
    platform: 'codeforces',
    platform_submission_id: `remote-${index}`,
    verdict: 'WA',
    submitted_at: 0,
    created_at: 0,
    updated_at: 0,
    ...fields,
  })
}

function expectRecent(limit?: number, platform?: string, status?: string) {
  const expected = getOriginalRecentProblems(getDb(), limit, platform, status)
  const actual = getRecentProblems(limit, platform, status)
  expect(actual).toEqual(expected)
  return actual
}

function outcome(run: () => unknown) {
  try {
    return { rows: run() }
  } catch (error) {
    if (!(error instanceof Error)) throw error
    return {
      error: {
        name: error.name,
        message: error.message,
        ...('code' in error ? { code: error.code } : {}),
      },
    }
  }
}

describe('recent problem Drizzle parity', () => {
  it('keeps the default 50-row horizon and descending time order including ties', () => {
    expect(expectRecent()).toEqual([])
    for (let index = 0; index < 60; index++) {
      insertProblem(`row-${index}`, { last_visited_at: Math.floor(index / 2) })
    }
    const rows = expectRecent()
    expect(rows).toHaveLength(50)
    expect(rows[0]?.last_visited_at).toBe(29)
    expect(rows.at(-1)?.last_visited_at).toBe(5)
  })

  it('keeps all eight fields, null/empty IDs, null titles, raw times and active parents only', () => {
    insertProblem(null, { title: null, last_visited_at: null, status: 'legacy' })
    insertProblem(null, { last_visited_at: 0 })
    insertProblem('', { last_visited_at: -0.5 })
    insertProblem('deleted-zero', { deleted_at: 0, last_visited_at: 10 })
    insertProblem('deleted-later', { deleted_at: 100, last_visited_at: 20 })
    const rows = expectRecent()
    expect(rows.map((row) => row.id)).toEqual([null, '', null])
    expect(rows.map((row) => row.last_visited_at)).toEqual([0, -0.5, null])
    expect(rows.at(-1)).toEqual({
      id: null,
      platform: 'codeforces',
      platform_problem_id: 'problem-0',
      canonical_url: 'https://example.test/problem',
      title: null,
      last_visited_at: null,
      status: 'legacy',
      submission_count: 0,
    })
    expect(problemRecordSchema.safeParse(rows.at(-1)).success).toBe(true)
  })

  it('retains stored status only without children and counts tombstones and null child IDs', () => {
    insertProblem('solved', { status: 'visited', last_visited_at: 3 })
    insertSubmission('solved', { verdict: 'WA' })
    insertSubmission('solved', { id: null, verdict: 'AC', deleted_at: 0 })
    insertProblem('attempted', { status: 'solved', last_visited_at: 2 })
    insertSubmission('attempted', { id: null, verdict: 'WA', deleted_at: 0 })
    insertProblem('stored', { status: 'custom', last_visited_at: 1 })
    insertProblem(null, { status: 'null-stored', last_visited_at: 0 })
    expect(
      expectRecent().map(({ status, submission_count }) => ({ status, submission_count })),
    ).toEqual([
      { status: 'solved', submission_count: 2 },
      { status: 'attempted', submission_count: 1 },
      { status: 'custom', submission_count: 0 },
      { status: 'null-stored', submission_count: 0 },
    ])
  })

  it('filters platform before LIMIT but filters status only after the SQL horizon', () => {
    insertProblem('outside', { platform: 'acwing', last_visited_at: 4 })
    insertProblem('new', { last_visited_at: 3 })
    insertSubmission('new', { verdict: 'WA' })
    insertProblem('old', { last_visited_at: 2 })
    insertSubmission('old', { verdict: 'AC' })
    expect(expectRecent(1, 'codeforces').map((row) => row.id)).toEqual(['new'])
    expect(expectRecent(1, 'codeforces', 'solved')).toEqual([])
    expect(expectRecent(2, 'codeforces', 'solved').map((row) => row.id)).toEqual(['old'])
    expect(expectRecent(1, 'codeforces', '').map((row) => row.id)).toEqual(['new'])
    expect(expectRecent(50, undefined, 'unknown')).toEqual([])
  })

  it.each([
    undefined,
    '',
    'codeforces',
    'Codeforces',
    'missing',
    "O'Reilly",
    '%_\\',
    "' OR 1=1 --",
    ' ',
  ])('preserves truthiness and exact bound platform %j', (platform) => {
    for (const value of ['codeforces', 'Codeforces', '', "O'Reilly", '%_\\', "' OR 1=1 --", ' ']) {
      insertProblem(value, { platform: value, last_visited_at: serial })
    }
    const rows = expectRecent(50, platform)
    if (platform) expect(rows.every((row) => row.platform === platform)).toBe(true)
    else expect(rows).toHaveLength(7)
  })

  it.each([-0.5, 0, -123, 1_735_689_600_123, 8_640_000_000_000_001])(
    'does not decode or normalize raw last visit %s',
    (lastVisitedAt) => {
      insertProblem('raw', { last_visited_at: lastVisitedAt })
      expect(expectRecent()[0]?.last_visited_at).toBe(lastVisitedAt)
    },
  )

  it.each([
    -3,
    -1,
    -0,
    0,
    1,
    2,
    3,
    50,
    NaN,
    Infinity,
    -Infinity,
    1.5,
    -1.5,
    Number.MAX_SAFE_INTEGER,
    2 ** 63 - 1024,
    2 ** 63,
    Number.MAX_VALUE,
  ])('forwards LIMIT %s exactly and preserves native results or errors', (limit) => {
    for (let index = 0; index < 4; index++)
      insertProblem(`limit-${index}`, { last_visited_at: index })
    const expected = outcome(() => getOriginalRecentProblems(getDb(), limit))
    expect(outcome(() => getRecentProblems(limit))).toEqual(expected)
    if (Number.isInteger(limit) && limit >= -(2 ** 63) && limit < 2 ** 63) {
      expect(getRecentProblems(limit)).toHaveLength(limit < 0 ? 4 : Math.min(limit, 4))
    } else {
      expect(expected).toHaveProperty('error.message', 'datatype mismatch')
    }
  })

  it('is read-only with no schema, ledger, notification or transaction side effects', () => {
    insertProblem('read', { last_visited_at: 0 })
    insertSubmission('read')
    const db = getDb()
    const observed: DataChangedPayload[] = []
    const unsubscribe = subscribeDataChanges((event) => observed.push(event))
    const snapshot = () => [
      db.prepare('SELECT total_changes() AS count').get(),
      db.prepare('SELECT * FROM sqlite_master ORDER BY type, name').all(),
      db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),
    ]
    const before = snapshot()
    try {
      db.pragma('query_only = ON')
      expectRecent()
      expectRecent(-1, '', 'attempted')
      expect(db.inTransaction).toBe(false)
      expect(snapshot()).toEqual(before)
      expect(observed).toEqual([])
    } finally {
      db.pragma('query_only = OFF')
      unsubscribe()
    }
  })

  it('reads the current transaction and leaves rollback ownership to its caller', () => {
    const db = getDb()
    const observed: DataChangedPayload[] = []
    const unsubscribe = subscribeDataChanges((event) => observed.push(event))
    try {
      expect(() =>
        db.transaction(() => {
          insertProblem('uncommitted', { last_visited_at: 0 })
          insertSubmission('uncommitted', { verdict: 'AC' })
          expect(expectRecent()).toHaveLength(1)
          expect(db.inTransaction).toBe(true)
          throw new Error('rollback fixture')
        })(),
      ).toThrow('rollback fixture')
      expect(expectRecent()).toEqual([])
      expect(observed).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  it('follows close and reinitialization without retaining a client', () => {
    insertProblem('first')
    const first = getDb()
    expect(expectRecent()).toHaveLength(1)
    closeDb()
    expect(first.open).toBe(false)
    expect(() => getRecentProblems()).toThrow('Database not initialized')
    initDbAtPath(':memory:')
    expect(expectRecent()).toEqual([])
    insertProblem('second')
    expect(expectRecent()[0]?.id).toBe('second')
  })

  it.each(['problems', 'submissions'])('propagates missing %s prepare errors', (table) => {
    const db = getDb()
    db.pragma('foreign_keys = OFF')
    db.exec(`DROP TABLE ${table}`)
    const expected = outcome(() => getOriginalRecentProblems(db))
    expect(expected).toHaveProperty('error')
    expect(outcome(() => getRecentProblems())).toEqual(expected)
  })

  it('propagates execution errors instead of returning a partial or empty list', () => {
    insertProblem('parent')
    insertSubmission('parent')
    const db = getDb()
    db.exec(`ALTER TABLE submissions RENAME TO fixture_submissions;
      CREATE VIEW submissions AS SELECT id, problem_id, json_extract('invalid JSON', '$') AS verdict
      FROM fixture_submissions`)
    const expected = outcome(() => getOriginalRecentProblems(db))
    expect(expected).toHaveProperty('error.message', 'malformed JSON')
    expect(outcome(() => getRecentProblems())).toEqual(expected)
  })
})
