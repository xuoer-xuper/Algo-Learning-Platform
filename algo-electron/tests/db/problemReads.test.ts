import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import {
  getProblemDetail,
  listProblemVisitsByProblem,
} from '../../electron/db/repositories/problemRepository'
import { subscribeDataChanges } from '../../electron/shared/dataEvents'
import type { DataChangedPayload } from '../../src/shared/types/data'
import { problemDetailRecordSchema } from '../../src/shared/types/problem'
import { problemTimelineDataSchema } from '../../src/shared/types/coach'
import { getOriginalProblemDetail, getOriginalProblemVisits } from './problem-reads-oracle'

let temporaryDirectory = ''
let serial = 0

beforeEach(() => {
  serial = 0
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-problem-reads-'))
  initDbAtPath(path.join(temporaryDirectory, 'reads.sqlite'))
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

function insertVisit(problemId: string, fields: FixtureRow = {}): void {
  insertRow('problem_visits', {
    id: `visit-${serial++}`,
    problem_id: problemId,
    platform: 'codeforces',
    url: 'https://example.test/visit',
    entered_at: 0,
    created_at: 0,
    updated_at: 0,
    ...fields,
  })
}

function expectDetail(problemId: string): ReturnType<typeof getProblemDetail> {
  const expected = getOriginalProblemDetail(getDb(), problemId)
  const actual = getProblemDetail(problemId)
  expect(actual).toEqual(expected)
  return actual
}

function expectVisits(problemId: string): ReturnType<typeof listProblemVisitsByProblem> {
  const expected = getOriginalProblemVisits(getDb(), problemId)
  const actual = listProblemVisitsByProblem(problemId)
  expect(actual).toEqual(expected)
  return actual
}

function readError(run: () => unknown): { name: string; message: string; code?: unknown } {
  try {
    run()
  } catch (error) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        ...('code' in error ? { code: error.code } : {}),
      }
    }
    throw error
  }
  throw new Error('Expected the query to fail')
}

describe('problem detail and visit Drizzle parity', () => {
  it('returns null/empty for missing or deleted parents without hiding visits', () => {
    expect(expectDetail('missing')).toBeNull()
    expect(expectVisits('missing')).toEqual([])
    insertProblem('deleted', { deleted_at: 0 })
    insertVisit('deleted', { id: null, deleted_at: 0 })
    expect(expectDetail('deleted')).toBeNull()
    expect(expectVisits('deleted')).toHaveLength(1)
    insertProblem(null)
    expect(expectDetail('null')).toBeNull()
  })

  it.each([
    '',
    "O'Reilly",
    '100%',
    'A_B',
    'path\\key',
    "' OR 1=1 --",
    '中文',
    'emoji-😀',
    'with\0nul',
    '\ud800',
  ])('binds %j literally and returns the native stored representation', (id) => {
    insertProblem(id)
    insertSubmission(id, { id: null })
    insertVisit(id, { id: null })
    const detail = expectDetail(id)
    expect(detail).not.toBeNull()
    expect(detail?.id).toBe(
      getDb().prepare<[string], { id: string }>('SELECT id FROM problems WHERE id = ?').get(id)?.id,
    )
    expect(detail?.submissions).toHaveLength(1)
    expect(expectVisits(id)).toHaveLength(1)
    expect(expectDetail(`${id}not-matching`)).toBeNull()
  })

  it('retains case-sensitive untrimmed equality', () => {
    insertProblem('Case Key ')
    insertSubmission('Case Key ')
    insertVisit('Case Key ')
    for (const id of ['case key ', 'Case Key', ' Case Key ']) {
      expect(expectDetail(id)).toBeNull()
      expect(expectVisits(id)).toEqual([])
    }
    expect(expectDetail('Case Key ')).not.toBeNull()
  })

  it('retains every baseline column and nullable child ID with computed status', () => {
    insertProblem('full', {
      title: null,
      contest_id: '123',
      problem_index: 'A',
      source_platform: 'mirror',
      source_problem_id: 'remote',
      difficulty: 'hard',
      tags_json: '["dp"]',
      first_seen_at: -1,
      last_visited_at: null,
      first_solved_at: 0,
      extra_json: '{"retained":true}',
      created_at: 123,
      updated_at: 456,
    })
    insertSubmission('full', {
      id: null,
      verdict: 'AC',
      raw_verdict: 'Accepted',
      language: 'C++',
      submitted_at: 789,
      is_first_ac: 1,
      runtime_ms: 0,
      memory_kb: 1024,
      source_url: 'https://example.test/submission',
      raw_json: '{"extra":true}',
      created_at: 123,
      updated_at: 456,
      deleted_at: 0,
    })
    insertSubmission('full', { id: '', verdict: 'WA', submitted_at: 1 })
    const result = expectDetail('full')
    expect(result).toMatchObject({
      status: 'solved',
      submission_count: 2,
      ac_count: 1,
      difficulty: 'hard',
      tags_json: '["dp"]',
      extra_json: '{"retained":true}',
    })
    const parentColumns = getDb()
      .prepare<[], { name: string }>('PRAGMA table_info(problems)')
      .all()
      .map((column) => column.name)
    const submissionColumns = getDb()
      .prepare<[], { name: string }>('PRAGMA table_info(submissions)')
      .all()
      .map((column) => column.name)
    expect(Object.keys(result ?? {}).sort()).toEqual(
      [...parentColumns, 'submission_count', 'ac_count', 'submissions'].sort(),
    )
    expect(Object.keys(result?.submissions[0] ?? {}).sort()).toEqual(submissionColumns.sort())
    expect(result?.submissions[0]).toMatchObject({
      id: null,
      is_first_ac: 1,
      deleted_at: 0,
      language: 'C++',
      raw_json: '{"extra":true}',
    })
    expect(problemDetailRecordSchema.safeParse(result).success).toBe(true)
  })

  it('keeps all nullable stored fields and the stored status when there is no submission', () => {
    insertProblem('nullable', { title: null, status: 'unknown' })
    const detail = expectDetail('nullable')
    expect(detail).toMatchObject({
      status: 'unknown',
      submission_count: 0,
      ac_count: 0,
      title: null,
      last_visited_at: null,
      first_solved_at: null,
      deleted_at: null,
      difficulty: null,
      tags_json: null,
      extra_json: null,
    })
    insertSubmission('nullable', { id: null, deleted_at: 0 })
    expect(expectDetail('nullable')).toMatchObject({
      status: 'attempted',
      submission_count: 1,
      ac_count: 0,
    })
  })

  it('counts all rows but returns only the newest 100 submissions with unchanged ties', () => {
    insertProblem('many')
    for (let i = 0; i < 103; i++)
      insertSubmission('many', {
        id: i === 0 ? null : `many-${i}`,
        submitted_at: Math.floor(i / 2),
        verdict: i === 0 ? 'AC' : 'WA',
        deleted_at: i % 2 === 0 ? 0 : null,
      })
    const detail = expectDetail('many')
    expect(detail).toMatchObject({ status: 'solved', submission_count: 103, ac_count: 1 })
    expect(detail?.submissions).toHaveLength(100)
    expect(detail?.submissions[0]?.submitted_at).toBe(51)
    expect(detail?.submissions.at(-1)?.submitted_at).toBe(1)
  })

  it('selects exactly the ten visit fields, preserves nullable values and has no row cap', () => {
    insertProblem('visits')
    for (let i = 0; i < 105; i++)
      insertVisit('visits', {
        id: i === 0 ? null : i === 1 ? '' : `visit-${i}`,
        entered_at: Math.floor(i / 2),
        deleted_at: 0,
      })
    const visits = expectVisits('visits')
    expect(visits).toHaveLength(105)
    expect(Object.keys(visits[0] ?? {}).sort()).toEqual(
      [
        'id',
        'problem_id',
        'session_id',
        'platform',
        'url',
        'entered_at',
        'left_at',
        'duration_seconds',
        'active_seconds',
        'leave_reason',
      ].sort(),
    )
    expect(visits[0]).toMatchObject({
      id: null,
      entered_at: 0,
      left_at: null,
      duration_seconds: null,
      active_seconds: null,
      leave_reason: null,
    })
    expect(visits.at(-1)?.entered_at).toBe(52)
  })

  it.each([-0.5, 0, -123, 1735689600123, 8640000000000001])(
    'preserves raw instant %s in all outward time fields',
    (instant) => {
      insertProblem('raw', {
        first_seen_at: instant,
        last_visited_at: instant,
        first_solved_at: instant,
        created_at: instant,
        updated_at: instant,
      })
      insertSubmission('raw', {
        submitted_at: instant,
        created_at: instant,
        updated_at: instant,
        deleted_at: instant,
      })
      insertVisit('raw', { entered_at: instant, left_at: instant })
      const detail = expectDetail('raw')
      expect(detail).toMatchObject({
        first_seen_at: instant,
        last_visited_at: instant,
        first_solved_at: instant,
        created_at: instant,
        updated_at: instant,
      })
      expect(detail?.submissions[0]).toMatchObject({
        submitted_at: instant,
        created_at: instant,
        updated_at: instant,
        deleted_at: instant,
      })
      expect(expectVisits('raw')[0]).toMatchObject({ entered_at: instant, left_at: instant })
    },
  )

  it('retains orphan visit reads without adding a parent join', () => {
    getDb().pragma('foreign_keys = OFF')
    insertVisit('orphan', { id: null })
    expect(expectDetail('orphan')).toBeNull()
    expect(expectVisits('orphan')).toHaveLength(1)
  })

  it('does not write or notify under query_only and sees the current transaction', () => {
    insertProblem('read')
    insertSubmission('read')
    insertVisit('read')
    const db = getDb()
    const observed: DataChangedPayload[] = []
    const unsubscribe = subscribeDataChanges((event) => observed.push(event))
    const before = db.prepare('SELECT total_changes() AS count').get()
    try {
      db.pragma('query_only = ON')
      expectDetail('read')
      expectVisits('read')
      expect(db.prepare('SELECT total_changes() AS count').get()).toEqual(before)
      db.pragma('query_only = OFF')
      expect(() =>
        db.transaction(() => {
          insertProblem('uncommitted')
          insertSubmission('uncommitted')
          insertVisit('uncommitted')
          expectDetail('uncommitted')
          expect(expectVisits('uncommitted')).toHaveLength(1)
          expect(db.inTransaction).toBe(true)
          throw new Error('rollback fixture')
        })(),
      ).toThrow('rollback fixture')
      expect(expectDetail('uncommitted')).toBeNull()
      expect(expectVisits('uncommitted')).toEqual([])
      expect(observed).toEqual([])
    } finally {
      db.pragma('query_only = OFF')
      unsubscribe()
    }
  })

  it('follows close and reinitialization without retaining an adapter', () => {
    insertProblem('first')
    const first = getDb()
    expectDetail('first')
    closeDb()
    expect(first.open).toBe(false)
    expect(() => getProblemDetail('first')).toThrow('Database not initialized')
    expect(() => listProblemVisitsByProblem('first')).toThrow('Database not initialized')
    initDbAtPath(':memory:')
    expect(expectDetail('first')).toBeNull()
    expect(expectVisits('first')).toEqual([])
    insertProblem('second')
    expectDetail('second')
  })

  it('propagates native prepare failures for parent and visit reads', () => {
    const db = getDb()
    db.pragma('foreign_keys = OFF')
    db.exec('DROP TABLE problems; DROP TABLE problem_visits')
    expect(readError(() => getProblemDetail('missing'))).toEqual(
      readError(() => getOriginalProblemDetail(db, 'missing')),
    )
    expect(readError(() => listProblemVisitsByProblem('missing'))).toEqual(
      readError(() => getOriginalProblemVisits(db, 'missing')),
    )
  })

  it('does not execute the child projection for absent parents and preserves child step errors', () => {
    insertProblem('parent')
    insertSubmission('parent')
    const db = getDb()
    db.exec(`ALTER TABLE submissions RENAME TO fixture_submissions;
      CREATE VIEW submissions AS SELECT id, problem_id, platform, platform_submission_id, verdict,
      raw_verdict, json_extract('invalid JSON', '$') AS language, submitted_at, is_first_ac,
      runtime_ms, memory_kb, source_url, raw_json, created_at, updated_at, deleted_at
      FROM fixture_submissions`)
    expect(expectDetail('missing')).toBeNull()
    expect(readError(() => getProblemDetail('parent'))).toEqual(
      readError(() => getOriginalProblemDetail(db, 'parent')),
    )
  })

  it('allows null visit IDs through the existing timeline output contract', () => {
    insertProblem('timeline')
    insertVisit('timeline', { id: null })
    const visit = expectVisits('timeline')[0]
    if (!visit) throw new Error('Missing fixture visit')
    const point = {
      visit_id: visit.id,
      entered_at: visit.entered_at,
      left_at: visit.left_at,
      duration_seconds: visit.duration_seconds,
      active_seconds: visit.active_seconds,
      leave_reason: visit.leave_reason,
      url: visit.url,
    }
    expect(problemTimelineDataSchema.shape.visits.safeParse([point]).success).toBe(true)
  })
})
