import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import {
  getFirstAcByProblemIds,
  getSubmissionsByPlatform,
  getSubmissionsByProblem,
  getSubmissionsByProblemAsc,
} from '../../electron/db/repositories/submissionRepository'
import { subscribeDataChanges } from '../../electron/shared/dataEvents'
import type { DataChangedPayload } from '../../src/shared/types/data'
import {
  getOriginalFirstAcByProblemIds,
  getOriginalSubmissionsByPlatform,
  getOriginalSubmissionsByProblem,
  getOriginalSubmissionsByProblemAsc,
} from './submission-reads-oracle'

let temporaryDirectory = ''
let serial = 0

beforeEach(() => {
  serial = 0
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-submission-reads-'))
  initDbAtPath(path.join(temporaryDirectory, 'submissions.sqlite'))
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

function insertProblem(id: string, fields: FixtureRow = {}): void {
  insertRow('problems', {
    id,
    platform: 'codeforces',
    platform_problem_id: `problem-${serial++}`,
    canonical_url: 'https://example.test/problem',
    first_seen_at: 0,
    created_at: 0,
    updated_at: 0,
    ...fields,
  })
}

function insertSubmission(problemId: string | null, fields: FixtureRow = {}): void {
  const index = serial++
  insertRow('submissions', {
    id: `submission-${index}`,
    problem_id: problemId,
    platform: 'codeforces',
    platform_submission_id: `remote-${index}`,
    verdict: 'AC',
    submitted_at: 0,
    created_at: 0,
    updated_at: 0,
    ...fields,
  })
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

function expectProblem(problemId: string) {
  const db = getDb()
  const descending = getSubmissionsByProblem(problemId)
  const ascending = getSubmissionsByProblemAsc(problemId)
  expect(descending).toEqual(getOriginalSubmissionsByProblem(db, problemId))
  expect(ascending).toEqual(getOriginalSubmissionsByProblemAsc(db, problemId))
  return { descending, ascending }
}

function expectPlatform(platform: string, limit?: number) {
  const actual = getSubmissionsByPlatform(platform, limit)
  expect(actual).toEqual(getOriginalSubmissionsByPlatform(getDb(), platform, limit))
  return actual
}

function expectFirstAc(problemIds: string[]) {
  const actual = getFirstAcByProblemIds(problemIds)
  expect(actual).toEqual(getOriginalFirstAcByProblemIds(getDb(), problemIds))
  return actual
}

describe('submission read Drizzle parity', () => {
  it('retains all16 fields, nullable IDs, tombstones and nullable parent IDs', () => {
    insertProblem('parent', { deleted_at: 0 })
    insertSubmission('parent', {
      id: null,
      raw_verdict: 'Accepted',
      language: '',
      is_first_ac: 7,
      runtime_ms: 0,
      memory_kb: 0,
      source_url: '',
      raw_json: '{"fixture":true}',
      submitted_at: -0.5,
      created_at: 0.25,
      updated_at: 8_640_000_000_000_001,
      deleted_at: 0,
    })
    insertSubmission('parent', { id: '', submitted_at: 0, deleted_at: null })
    insertSubmission(null, { id: null, submitted_at: 1, deleted_at: 9 })
    const { ascending } = expectProblem('parent')
    expect(ascending[0]).toEqual({
      id: null,
      problem_id: 'parent',
      platform: 'codeforces',
      platform_submission_id: 'remote-1',
      verdict: 'AC',
      raw_verdict: 'Accepted',
      language: '',
      submitted_at: -0.5,
      is_first_ac: 7,
      runtime_ms: 0,
      memory_kb: 0,
      source_url: '',
      raw_json: '{"fixture":true}',
      created_at: 0.25,
      updated_at: 8_640_000_000_000_001,
      deleted_at: 0,
    })
    expect(Object.keys(ascending[0])).toHaveLength(16)
    expect(ascending[1].id).toBe('')
    const platform = expectPlatform('codeforces')
    expect(platform).toHaveLength(3)
    expect(platform[0].problem_id).toBeNull()
    expect(expectFirstAc(['parent'])).toEqual([{ problem_id: 'parent', first_ac_at: -0.5 }])
  })

  it('keeps both direction-only orders, ties, uncapped problem reads and platform default50', () => {
    insertProblem('parent')
    for (let index = 0; index < 61; index++)
      insertSubmission('parent', { submitted_at: Math.floor(index / 2) })
    const rows = expectProblem('parent')
    expect(rows.descending).toHaveLength(61)
    expect(rows.ascending).toHaveLength(61)
    expect(rows.descending[0].submitted_at).toBe(30)
    expect(rows.ascending[0].submitted_at).toBe(0)
    expect(expectPlatform('codeforces')).toHaveLength(50)
    expect(expectPlatform('codeforces', -1)).toHaveLength(61)
    expect(expectPlatform('missing')).toEqual([])
    expect(expectProblem('missing')).toEqual({ ascending: [], descending: [] })
  })

  it.each([
    '',
    'Case',
    'case',
    "O'Reilly",
    '%_\\',
    "' OR 1=1 --",
    ' spaced ',
    '中文',
    'emoji-😀',
    'with\0nul',
    '\ud800',
  ])('keeps literal problem and platform keys %j without normalization', (key) => {
    insertProblem(key)
    insertProblem('other')
    insertSubmission(key, { platform: key, submitted_at: 1 })
    insertSubmission('other', { platform: 'other' })
    expect(expectProblem(key).ascending).toHaveLength(1)
    expect(expectPlatform(key)).toHaveLength(1)
    expect(expectFirstAc([key, key, 'missing'])).toHaveLength(1)
  })

  it.each([-0.5, 0, -123, 1_735_689_600_123, 8_640_000_000_000_001])(
    'keeps raw timestamps and numeric MIN for %s',
    (instant) => {
      insertProblem('raw')
      insertSubmission('raw', {
        submitted_at: instant,
        created_at: instant,
        updated_at: instant,
        deleted_at: instant,
      })
      const row = expectProblem('raw').ascending[0]
      expect([row.submitted_at, row.created_at, row.updated_at, row.deleted_at]).toEqual(
        Array(4).fill(instant),
      )
      expect(expectPlatform('codeforces')[0]).toEqual(row)
      expect(expectFirstAc(['raw'])).toEqual([{ problem_id: 'raw', first_ac_at: instant }])
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
  ])('forwards LIMIT %s unchanged including native failures', (limit) => {
    for (let index = 0; index < 4; index++) insertSubmission(null, { submitted_at: index })
    const expected = outcome(() => getOriginalSubmissionsByPlatform(getDb(), 'codeforces', limit))
    expect(outcome(() => getSubmissionsByPlatform('codeforces', limit))).toEqual(expected)
    if (Number.isInteger(limit) && limit >= -(2 ** 63) && limit < 2 ** 63) {
      expect(expectPlatform('codeforces', limit)).toHaveLength(limit < 0 ? 4 : Math.min(limit, 4))
    } else expect(expected).toHaveProperty('error.message', 'datatype mismatch')
  })

  it('preserves duplicate inputs, exact AC, no-parent joins and raw grouped minimum', () => {
    for (const id of ['', 'zero', 'fraction', 'wrong-case', 'no-ac']) insertProblem(id)
    insertSubmission('', { submitted_at: 10, deleted_at: 0 })
    insertSubmission('zero', { submitted_at: 3 })
    insertSubmission('zero', { submitted_at: 0, id: null })
    insertSubmission('fraction', { submitted_at: 1.75 })
    insertSubmission('fraction', { submitted_at: 9 })
    insertSubmission('wrong-case', { verdict: 'ac', submitted_at: -3 })
    insertSubmission('no-ac', { verdict: 'WA', submitted_at: -4 })
    insertSubmission(null, { submitted_at: -9 })
    getDb().pragma('foreign_keys = OFF')
    insertSubmission('orphan', { submitted_at: -1, deleted_at: 0 })
    getDb().pragma('foreign_keys = ON')
    const ids = ['zero', '', 'missing', 'fraction', 'wrong-case', 'zero', 'no-ac', 'orphan']
    expect(expectFirstAc(ids)).toEqual([
      { problem_id: '', first_ac_at: 10 },
      { problem_id: 'fraction', first_ac_at: 1.75 },
      { problem_id: 'orphan', first_ac_at: -1 },
      { problem_id: 'zero', first_ac_at: 0 },
    ])
    expect(expectProblem('orphan').ascending).toHaveLength(1)
  })

  it('retains empty aggregate short-circuit before DB acquisition or preparation', () => {
    const db = getDb()
    closeDb()
    expect(getFirstAcByProblemIds([])).toEqual([])
    expect(getOriginalFirstAcByProblemIds(db, [])).toEqual([])
    expect(() => getFirstAcByProblemIds(['missing'])).toThrow('Database not initialized')
    initDbAtPath(':memory:')
    getDb().exec('DROP TABLE submissions')
    expect(getFirstAcByProblemIds([])).toEqual([])
    expect(getOriginalFirstAcByProblemIds(getDb(), [])).toEqual([])
    expect(() => getFirstAcByProblemIds(['missing'])).toThrow('no such table')
  })

  it('retains exactly one native variable per input including duplicate boundary cases', () => {
    const option = getDb()
      .prepare<[], { compile_options: string }>('PRAGMA compile_options')
      .all()
      .find((row) => row.compile_options.startsWith('MAX_VARIABLE_NUMBER='))
    expect(option).toBeDefined()
    if (!option) throw new Error('SQLite variable-limit compilation option missing')
    const maximum = Number(option.compile_options.split('=')[1])
    expect(Number.isInteger(maximum) && maximum > 0).toBe(true)
    insertProblem('boundary')
    insertSubmission('boundary')
    const ids = Array<string>(maximum).fill('boundary')
    expect(expectFirstAc(ids)).toEqual([{ problem_id: 'boundary', first_ac_at: 0 }])
    ids.push('boundary')
    const expected = outcome(() => getOriginalFirstAcByProblemIds(getDb(), ids))
    expect(expected).toHaveProperty('error.message', 'too many SQL variables')
    expect(outcome(() => getFirstAcByProblemIds(ids))).toEqual(expected)
  })

  it('is read-only without schema/ledger/change/event or transaction side effects', () => {
    insertProblem('read')
    insertSubmission('read')
    const db = getDb()
    const observed: DataChangedPayload[] = []
    const unsubscribe = subscribeDataChanges((event) => observed.push(event))
    const snapshot = () => [
      db.prepare('SELECT total_changes() AS count').get(),
      db.prepare('SELECT * FROM sqlite_master ORDER BY type,name').all(),
      db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),
    ]
    const before = snapshot()
    try {
      db.pragma('query_only = ON')
      expectProblem('read')
      expectPlatform('codeforces')
      expectFirstAc(['read'])
      expect(db.inTransaction).toBe(false)
      expect(snapshot()).toEqual(before)
      expect(observed).toEqual([])
    } finally {
      db.pragma('query_only = OFF')
      unsubscribe()
    }
  })

  it('reads current uncommitted rows and leaves rollback ownership to caller', () => {
    const db = getDb()
    const observed: DataChangedPayload[] = []
    const unsubscribe = subscribeDataChanges((event) => observed.push(event))
    try {
      expect(() =>
        db.transaction(() => {
          insertProblem('pending')
          insertSubmission('pending')
          expect(expectProblem('pending').ascending).toHaveLength(1)
          expect(expectPlatform('codeforces')).toHaveLength(1)
          expect(expectFirstAc(['pending'])).toHaveLength(1)
          expect(db.inTransaction).toBe(true)
          throw new Error('rollback fixture')
        })(),
      ).toThrow('rollback fixture')
      expect(expectProblem('pending').ascending).toEqual([])
      expect(expectPlatform('codeforces')).toEqual([])
      expect(expectFirstAc(['pending'])).toEqual([])
      expect(observed).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  it('follows close/reinit rather than retaining an old client', () => {
    insertProblem('first')
    insertSubmission('first')
    expectProblem('first')
    const db = getDb()
    closeDb()
    expect(db.open).toBe(false)
    for (const read of [
      () => getSubmissionsByProblem('first'),
      () => getSubmissionsByProblemAsc('first'),
      () => getSubmissionsByPlatform('codeforces'),
      () => getFirstAcByProblemIds(['first']),
    ]) {
      expect(read).toThrow('Database not initialized')
    }
    initDbAtPath(':memory:')
    expect(expectProblem('first')).toEqual({ ascending: [], descending: [] })
    expect(expectPlatform('codeforces')).toEqual([])
    expect(expectFirstAc(['first'])).toEqual([])
    insertProblem('second')
    insertSubmission('second')
    expect(expectProblem('second').ascending).toHaveLength(1)
    expect(expectFirstAc(['second'])).toHaveLength(1)
  })

  it('propagates native missing-table prepare errors for all nonempty readers', () => {
    const db = getDb()
    db.pragma('foreign_keys = OFF')
    db.exec('DROP TABLE submissions')
    const pairs = [
      [() => getOriginalSubmissionsByProblem(db, 'x'), () => getSubmissionsByProblem('x')],
      [() => getOriginalSubmissionsByProblemAsc(db, 'x'), () => getSubmissionsByProblemAsc('x')],
      [() => getOriginalSubmissionsByPlatform(db, 'x'), () => getSubmissionsByPlatform('x')],
      [() => getOriginalFirstAcByProblemIds(db, ['x']), () => getFirstAcByProblemIds(['x'])],
    ]
    for (const [oldRead, newRead] of pairs) {
      const expected = outcome(oldRead)
      expect(expected).toHaveProperty('error')
      expect(outcome(newRead)).toEqual(expected)
    }
    expect(getFirstAcByProblemIds([])).toEqual([])
  })

  it('propagates native step failures without fallback or partial rows', () => {
    insertProblem('parent')
    insertSubmission('parent')
    const db = getDb()
    db.exec(`ALTER TABLE submissions RENAME TO fixture_submissions;
      CREATE VIEW submissions AS SELECT id, problem_id, platform, platform_submission_id, verdict,
      raw_verdict, language, json_extract('invalid JSON', '$') AS submitted_at, is_first_ac,
      runtime_ms, memory_kb, source_url, raw_json, created_at, updated_at, deleted_at
      FROM fixture_submissions`)
    const pairs = [
      [
        () => getOriginalSubmissionsByProblem(db, 'parent'),
        () => getSubmissionsByProblem('parent'),
      ],
      [
        () => getOriginalSubmissionsByProblemAsc(db, 'parent'),
        () => getSubmissionsByProblemAsc('parent'),
      ],
      [
        () => getOriginalSubmissionsByPlatform(db, 'codeforces'),
        () => getSubmissionsByPlatform('codeforces'),
      ],
      [
        () => getOriginalFirstAcByProblemIds(db, ['parent']),
        () => getFirstAcByProblemIds(['parent']),
      ],
    ]
    for (const [oldRead, newRead] of pairs) {
      const expected = outcome(oldRead)
      expect(expected).toHaveProperty('error.message', 'malformed JSON')
      expect(outcome(newRead)).toEqual(expected)
    }
  })
})
