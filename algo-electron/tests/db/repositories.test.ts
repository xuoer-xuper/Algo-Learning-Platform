import assert from 'node:assert'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { getOriginalOmniboxSuggestions } from './omnibox-suggestions-oracle'
import { getOriginalProblemDetail, getOriginalProblemVisits } from './problem-reads-oracle'
import { getOriginalRecentProblems } from './problem-recent-oracle'
import {
  getOriginalStatsPlatformDistribution,
  getOriginalStatsProblemVisits,
  getOriginalStatsLastActive,
} from './stats-basic-reads-oracle'
import { runOriginalSubmissionUpsert } from './submission-upsert-oracle'
import {
  runOriginalUpdateFirstAc,
  runOriginalRecomputeProblemSubmissionState,
} from './submission-first-ac-oracle'
import type { SubmissionData } from '../../electron/shared/types'
import {
  getOriginalFirstAcByProblemIds,
  getOriginalSubmissionsByPlatform,
  getOriginalSubmissionsByProblem,
  getOriginalSubmissionsByProblemAsc,
} from './submission-reads-oracle'
import { eq } from 'drizzle-orm'
import { createDrizzleClient } from '../../src/main/db/client'
import { notes as ormNotes, userScriptResources as ormResources } from '../../src/main/db/schema'
import {
  subscribeDataChanges,
  withDataChangeTransaction,
} from '../../electron/shared/dataEvents.ts'
import { runUserScriptTransaction } from '../../electron/db/repositories/userScript/mutations.ts'
import {
  getUserScriptValue,
  setUserScriptValue,
} from '../../electron/db/repositories/userScriptRuntimeRepository.ts'
import type { DataChangedPayload } from '../../src/shared/types/data.ts'
import { localDayBounds, shiftLocalDay, toLocalDay } from '../../src/shared/time.ts'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection.ts'
import {
  deleteProblem,
  findProblemIdByPlatformKey,
  getOmniboxSuggestions,
  getOverviewStats,
  getProblemDetail,
  getRecentProblems,
  listProblemVisitsByProblem,
  upsertProblem,
} from '../../electron/db/repositories/problemRepository.ts'
import {
  getFirstAcByProblemIds,
  getSubmissionsByPlatform,
  getSubmissionsByProblem,
  getSubmissionsByProblemAsc,
  updateFirstAc,
  recomputeProblemSubmissionState,
  upsertSubmission,
} from '../../electron/db/repositories/submissionRepository.ts'
import {
  getVisitedTrend,
  getPlatformDistribution as getStatsPlatformDistribution,
  getProblemVisitStats,
  getLastActiveTime as getStatsLastActiveTime,
  recomputeDailyStats,
} from '../../electron/db/repositories/statsRepository.ts'
import {
  computePeakRating,
  getAccount,
  getAccountById,
  getAccountsByPlatform,
  getRatingHistory,
  updateCurrentRating,
  updatePeakRating,
  upsertAccount,
  upsertRatingHistory,
} from '../../electron/db/repositories/accountRepository.ts'
import {
  confirmImportSites,
  createSite,
  deleteSite,
  getAllSites,
  getSiteById,
  previewImportSites,
  seedBuiltinSites,
  toggleSite,
} from '../../electron/db/repositories/siteRepository.ts'
import {
  createScript,
  deleteScript,
  getAllScripts,
  getEnabledScripts,
  getScriptById,
  toggleScript,
  updateScript,
} from '../../electron/db/repositories/userScriptRepository.ts'
import {
  deleteAIOutput,
  getAIOutput,
  listAIOutputs,
  saveAIOutput,
  updateAIOutput,
} from '../../electron/db/repositories/aiOutputRepository.ts'
import {
  ensureTodaySnapshot,
  getSnapshotByDate,
  listSnapshots,
} from '../../electron/db/repositories/aiContextSnapshotRepository.ts'
import {
  getCookieRecordsBySite,
  getCookieSummaryByDomain,
  getCookieSummaryBySite,
  replaceCookieMetadataForDomain,
  upsertCookieMetadata,
} from '../../electron/db/repositories/cookieRecordRepository.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

const day = '2026-07-03'
const now = Date.parse(`${day}T10:00:00+08:00`)

test('wraps the existing Electron SQLite connection with millisecond Date and BLOB fidelity', () => {
  const sqlite = getDbForTest()
  const orm = createDrizzleClient(sqlite)
  assert.strictEqual(orm.$client, sqlite)
  orm
    .insert(ormNotes)
    .values({
      id: 'orm-note',
      title: 'Synthetic ORM',
      file_path: 'synthetic.md',
      created_at: new Date(0),
      updated_at: new Date(1768443630123),
      deleted_at: null,
    })
    .run()
  const note = orm.select().from(ormNotes).where(eq(ormNotes.id, 'orm-note')).get()
  assert.ok(note)
  assert.strictEqual(note.created_at.getTime(), 0)
  assert.strictEqual(note.updated_at.getTime(), 1768443630123)
  assert.strictEqual(note.deleted_at, null)
  const scriptId = createScript({
    name: 'ORM bytes',
    description: null,
    version: '1',
    match_urls_json: '[]',
    code: '',
    file_path: null,
    site_ids_json: null,
    enabled: true,
  })
  const bytes = Buffer.from([0, 128, 255])
  orm
    .insert(ormResources)
    .values({
      id: 'orm-resource',
      script_id: scriptId,
      resource_kind: 'resource',
      resource_key: 'asset',
      declaration_order: 0,
      source_url: 'https://example.test/asset',
      content_blob: bytes,
      created_at: new Date(0),
      updated_at: new Date(0),
    })
    .run()
  assert.deepStrictEqual(orm.select().from(ormResources).get()?.content_blob, bytes)
  assert.throws(
    () =>
      orm.transaction((transaction) => {
        transaction.delete(ormNotes).where(eq(ormNotes.id, 'orm-note')).run()
        throw new Error('ORM rollback')
      }),
    /ORM rollback/,
  )
  assert.ok(orm.select().from(ormNotes).where(eq(ormNotes.id, 'orm-note')).get())
  assert.strictEqual(
    sqlite.prepare("SELECT name FROM sqlite_schema WHERE name='__drizzle_migrations'").get(),
    undefined,
  )
})

test('returns numeric overview counts and preserves epoch zero with the Electron SQLite ABI', () => {
  const sqlite = getDbForTest()
  assert.deepStrictEqual(getOverviewStats(), {
    totalProblems: 0,
    todayVisited: 0,
    platformDistribution: [],
    lastActiveTime: null,
  })
  sqlite
    .prepare(
      `INSERT INTO problems
        (id, platform, platform_problem_id, canonical_url, first_seen_at, created_at, updated_at)
       VALUES (NULL, 'codeforces', 'overview', 'https://example.test/overview', 0, 0, 0)`,
    )
    .run()
  sqlite
    .prepare(
      `INSERT INTO activity_events (id, event_type, occurred_at, local_day, created_at, deleted_at)
       VALUES ('overview', 'visit_start', 0, '1970-01-01', 0, 0)`,
    )
    .run()
  assert.deepStrictEqual(getOverviewStats(), {
    totalProblems: 1,
    todayVisited: 0,
    platformDistribution: [{ platform: 'codeforces', count: 1 }],
    lastActiveTime: 0,
  })
  sqlite.prepare('UPDATE activity_events SET occurred_at = ?').run(1768443630123)
  assert.strictEqual(getOverviewStats().lastActiveTime, 1768443630123)
})

test('preserves literal lookup keys and nullable IDs with the Electron SQLite ABI', () => {
  const sqlite = getDbForTest()
  const insert = sqlite.prepare(
    `INSERT INTO problems
      (id, platform, platform_problem_id, canonical_url, first_seen_at, created_at, updated_at, deleted_at)
     VALUES (?, 'codeforces', ?, 'https://example.test/lookup', 0, 0, 0, ?)`,
  )
  insert.run('literal', "A_%'", null)
  insert.run(null, 'null', null)
  insert.run('', 'empty', null)
  insert.run('deleted', 'deleted', 0)

  assert.strictEqual(findProblemIdByPlatformKey('codeforces', "A_%'"), 'literal')
  assert.strictEqual(findProblemIdByPlatformKey('Codeforces', "A_%'"), null)
  assert.strictEqual(findProblemIdByPlatformKey('codeforces', 'null'), null)
  assert.strictEqual(findProblemIdByPlatformKey('codeforces', 'empty'), '')
  assert.strictEqual(findProblemIdByPlatformKey('codeforces', 'deleted'), null)
  assert.strictEqual(findProblemIdByPlatformKey('codeforces', "' OR 1=1 --"), null)
})

test('preserves the recent visit horizon before parent and query filtering with the Electron SQLite ABI', () => {
  const sqlite = getDbForTest()
  const insertProblem = sqlite.prepare(
    `INSERT INTO problems
      (id, platform, platform_problem_id, canonical_url, title, first_seen_at, created_at, updated_at, deleted_at)
     VALUES (?, 'codeforces', ?, 'https://example.test/canonical', 'Unrelated title', 0, 0, 0, ?)`,
  )
  const insertHistory = sqlite.prepare(
    `INSERT INTO problem_visits
      (id, problem_id, platform, url, entered_at, created_at, updated_at, deleted_at)
     VALUES (?, ?, 'codeforces', ?, ?, 0, 0, ?)`,
  )
  insertProblem.run('candidate', 'candidate', null)
  insertProblem.run('tombstoned', 'tombstoned', 0)
  insertHistory.run('cutoff', 'candidate', 'https://example.test/history/needle', 0, null)
  for (let index = 1; index <= 64; index += 1) {
    insertHistory.run(
      `newer-${index}`,
      index === 64 ? 'tombstoned' : 'candidate',
      `https://example.test/history/other-${index}`,
      index,
      null,
    )
  }

  // The sole matching URL is 65th; tombstoned parents still consume a CTE slot.
  assert.deepStrictEqual(
    getOmniboxSuggestions('needle'),
    getOriginalOmniboxSuggestions(sqlite, 'needle'),
  )
  assert.deepStrictEqual(getOmniboxSuggestions('needle'), [])

  // Deleted visits, unlike visits to deleted parents, do not consume a slot.
  sqlite.prepare("UPDATE problem_visits SET deleted_at = 0 WHERE id = 'newer-1'").run()
  for (let index = 0; index < 70; index += 1) {
    insertHistory.run(
      `deleted-${index}`,
      'candidate',
      'https://example.test/history/needle-deleted',
      index + 100,
      0,
    )
  }
  const suggestions = getOmniboxSuggestions('needle')
  assert.deepStrictEqual(suggestions, getOriginalOmniboxSuggestions(sqlite, 'needle'))
  assert.deepStrictEqual(suggestions, [
    {
      problemId: 'candidate',
      title: 'Unrelated title',
      platform: 'codeforces',
      platformProblemId: 'candidate',
      url: 'https://example.test/history/needle',
      lastVisitedAt: 0,
      source: 'history',
    },
  ])
})

test('keeps empty parent and null visit IDs with numeric read-only suggestions in the Electron SQLite ABI', () => {
  const sqlite = getDbForTest()
  const insertProblem = sqlite.prepare(
    `INSERT INTO problems
      (id, platform, platform_problem_id, canonical_url, title, first_seen_at, last_visited_at, created_at, updated_at)
     VALUES (?, 'codeforces', ?, 'https://example.test/unrelated', NULL, 0, NULL, 0, 0)`,
  )
  const insertHistory = sqlite.prepare(
    `INSERT INTO problem_visits
      (id, problem_id, platform, url, entered_at, created_at, updated_at)
     VALUES (?, ?, 'codeforces', ?, ?, 0, 0)`,
  )
  insertProblem.run('', 'empty-key')
  insertProblem.run('millis', 'millis-key')
  insertProblem.run(null, 'nullable-parent')
  insertHistory.run(null, '', 'https://example.test/history/native-only-zero', 0)
  insertHistory.run(
    'millis-visit',
    'millis',
    'https://example.test/history/native-only-millis',
    1768443630123,
  )
  const problemsBefore = sqlite.prepare('SELECT * FROM problems ORDER BY rowid').all()
  const visitsBefore = sqlite.prepare('SELECT * FROM problem_visits ORDER BY rowid').all()
  const events: DataChangedPayload[] = []
  const dispose = subscribeDataChanges((payload) => events.push(payload))
  sqlite.pragma('query_only = ON')
  try {
    const suggestions = getOmniboxSuggestions('native-only')
    assert.deepStrictEqual(suggestions, getOriginalOmniboxSuggestions(sqlite, 'native-only'))
    assert.deepStrictEqual(suggestions, [
      {
        problemId: 'millis',
        title: null,
        platform: 'codeforces',
        platformProblemId: 'millis-key',
        url: 'https://example.test/history/native-only-millis',
        lastVisitedAt: 1768443630123,
        source: 'history',
      },
      {
        problemId: '',
        title: null,
        platform: 'codeforces',
        platformProblemId: 'empty-key',
        url: 'https://example.test/history/native-only-zero',
        lastVisitedAt: 0,
        source: 'history',
      },
    ])
    for (const suggestion of suggestions) {
      assert.strictEqual(typeof suggestion.lastVisitedAt, 'number')
    }
    assert.deepStrictEqual(
      sqlite.prepare('SELECT * FROM problems ORDER BY rowid').all(),
      problemsBefore,
    )
    assert.deepStrictEqual(
      sqlite.prepare('SELECT * FROM problem_visits ORDER BY rowid').all(),
      visitsBefore,
    )
    assert.deepStrictEqual(events, [])
    assert.strictEqual(
      sqlite.prepare("SELECT name FROM sqlite_schema WHERE name = '__drizzle_migrations'").get(),
      undefined,
    )
  } finally {
    sqlite.pragma('query_only = OFF')
    dispose()
  }
})

test('preserves bound-null upsert notifications and integer time writes with the Electron SQLite ABI', () => {
  const sqlite = getDbForTest()
  sqlite
    .prepare(
      `INSERT INTO problems
    (id, platform, platform_problem_id, canonical_url, title, first_seen_at, created_at, updated_at)
    VALUES (NULL, 'codeforces', 'null-id', 'https://example.test/original', 'Original title', 0, 0, 0)`,
    )
    .run()
  const before = sqlite.prepare('SELECT * FROM problems').all()
  const events: DataChangedPayload[] = []
  const dispose = subscribeDataChanges((payload) => events.push(payload))
  const originalNow = Date.now
  let clock = 0
  Date.now = () => clock
  try {
    upsertProblem({
      platform: 'codeforces',
      platformProblemId: 'null-id',
      canonicalUrl: 'https://example.test/ignored',
      confidence: 'url',
    })
    assert.deepStrictEqual(sqlite.prepare('SELECT * FROM problems').all(), before)
    assert.deepStrictEqual(events, [{ tables: ['problems', 'stats'] }])
    upsertProblem({
      platform: 'codeforces',
      platformProblemId: 'normal',
      canonicalUrl: 'https://example.test/normal',
      confidence: 'url',
    })
    clock = 1768443630123
    upsertProblem({
      platform: 'codeforces',
      platformProblemId: 'normal',
      canonicalUrl: 'https://example.test/updated',
      confidence: 'url',
    })
    assert.deepStrictEqual(
      sqlite
        .prepare(
          `SELECT first_seen_at, created_at, last_visited_at,
      updated_at, typeof(updated_at) AS storage FROM problems WHERE platform_problem_id = 'normal'`,
        )
        .get(),
      {
        first_seen_at: 0,
        created_at: 0,
        last_visited_at: clock,
        updated_at: clock,
        storage: 'integer',
      },
    )
    assert.strictEqual(events.length, 3)
  } finally {
    Date.now = originalNow
    dispose()
  }
})

test('publishes script changes after native commit and suppresses failed nested writes', () => {
  const events: DataChangedPayload[] = []
  const transactionStates: boolean[] = []
  const dispose = subscribeDataChanges((payload) => {
    transactionStates.push(getDbForTest().inTransaction)
    events.push(payload)
  })
  try {
    const id = runUserScriptTransaction(() => {
      const created = createScript({
        name: 'Refresh fixture',
        description: null,
        version: '1.0',
        match_urls_json: '[]',
        code: '',
        file_path: null,
        site_ids_json: null,
        enabled: true,
      })
      runUserScriptTransaction(() => setUserScriptValue(created, 'state', 'committed'))
      assert.deepStrictEqual(events, [])
      return created
    })
    assert.deepStrictEqual(events, [{ tables: ['scripts'] }])
    assert.deepStrictEqual(transactionStates, [false])
    events.length = 0
    assert.throws(
      () =>
        runUserScriptTransaction(() => {
          runUserScriptTransaction(() => setUserScriptValue(id, 'state', 'rolled back'))
          throw new Error('installer failed')
        }),
      /installer failed/,
    )
    assert.strictEqual(getUserScriptValue(id, 'state')?.value, 'committed')
    assert.deepStrictEqual(events, [])
    assert.strictEqual(updateScript('missing-script', { enabled: false }), false)
    assert.deepStrictEqual(events, [])
    replaceCookieMetadataForDomain('example', 'example.com', [])
    getCookieSummaryBySite('example')
    assert.deepStrictEqual(events, [], 'read-side cookie metadata is outside the refresh bus')
  } finally {
    dispose()
  }
})

interface ProblemRow {
  id: string
  platform: string
  platform_problem_id: string
  canonical_url: string
  title: string | null
  status: string
  contest_id: string | null
  problem_index: string | null
  first_solved_at: number | null
}

interface DailyStatsRow {
  local_day: string
  active_seconds: number
  duration_seconds: number
  visited_problem_count: number
  solved_problem_count: number
  submission_count: number
  ac_submission_count: number
  platform_distribution_json: string | null
}

function getProblemByPlatformId(
  db: Database.Database,
  platform: string,
  platformProblemId: string,
): ProblemRow {
  const row = db
    .prepare(
      `
    SELECT id, platform, platform_problem_id, canonical_url, title, status, contest_id, problem_index, first_solved_at
    FROM problems
    WHERE platform = ? AND platform_problem_id = ?
  `,
    )
    .get(platform, platformProblemId) as ProblemRow | undefined
  assert.ok(row, `Expected problem ${platform}:${platformProblemId}`)
  return row
}

function insertVisit(
  db: Database.Database,
  id: string,
  problem: ProblemRow,
  durationSeconds: number,
  activeSeconds: number,
): void {
  db.prepare(
    `
    INSERT INTO problem_visits
      (id, problem_id, session_id, platform, url, entered_at, left_at, duration_seconds, active_seconds, leave_reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    problem.id,
    'session-repository-test',
    problem.platform,
    problem.canonical_url,
    Date.parse(`${day}T09:00:00+08:00`),
    Date.parse(`${day}T09:05:00+08:00`),
    durationSeconds,
    activeSeconds,
    'test',
    now,
    now,
  )
}

function seedCodeforcesProblem(): ProblemRow {
  const db = getDbForTest()
  upsertProblem({
    platform: 'codeforces',
    platformProblemId: '1000A',
    canonicalUrl: 'https://codeforces.com/contest/1000/problem/A',
    title: 'A. Example Problem',
    contestId: '1000',
    problemIndex: 'A',
    confidence: 'url',
  })
  return getProblemByPlatformId(db, 'codeforces', '1000A')
}

function seedCodeforcesSubmissions(problem: ProblemRow): void {
  assert.strictEqual(
    upsertSubmission({
      platform: 'codeforces',
      platformSubmissionId: 'cf-1',
      problemId: problem.id,
      verdict: 'WA',
      rawVerdict: 'WRONG_ANSWER',
      language: 'GNU C++23',
      submittedAt: Date.parse(`${day}T10:00:00+08:00`),
      runtimeMs: 15,
      memoryKb: 800,
      sourceUrl: 'https://codeforces.com/contest/1000/submission/1',
    }),
    true,
  )

  assert.strictEqual(
    upsertSubmission({
      platform: 'codeforces',
      platformSubmissionId: 'cf-2',
      problemId: problem.id,
      verdict: 'AC',
      rawVerdict: 'OK',
      language: 'GNU C++23',
      submittedAt: Date.parse(`${day}T10:02:00+08:00`),
    }),
    true,
  )
}

function seedNativeDeletionRows(activityAt: number): ProblemRow {
  const sqlite = getDbForTest()
  const problem = seedCodeforcesProblem()
  seedCodeforcesSubmissions(problem)
  insertVisit(sqlite, 'delete-visit', problem, 120, 90)
  sqlite
    .prepare(
      `INSERT INTO activity_events
    (id, event_type, occurred_at, local_day, problem_id, created_at, deleted_at)
    VALUES (NULL, 'visit_start', ?, '1900-01-01', ?, 0, 0)`,
    )
    .run(activityAt, problem.id)
  sqlite
    .prepare(
      `INSERT INTO notes (id, problem_id, title, file_path, created_at, updated_at)
    VALUES ('delete-note', ?, 'Preserve this note', 'synthetic.md', 0, 0)`,
    )
    .run(problem.id)
  return problem
}

test('deletes facts and recomputes affected days after native commit while preserving notes', () => {
  const sqlite = getDbForTest()
  const visitDay = toLocalDay(Date.parse(`${day}T09:00:00+08:00`))
  const submissionDay = shiftLocalDay(visitDay, 1)
  const activityDay = shiftLocalDay(visitDay, 2)
  const unaffectedDay = shiftLocalDay(visitDay, 3)
  const target = seedNativeDeletionRows(localDayBounds(activityDay).start + 321)
  sqlite
    .prepare('UPDATE submissions SET submitted_at = ? WHERE problem_id = ?')
    .run(localDayBounds(submissionDay).start + 123, target.id)
  sqlite
    .prepare('UPDATE problems SET first_solved_at = 0, deleted_at = 0 WHERE id = ?')
    .run(target.id)
  upsertProblem({
    platform: 'codeforces',
    platformProblemId: '1000B',
    canonicalUrl: 'https://example.test/retained',
    confidence: 'url',
  })
  const retained = getProblemByPlatformId(sqlite, 'codeforces', '1000B')
  assert.strictEqual(retained.first_solved_at, null)
  insertVisit(sqlite, 'retained-visit', retained, 40, 30)
  const affectedDays = [toLocalDay(0), visitDay, submissionDay, activityDay].sort()
  for (const date of [...affectedDays, unaffectedDay]) recomputeDailyStats(date)
  sqlite
    .prepare('UPDATE user_daily_stats SET submission_count = 77 WHERE local_day IN (?, ?)')
    .run(activityDay, unaffectedDay)
  const noteBefore = sqlite.prepare('SELECT * FROM notes').all()
  const unaffectedBefore = sqlite
    .prepare('SELECT * FROM user_daily_stats WHERE local_day = ?')
    .get(unaffectedDay)
  const events: DataChangedPayload[] = []
  const transactionStates: boolean[] = []
  const dispose = subscribeDataChanges((payload) => {
    events.push(payload)
    transactionStates.push(sqlite.inTransaction)
  })
  try {
    assert.strictEqual(deleteProblem(target.id), true)
    assert.deepStrictEqual(sqlite.prepare('SELECT id FROM problems').all(), [{ id: retained.id }])
    assert.deepStrictEqual(sqlite.prepare('SELECT id FROM problem_visits').all(), [
      { id: 'retained-visit' },
    ])
    assert.deepStrictEqual(sqlite.prepare('SELECT * FROM submissions').all(), [])
    assert.deepStrictEqual(sqlite.prepare('SELECT * FROM activity_events').all(), [])
    assert.deepStrictEqual(sqlite.prepare('SELECT * FROM notes').all(), noteBefore)
    assert.deepStrictEqual(
      sqlite.prepare('SELECT * FROM user_daily_stats WHERE local_day = ?').get(unaffectedDay),
      unaffectedBefore,
    )
    for (const date of affectedDays) {
      assert.deepStrictEqual(
        sqlite
          .prepare(
            `SELECT active_seconds, duration_seconds,
        visited_problem_count, solved_problem_count, submission_count, ac_submission_count
        FROM user_daily_stats WHERE local_day = ?`,
          )
          .get(date),
        {
          active_seconds: date === visitDay ? 30 : 0,
          duration_seconds: date === visitDay ? 40 : 0,
          visited_problem_count: date === visitDay ? 1 : 0,
          solved_problem_count: 0,
          submission_count: 0,
          ac_submission_count: 0,
        },
      )
    }
    assert.deepStrictEqual(events, [
      { tables: ['problems', 'submissions', 'stats'] },
      ...affectedDays.map(() => ({ tables: ['stats'] })),
    ])
    assert.deepStrictEqual(
      transactionStates,
      events.map(() => false),
    )
    events.length = 0
    assert.strictEqual(deleteProblem(target.id), false)
    assert.deepStrictEqual(events, [])
    assert.deepStrictEqual(sqlite.pragma('foreign_key_check'), [])
  } finally {
    dispose()
  }
})

test('rolls back problem deletion and suppresses notifications when native COMMIT fails', () => {
  const sqlite = getDbForTest()
  const target = seedNativeDeletionRows(now)
  recomputeDailyStats(toLocalDay(now))
  sqlite.exec(
    'CREATE TABLE delete_commit_probe (problem_id TEXT REFERENCES problems(id) DEFERRABLE INITIALLY DEFERRED)',
  )
  sqlite.prepare('INSERT INTO delete_commit_probe VALUES (?)').run(target.id)
  let parentDeleteExecuted = false
  sqlite.function('observe_parent_delete', () => {
    parentDeleteExecuted = true
    return 0
  })
  sqlite.exec(`CREATE TRIGGER observe_parent_delete AFTER DELETE ON problems
    BEGIN SELECT observe_parent_delete(); END;`)
  const snapshot = () =>
    [
      'problems',
      'submissions',
      'problem_visits',
      'activity_events',
      'notes',
      'user_daily_stats',
      'delete_commit_probe',
    ].map((table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
  const before = snapshot()
  const events: DataChangedPayload[] = []
  const dispose = subscribeDataChanges((payload) => events.push(payload))
  try {
    assert.throws(() => deleteProblem(target.id), /FOREIGN KEY constraint failed/)
    assert.strictEqual(
      parentDeleteExecuted,
      true,
      'The deferred constraint must fail after the parent DELETE executed',
    )
    assert.strictEqual(sqlite.inTransaction, false)
    assert.deepStrictEqual(snapshot(), before)
    assert.deepStrictEqual(events, [])
    assert.deepStrictEqual(sqlite.pragma('foreign_key_check'), [])
  } finally {
    dispose()
  }
})

test('runs migrations into a temporary database', () => {
  const db = getDbForTest()
  const migrations = db.prepare('SELECT COUNT(*) as count FROM schema_migrations').get() as {
    count: number
  }
  assert.strictEqual(migrations.count, 30)

  const tables = db
    .prepare(
      `
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name IN (
      'cookie_records', 'problems', 'submissions', 'sync_queue', 'user_daily_stats',
      'user_script_values', 'user_script_resources',
      'user_script_host_permissions', 'user_script_update_state'
    )
    ORDER BY name
  `,
    )
    .all() as { name: string }[]
  assert.deepStrictEqual(
    tables.map((row) => row.name),
    [
      'cookie_records',
      'problems',
      'submissions',
      'sync_queue',
      'user_daily_stats',
      'user_script_host_permissions',
      'user_script_resources',
      'user_script_update_state',
      'user_script_values',
    ],
  )

  const submissionDeletedAt = db
    .prepare(`PRAGMA table_info(submissions)`)
    .all()
    .some((column: any) => column.name === 'deleted_at')
  assert.strictEqual(submissionDeletedAt, true)
})

test('persists cookie metadata without storing cookie values or enabling sync', () => {
  const db = getDbForTest()
  const first = upsertCookieMetadata({
    siteId: 'leetcode-cn',
    domain: 'leetcode.cn',
    name: 'LEETCODE_SESSION',
    expiresAt: Date.parse('2026-07-10T00:00:00.000Z'),
    httpOnly: true,
    secure: true,
    sameSite: 'no_restriction',
    purpose: 'login',
  })

  assert.strictEqual(first.value_encrypted, null)
  assert.strictEqual(first.sync_excluded, 1)
  assert.strictEqual(first.http_only, 1)
  assert.strictEqual(first.secure, 1)

  const updated = upsertCookieMetadata({
    siteId: 'leetcode-cn',
    domain: 'leetcode.cn',
    name: 'LEETCODE_SESSION',
    expiresAt: Date.parse('2026-07-11T00:00:00.000Z'),
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    purpose: 'login',
  })

  assert.strictEqual(updated.id, first.id)
  assert.strictEqual(updated.expires_at, Date.parse('2026-07-11T00:00:00.000Z'))
  assert.strictEqual(updated.same_site, 'lax')

  replaceCookieMetadataForDomain('leetcode-cn', 'www.leetcode.cn', [
    {
      siteId: 'leetcode-cn',
      domain: 'www.leetcode.cn',
      name: 'csrftoken',
      httpOnly: false,
      secure: true,
      purpose: 'login',
    },
  ])

  const siteRecords = getCookieRecordsBySite('leetcode-cn')
  assert.strictEqual(siteRecords.length, 2)
  assert.ok(siteRecords.every((record) => record.value_encrypted === null))
  assert.ok(siteRecords.every((record) => record.sync_excluded === 1))

  const domainSummary = getCookieSummaryByDomain('leetcode-cn', 'leetcode.cn')
  assert.deepStrictEqual(domainSummary.cookie_names, ['LEETCODE_SESSION'])
  assert.strictEqual(domainSummary.cookie_count, 1)
  assert.strictEqual(domainSummary.http_only_count, 1)
  assert.strictEqual(domainSummary.secure_count, 1)
  assert.strictEqual(domainSummary.sync_excluded, true)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(domainSummary, 'value'), false)

  const siteSummary = getCookieSummaryBySite('leetcode-cn')
  assert.strictEqual(siteSummary.has_cookies, true)
  assert.deepStrictEqual(
    siteSummary.domains.map((domain) => domain.domain),
    ['leetcode.cn', 'www.leetcode.cn'],
  )

  const leakedValues = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM cookie_records
    WHERE value_encrypted IS NOT NULL OR sync_excluded != 1
  `,
    )
    .get() as { count: number }
  assert.strictEqual(leakedValues.count, 0)
})

test('upserts duplicate problems without creating extra rows', () => {
  const db = getDbForTest()
  seedCodeforcesProblem()

  upsertProblem({
    platform: 'codeforces',
    platformProblemId: '1000A',
    canonicalUrl: 'https://codeforces.com/problemset/problem/1000/A',
    title: '示例题',
    confidence: 'url',
  })

  const count = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM problems
    WHERE platform = 'codeforces' AND platform_problem_id = '1000A'
  `,
    )
    .get() as { count: number }
  assert.strictEqual(count.count, 1)

  const problem = getProblemByPlatformId(db, 'codeforces', '1000A')
  assert.strictEqual(problem.canonical_url, 'https://codeforces.com/problemset/problem/1000/A')
  assert.strictEqual(problem.title, '示例题')
  assert.strictEqual(problem.contest_id, '1000')
  assert.strictEqual(problem.problem_index, 'A')

  assert.throws(() => {
    db.prepare(
      `
      INSERT INTO problems
        (id, platform, platform_problem_id, canonical_url, status, first_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'duplicate-problem',
      'codeforces',
      '1000A',
      problem.canonical_url,
      'visited',
      now,
      now,
      now,
    )
  }, /UNIQUE constraint failed/)

  const recent = getRecentProblems(5)
  assert.strictEqual(recent.length, 1)
  assert.strictEqual(recent[0].platform_problem_id, '1000A')
})

test('deduplicates submissions and updates first AC metadata', () => {
  const db = getDbForTest()
  const problem = seedCodeforcesProblem()

  assert.strictEqual(
    upsertSubmission({
      platform: 'codeforces',
      platformSubmissionId: 'cf-1',
      problemId: problem.id,
      verdict: 'WA',
      rawVerdict: 'WRONG_ANSWER',
      language: 'GNU C++23',
      submittedAt: Date.parse(`${day}T10:00:00+08:00`),
      runtimeMs: 15,
      memoryKb: 800,
      sourceUrl: 'https://codeforces.com/contest/1000/submission/1',
    }),
    true,
  )

  assert.strictEqual(
    upsertSubmission({
      platform: 'codeforces',
      platformSubmissionId: 'cf-1',
      problemId: problem.id,
      verdict: 'AC',
      submittedAt: Date.parse(`${day}T10:01:00+08:00`),
    }),
    false,
  )

  assert.strictEqual(
    upsertSubmission({
      platform: 'codeforces',
      platformSubmissionId: 'cf-2',
      problemId: problem.id,
      verdict: 'AC',
      rawVerdict: 'OK',
      language: 'GNU C++23',
      submittedAt: Date.parse(`${day}T10:02:00+08:00`),
    }),
    true,
  )

  const submissions = getSubmissionsByProblem(problem.id)
  assert.strictEqual(submissions.length, 2)
  assert.strictEqual(submissions[0].platform_submission_id, 'cf-2')
  assert.strictEqual(submissions[1].platform_submission_id, 'cf-1')

  const platformSubmissions = getSubmissionsByPlatform('codeforces', 1)
  assert.strictEqual(platformSubmissions.length, 1)
  assert.strictEqual(platformSubmissions[0].platform_submission_id, 'cf-2')

  assert.throws(() => {
    db.prepare(
      `
      INSERT INTO submissions
        (id, problem_id, platform, platform_submission_id, verdict, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run('duplicate-submission', problem.id, 'codeforces', 'cf-1', 'AC', now, now, now)
  }, /UNIQUE constraint failed/)

  updateFirstAc(problem.id)
  const updatedProblem = getProblemByPlatformId(db, 'codeforces', '1000A')
  assert.strictEqual(updatedProblem.status, 'solved')
  assert.strictEqual(updatedProblem.first_solved_at, Date.parse(`${day}T10:02:00+08:00`))

  const detail = getProblemDetail(problem.id)
  assert.ok(detail)
  assert.strictEqual(detail.status, 'solved')
  assert.strictEqual(detail.submission_count, 2)
  assert.strictEqual(detail.ac_count, 1)
})

test('recomputes daily aggregate stats from visits and submissions', () => {
  const db = getDbForTest()
  const codeforcesProblem = seedCodeforcesProblem()
  seedCodeforcesSubmissions(codeforcesProblem)
  updateFirstAc(codeforcesProblem.id)

  upsertProblem({
    platform: 'acwing',
    platformProblemId: '123',
    canonicalUrl: 'https://www.acwing.com/problem/content/123/',
    title: 'AcWing Test',
    confidence: 'url',
  })
  const acwingProblem = getProblemByPlatformId(db, 'acwing', '123')

  insertVisit(db, 'visit-codeforces', codeforcesProblem, 120, 70)
  insertVisit(db, 'visit-acwing', acwingProblem, 30, 20)

  recomputeDailyStats(day)

  const stats = db.prepare('SELECT * FROM user_daily_stats WHERE local_day = ?').get(day) as
    DailyStatsRow | undefined
  assert.ok(stats)
  assert.strictEqual(stats.active_seconds, 90)
  assert.strictEqual(stats.duration_seconds, 150)
  assert.strictEqual(stats.visited_problem_count, 2)
  assert.strictEqual(stats.solved_problem_count, 1)
  assert.strictEqual(stats.submission_count, 2)
  assert.strictEqual(stats.ac_submission_count, 1)

  const platformDistribution = JSON.parse(stats.platform_distribution_json ?? '[]') as {
    platform: string
    count: number
  }[]
  assert.deepStrictEqual(
    platformDistribution.sort((a, b) => a.platform.localeCompare(b.platform)),
    [
      { platform: 'acwing', count: 1 },
      { platform: 'codeforces', count: 1 },
    ],
  )

  const trend = getVisitedTrend()
  assert.deepStrictEqual(trend, [{ local_day: day, count: 2 }])
})

test('manages accounts and rating history with stable deduplication', () => {
  const accountId = upsertAccount('codeforces', 'tourist', 'Tourist')
  assert.strictEqual(upsertAccount('codeforces', 'tourist', 'Tourist Updated'), accountId)

  updateCurrentRating(accountId, 3900)
  updatePeakRating(accountId, 4000)

  const account = getAccount('codeforces', 'tourist')
  assert.ok(account)
  assert.strictEqual(account.id, accountId)
  assert.strictEqual(account.display_name, 'Tourist Updated')
  assert.strictEqual(account.current_rating, 3900)
  assert.strictEqual(account.peak_rating, 4000)
  assert.ok(account.last_synced_at)

  assert.strictEqual(getAccountById(accountId)?.handle, 'tourist')
  assert.deepStrictEqual(
    getAccountsByPlatform('codeforces').map((row) => row.id),
    [accountId],
  )

  assert.strictEqual(
    upsertRatingHistory({
      accountId,
      platform: 'codeforces',
      contestId: '1',
      contestName: 'Codeforces Round 1',
      rank: 10,
      ratingBefore: 3800,
      ratingAfter: 3900,
      delta: 100,
      contestAt: Date.parse(`${day}T09:00:00+08:00`),
    }),
    true,
  )
  assert.strictEqual(
    upsertRatingHistory({
      accountId,
      platform: 'codeforces',
      contestId: '1',
      ratingAfter: 4100,
    }),
    false,
  )
  assert.strictEqual(
    upsertRatingHistory({
      accountId,
      platform: 'codeforces',
      contestId: '2',
      contestName: 'Codeforces Round 2',
      rank: 1,
      ratingBefore: 3900,
      ratingAfter: 4050,
      delta: 150,
      contestAt: Date.parse(`${day}T11:00:00+08:00`),
    }),
    true,
  )

  const history = getRatingHistory(accountId)
  assert.strictEqual(history.length, 2)
  assert.deepStrictEqual(
    history.map((row) => row.contest_id),
    ['1', '2'],
  )
  assert.strictEqual(history[0].rating_after, 3900)
  assert.strictEqual(computePeakRating(accountId), 4050)
})

test('manages user scripts and normalizes enabled state', () => {
  const scriptId = createScript({
    name: 'Example Helper',
    description: 'demo script',
    version: '1.0.0',
    match_urls_json: JSON.stringify(['https://example.test/*']),
    code: 'console.log("example")',
    file_path: null,
    site_ids_json: JSON.stringify(['codeforces']),
    enabled: true,
  })

  const created = getScriptById(scriptId)
  assert.ok(created)
  assert.strictEqual(created.enabled, true)
  assert.strictEqual(created.name, 'Example Helper')
  assert.strictEqual(created.site_ids_json, JSON.stringify(['codeforces']))
  assert.deepStrictEqual(
    getAllScripts().map((script) => script.id),
    [scriptId],
  )
  assert.deepStrictEqual(
    getEnabledScripts().map((script) => script.id),
    [scriptId],
  )

  assert.strictEqual(
    updateScript(scriptId, {
      description: null,
      file_path: 'example-helper.user.js',
      site_ids_json: '[]',
    }),
    true,
  )
  assert.strictEqual(toggleScript(scriptId, false), true)

  const disabled = getScriptById(scriptId)
  assert.ok(disabled)
  assert.strictEqual(disabled.enabled, false)
  assert.strictEqual(disabled.description, null)
  assert.strictEqual(disabled.file_path, 'example-helper.user.js')
  assert.deepStrictEqual(getEnabledScripts(), [])

  assert.strictEqual(updateScript('missing-script', { name: 'Missing' }), false)
  assert.strictEqual(deleteScript(scriptId), true)
  assert.strictEqual(getScriptById(scriptId), null)
  assert.strictEqual(deleteScript(scriptId), false)
})

test('saves and manages AI outputs without touching fact tables', () => {
  const periodSummary = saveAIOutput({
    output_type: 'period_summary',
    title: 'Weekly Summary',
    content: JSON.stringify({ solved: 3 }),
    content_markdown: '# Weekly Summary',
    input_summary: { range: ['2026-07-01', '2026-07-07'] },
    source_refs: { problemIds: ['p1', 'p2'] },
    model_info: { engine: 'local-rules', version: 1 },
  })
  const reviewPlan = saveAIOutput({
    output_type: 'review_plan',
    title: 'Review Plan',
    content: JSON.stringify({ days: 7 }),
  })

  const saved = getAIOutput(periodSummary.id)
  assert.ok(saved)
  assert.strictEqual(saved.title, 'Weekly Summary')
  assert.strictEqual(saved.content_markdown, '# Weekly Summary')
  assert.deepStrictEqual(JSON.parse(saved.input_summary_json ?? '{}'), {
    range: ['2026-07-01', '2026-07-07'],
  })
  assert.deepStrictEqual(JSON.parse(saved.source_refs_json ?? '{}'), { problemIds: ['p1', 'p2'] })
  assert.deepStrictEqual(JSON.parse(saved.model_info_json ?? '{}'), {
    engine: 'local-rules',
    version: 1,
  })

  assert.deepStrictEqual(
    listAIOutputs('review_plan').map((output) => output.id),
    [reviewPlan.id],
  )
  assert.deepStrictEqual(
    new Set(listAIOutputs(undefined, 10).map((output) => output.id)),
    new Set([periodSummary.id, reviewPlan.id]),
  )

  const updated = updateAIOutput(reviewPlan.id, {
    title: 'Updated Plan',
    content_markdown: '# Updated Plan',
  })
  assert.ok(updated)
  assert.strictEqual(updated.title, 'Updated Plan')
  assert.strictEqual(updated.content_markdown, '# Updated Plan')
  assert.strictEqual(updateAIOutput('missing-ai-output', { title: 'Missing' }), null)

  assert.strictEqual(deleteAIOutput(periodSummary.id), true)
  assert.strictEqual(getAIOutput(periodSummary.id), null)
  assert.strictEqual(deleteAIOutput(periodSummary.id), false)
})

test('creates AI context snapshots idempotently and parses stored context', () => {
  const first = ensureTodaySnapshot()
  const second = ensureTodaySnapshot()

  assert.strictEqual(second.id, first.id)
  assert.strictEqual(second.snapshot_date, first.snapshot_date)
  assert.strictEqual(first.schema_version, 2)

  const snapshot = getSnapshotByDate(first.snapshot_date)
  assert.ok(snapshot)
  assert.strictEqual(snapshot.id, first.id)
  assert.strictEqual(snapshot.context.schema_version, 2)
  assert.strictEqual(snapshot.context.overview.total_problems, 0)
  assert.strictEqual(snapshot.context.overview.total_submissions, 0)

  const snapshots = listSnapshots(5)
  assert.strictEqual(snapshots.length, 1)
  assert.strictEqual(snapshots[0].id, first.id)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(snapshots[0], 'context_json'), false)
})

test('manages built-in and imported site configs without overwriting protected rows', () => {
  seedBuiltinSites()

  const builtins = getAllSites()
  assert.strictEqual(builtins.length, 7)
  const codeforces = getSiteById('codeforces')
  assert.ok(codeforces)
  assert.strictEqual(codeforces.isBuiltin, true)
  assert.strictEqual(deleteSite('codeforces'), false)

  assert.strictEqual(toggleSite('codeforces', false), true)
  assert.strictEqual(getSiteById('codeforces')?.enabled, false)
  seedBuiltinSites()
  assert.strictEqual(
    getSiteById('codeforces')?.enabled,
    false,
    'seed should not overwrite user enable state',
  )

  createSite({
    id: 'custom-oj',
    name: 'Custom OJ',
    domains: ['example.test'],
    homeUrl: 'https://example.test',
    enabled: true,
    problemUrlPatterns: ['/problem/{id}'],
  })

  const previewResult = previewImportSites({
    version: 1,
    sites: [
      {
        id: 'codeforces',
        name: 'Codeforces Import',
        domains: ['codeforces.com'],
        homeUrl: 'https://codeforces.com',
      },
      {
        id: 'custom-oj',
        name: 'Custom OJ Updated',
        domains: ['example.test'],
        homeUrl: 'https://example.test/new',
        enabled: false,
      },
      {
        id: 'new-oj',
        name: 'New OJ',
        domains: ['new.example.test'],
        homeUrl: 'https://new.example.test',
      },
      { id: '', name: 'Invalid', domains: [], homeUrl: '' },
    ],
  })

  assert.strictEqual(previewResult.valid, true)
  assert.ok(previewResult.preview)
  assert.strictEqual(previewResult.preview.builtinSkipped.length, 1)
  assert.strictEqual(previewResult.preview.conflicts.length, 1)
  assert.strictEqual(previewResult.preview.newSites.length, 1)

  const sitesToImport = [
    ...previewResult.preview.newSites,
    previewResult.preview.conflicts[0].incoming,
  ]
  const importResult = confirmImportSites(sitesToImport, ['custom-oj'])
  assert.deepStrictEqual(importResult, { imported: 1, overwritten: 1 })

  assert.strictEqual(getSiteById('custom-oj')?.name, 'Custom OJ Updated')
  assert.strictEqual(getSiteById('custom-oj')?.enabled, false)
  assert.strictEqual(getSiteById('new-oj')?.homeUrl, 'https://new.example.test')

  /*
   * 直接调 confirmImportSites 覆盖内置站点：预览拦得住，提交这一步以前拦不住。
   *
   * 上面那段走的是"预览产出什么就提交什么"的正常路径，`codeforces` 早在预览阶段就被
   * 分到了 `builtinSkipped`，所以它验不到这个缺口。但预览与提交之间没有任何一环强制
   * 两者一致——提交收的是渲染进程回传的数组。这里模拟的就是绕过预览结论的那份载荷：
   * 把内置站点 id 同时放进 sites 与 overwriteIds。
   */
  const builtinName = getSiteById('codeforces')?.name
  assert.ok(builtinName)
  const smuggled = confirmImportSites(
    [
      {
        id: 'codeforces',
        name: 'Hijacked',
        domains: ['evil.test'],
        homeUrl: 'https://evil.test',
        enabled: true,
        isBuiltin: false,
      },
    ],
    ['codeforces'],
  )
  assert.deepStrictEqual(smuggled, { imported: 0, overwritten: 0 }, '内置站点不应被覆盖')
  assert.strictEqual(getSiteById('codeforces')?.name, builtinName, '内置站点名不应被改写')
  assert.strictEqual(getSiteById('codeforces')?.homeUrl, 'https://codeforces.com')
  assert.strictEqual(getSiteById('codeforces')?.isBuiltin, true)
})

test('Problem detail and visits preserve native binding, nullable IDs, raw times and full rows', () => {
  const sqlite = getDbForTest()
  const insertParent = sqlite.prepare(`INSERT INTO problems
    (id, platform, platform_problem_id, canonical_url, title, difficulty, tags_json, extra_json,
     first_seen_at, last_visited_at, created_at, updated_at)
    VALUES (?, 'codeforces', ?, 'https://example.test/detail', NULL, 'hard', '["dp"]', '{}', -0.5, 0, 0, 0)`)
  const insertSubmission = sqlite.prepare(`INSERT INTO submissions
    (id, problem_id, platform, platform_submission_id, verdict, submitted_at, is_first_ac,
     created_at, updated_at, deleted_at)
    VALUES (NULL, ?, 'codeforces', ?, 'AC', 8640000000000001, 1, 0, 0, 0)`)
  const insertVisit = sqlite.prepare(`INSERT INTO problem_visits
    (id, problem_id, platform, url, entered_at, left_at, created_at, updated_at, deleted_at)
    VALUES (NULL, ?, 'codeforces', 'https://example.test/visit', -0.5, 0, 0, 0, 0)`)

  for (const [index, id] of [
    '',
    "O'Reilly",
    "' OR 1=1 --",
    '中文',
    'emoji-😀',
    'with\0nul',
    '\ud800',
  ].entries()) {
    insertParent.run(id, `native-key-${index}`)
    insertSubmission.run(id, `native-submission-${index}`)
    insertVisit.run(id)
    const detail = getProblemDetail(id)
    assert.deepStrictEqual(detail, getOriginalProblemDetail(sqlite, id))
    assert.ok(detail)
    assert.strictEqual(detail.first_seen_at, -0.5)
    assert.strictEqual(detail.status, 'solved')
    assert.strictEqual(detail.submission_count, 1)
    assert.strictEqual(detail.submissions[0]?.id, null)
    assert.strictEqual(detail.submissions[0]?.submitted_at, 8640000000000001)
    assert.strictEqual(detail.submissions[0]?.deleted_at, 0)
    assert.strictEqual(detail.difficulty, 'hard')
    assert.deepStrictEqual(listProblemVisitsByProblem(id), getOriginalProblemVisits(sqlite, id))
    assert.strictEqual(listProblemVisitsByProblem(id)[0]?.id, null)
  }
  const before = sqlite.prepare('SELECT total_changes() AS count').get()
  const observed: DataChangedPayload[] = []
  const unsubscribe = subscribeDataChanges((event) => observed.push(event))
  try {
    sqlite.pragma('query_only = ON')
    assert.deepStrictEqual(getProblemDetail(''), getOriginalProblemDetail(sqlite, ''))
    assert.deepStrictEqual(listProblemVisitsByProblem(''), getOriginalProblemVisits(sqlite, ''))
    assert.deepStrictEqual(sqlite.prepare('SELECT total_changes() AS count').get(), before)
    assert.deepStrictEqual(observed, [])
  } finally {
    sqlite.pragma('query_only = OFF')
    unsubscribe()
  }
})

test('Problem detail and visit native errors preserve the missing-parent short circuit', () => {
  const sqlite = getDbForTest()
  sqlite
    .prepare(
      `INSERT INTO problems
    (id, platform, platform_problem_id, canonical_url, first_seen_at, created_at, updated_at)
    VALUES ('parent', 'codeforces', 'parent', 'https://example.test/parent', 0, 0, 0)`,
    )
    .run()
  sqlite
    .prepare(
      `INSERT INTO submissions
    (id, problem_id, platform, platform_submission_id, verdict, submitted_at, created_at, updated_at)
    VALUES (NULL, 'parent', 'codeforces', 'first', 'WA', 0, 0, 0)`,
    )
    .run()
  sqlite.exec(`ALTER TABLE submissions RENAME TO fixture_submissions;
    CREATE VIEW submissions AS SELECT id, problem_id, platform, platform_submission_id, verdict,
    raw_verdict, json_extract('invalid JSON', '$') AS language, submitted_at, is_first_ac,
    runtime_ms, memory_kb, source_url, raw_json, created_at, updated_at, deleted_at
    FROM fixture_submissions`)
  assert.strictEqual(getOriginalProblemDetail(sqlite, 'missing'), null)
  assert.strictEqual(getProblemDetail('missing'), null)
  assert.throws(() => getOriginalProblemDetail(sqlite, 'parent'), /malformed JSON/)
  assert.throws(() => getProblemDetail('parent'), /malformed JSON/)
})

test('Omnibox first pipeline preserves native null parent and latest-visit fallback', () => {
  const sqlite = getDbForTest()
  sqlite
    .prepare(
      `INSERT INTO problems
    (id, platform, platform_problem_id, canonical_url, title, first_seen_at, last_visited_at, created_at, updated_at)
    VALUES (?, 'codeforces', ?, ?, 'match', 0, 0, 0, 0)`,
    )
    .run(null, 'null-parent', 'https://example.test/null-parent')
  sqlite
    .prepare(
      `INSERT INTO problems
    (id, platform, platform_problem_id, canonical_url, title, first_seen_at, last_visited_at, created_at, updated_at)
    VALUES ('parent', 'codeforces', 'parent', 'https://example.test/canonical', 'match', 0, 0, 0, 0)`,
    )
    .run()
  sqlite
    .prepare(
      `INSERT INTO problem_visits
    (id, problem_id, platform, url, entered_at, created_at, updated_at)
    VALUES (NULL, 'parent', 'codeforces', 'https://example.test/history', 0, 0, 0)`,
    )
    .run()
  for (const query of ['', 'match', 'null-parent', 'canonical']) {
    assert.deepStrictEqual(
      getOmniboxSuggestions(query),
      getOriginalOmniboxSuggestions(sqlite, query),
    )
  }
  assert.ok(getOmniboxSuggestions('match').some((row) => row.problemId === null))
  sqlite
    .prepare(
      `INSERT INTO problems
    (id, platform, platform_problem_id, canonical_url, first_seen_at, created_at, updated_at, deleted_at)
    VALUES ('horizon-blocker', 'codeforces', 'blocker', 'https://example.test/blocker', 0, 0, 0, 0)`,
    )
    .run()
  const blockerVisit = sqlite.prepare(`INSERT INTO problem_visits
    (id, problem_id, platform, url, entered_at, created_at, updated_at)
    VALUES (?, 'horizon-blocker', 'codeforces', 'https://example.test/blocker-visit', ?, 0, 0)`)
  for (let index = 0; index < 64; index++) blockerVisit.run(`blocker-${index}`, index + 1)
  assert.deepStrictEqual(
    getOmniboxSuggestions('canonical'),
    getOriginalOmniboxSuggestions(sqlite, 'canonical'),
  )
  assert.deepStrictEqual(getOmniboxSuggestions('canonical'), [
    {
      problemId: 'parent',
      title: 'match',
      platform: 'codeforces',
      platformProblemId: 'parent',
      url: 'https://example.test/canonical',
      lastVisitedAt: 0,
      source: 'problem',
    },
  ])
})

test('Recent problems preserve native LIMIT bindings, nullable rows and status horizon', () => {
  const sqlite = getDbForTest()
  const insertParent = sqlite.prepare(`INSERT INTO problems
    (id, platform, platform_problem_id, canonical_url, title, status,
     first_seen_at, last_visited_at, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, 'https://example.test/recent', NULL, ?, 0, ?, 0, 0, ?)`)
  insertParent.run('new', 'codeforces', 'new', 'visited', 3, null)
  insertParent.run('old', 'codeforces', 'old', 'visited', 2, null)
  insertParent.run('', "O'Reilly%_", 'empty', 'custom', -0.5, null)
  insertParent.run(null, 'codeforces', 'null-zero', 'legacy', 0, null)
  insertParent.run(null, 'codeforces', 'null-time', 'legacy', null, null)
  insertParent.run('deleted', 'codeforces', 'deleted', 'visited', 10, 0)
  const insertChild = sqlite.prepare(`INSERT INTO submissions
    (id, problem_id, platform, platform_submission_id, verdict, submitted_at,
     created_at, updated_at, deleted_at)
    VALUES (?, ?, 'codeforces', ?, ?, 0, 0, 0, ?)`)
  insertChild.run('wa', 'new', 'wa', 'WA', null)
  insertChild.run(null, 'old', 'ac', 'AC', 0)

  const outcome = (run: () => unknown) => {
    try {
      return { rows: run() }
    } catch (error) {
      assert.ok(error instanceof Error)
      return {
        error: {
          name: error.name,
          message: error.message,
          ...('code' in error ? { code: error.code } : {}),
        },
      }
    }
  }
  for (const limit of [
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
  ]) {
    assert.deepStrictEqual(
      outcome(() => getRecentProblems(limit)),
      outcome(() => getOriginalRecentProblems(sqlite, limit)),
      `native LIMIT ${limit}`,
    )
  }
  assert.deepStrictEqual(getRecentProblems(), getOriginalRecentProblems(sqlite))
  assert.deepStrictEqual(
    getRecentProblems().map((row) => row.id),
    ['new', 'old', null, '', null],
  )
  assert.strictEqual(getRecentProblems()[1]?.submission_count, 1)
  assert.strictEqual(getRecentProblems()[1]?.status, 'solved')
  assert.strictEqual(getRecentProblems()[3]?.last_visited_at, -0.5)
  assert.strictEqual(getRecentProblems()[4]?.last_visited_at, null)
  for (const platform of [undefined, '', 'codeforces', 'Codeforces', "O'Reilly%_", "' OR 1=1 --"]) {
    for (const status of [undefined, '', 'solved', 'attempted', 'unknown']) {
      assert.deepStrictEqual(
        getRecentProblems(2, platform, status),
        getOriginalRecentProblems(sqlite, 2, platform, status),
      )
    }
  }
  assert.deepStrictEqual(getRecentProblems(1, 'codeforces', 'solved'), [])
  assert.deepStrictEqual(
    getRecentProblems(2, 'codeforces', 'solved').map((row) => row.id),
    ['old'],
  )

  const observed: DataChangedPayload[] = []
  const unsubscribe = subscribeDataChanges((event) => observed.push(event))
  const before = sqlite.prepare('SELECT total_changes() AS count').get()
  try {
    sqlite.pragma('query_only = ON')
    assert.deepStrictEqual(getRecentProblems(-1), getOriginalRecentProblems(sqlite, -1))
    assert.deepStrictEqual(sqlite.prepare('SELECT total_changes() AS count').get(), before)
    assert.strictEqual(sqlite.inTransaction, false)
    sqlite.pragma('query_only = OFF')
    assert.throws(
      () =>
        sqlite.transaction(() => {
          insertParent.run('uncommitted', 'codeforces', 'uncommitted', 'visited', 100, null)
          assert.deepStrictEqual(getRecentProblems(), getOriginalRecentProblems(sqlite))
          assert.strictEqual(getRecentProblems()[0]?.id, 'uncommitted')
          assert.strictEqual(sqlite.inTransaction, true)
          throw new Error('rollback recent fixture')
        })(),
      /rollback recent fixture/,
    )
    assert.strictEqual(
      getRecentProblems().some((row) => row.id === 'uncommitted'),
      false,
    )
    assert.deepStrictEqual(observed, [])
  } finally {
    sqlite.pragma('query_only = OFF')
    unsubscribe()
  }
})

function submissionReadOutcome(run: () => unknown) {
  try {
    return { rows: run() }
  } catch (error) {
    assert.ok(error instanceof Error)
    return {
      error: {
        name: error.name,
        message: error.message,
        ...('code' in error ? { code: error.code } : {}),
      },
    }
  }
}

test('Submission reads preserve native full rows, text binding, raw minima and LIMIT values', () => {
  const sqlite = getDbForTest()
  const insertParent = sqlite.prepare(`INSERT INTO problems
    (id, platform, platform_problem_id, canonical_url, first_seen_at, created_at, updated_at, deleted_at)
    VALUES (?, 'codeforces', ?, 'https://example.test/submission', 0, 0, 0, 0)`)
  const insertSubmission = sqlite.prepare(`INSERT INTO submissions
    (id, problem_id, platform, platform_submission_id, verdict, raw_verdict, language,
     submitted_at, is_first_ac, runtime_ms, memory_kb, source_url, raw_json, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, 'Accepted', '', ?, 7, 0, 0, '', '{"fixture":true}', 0.25, 8640000000000001, 0)`)
  const keys = [
    '',
    "O'Reilly",
    "' OR 1=1 --",
    '%_\\',
    ' spaced ',
    '中文',
    'emoji-😀',
    'with\0nul',
    '\ud800',
  ]
  for (const [index, key] of keys.entries()) {
    insertParent.run(key, `parent-${index}`)
    insertSubmission.run(null, key, key, `remote-${index}`, 'AC', -0.5)
    insertSubmission.run(`later-${index}`, key, key, `later-${index}`, 'AC', 0)
    assert.deepStrictEqual(
      getSubmissionsByProblem(key),
      getOriginalSubmissionsByProblem(sqlite, key),
    )
    assert.deepStrictEqual(
      getSubmissionsByProblemAsc(key),
      getOriginalSubmissionsByProblemAsc(sqlite, key),
    )
    assert.deepStrictEqual(
      getSubmissionsByPlatform(key),
      getOriginalSubmissionsByPlatform(sqlite, key),
    )
    assert.deepStrictEqual(
      getFirstAcByProblemIds([key, key]),
      getOriginalFirstAcByProblemIds(sqlite, [key, key]),
    )
    const earliest = getSubmissionsByProblemAsc(key)[0]
    assert.strictEqual(Object.keys(earliest).length, 16)
    assert.strictEqual(earliest.id, null)
    assert.strictEqual(earliest.submitted_at, -0.5)
    assert.strictEqual(earliest.is_first_ac, 7)
    assert.strictEqual(earliest.created_at, 0.25)
    assert.strictEqual(earliest.updated_at, 8_640_000_000_000_001)
    assert.strictEqual(earliest.deleted_at, 0)
    assert.strictEqual(getFirstAcByProblemIds([key])[0]?.first_ac_at, -0.5)
  }
  insertSubmission.run('', null, 'limits', 'empty-id', 'AC', 0)
  insertSubmission.run(null, null, 'limits', 'null-id', 'ac', 1)
  for (const limit of [
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
  ]) {
    assert.deepStrictEqual(
      submissionReadOutcome(() => getSubmissionsByPlatform('limits', limit)),
      submissionReadOutcome(() => getOriginalSubmissionsByPlatform(sqlite, 'limits', limit)),
      `native submission LIMIT ${limit}`,
    )
  }
  assert.deepStrictEqual(
    getSubmissionsByPlatform('limits').map((row) => row.problem_id),
    [null, null],
  )
  insertParent.run('zero', 'zero')
  insertSubmission.run('zero', 'zero', 'limits', 'zero', 'AC', 0)
  insertParent.run('wrong-case', 'wrong-case')
  insertSubmission.run('wrong-case', 'wrong-case', 'limits', 'wrong-case', 'ac', -9)
  assert.deepStrictEqual(getFirstAcByProblemIds(['zero', 'wrong-case', 'zero', 'missing']), [
    { problem_id: 'zero', first_ac_at: 0 },
  ])
  sqlite.pragma('foreign_keys = OFF')
  insertSubmission.run('orphan', 'orphan', 'limits', 'orphan', 'AC', -1)
  sqlite.pragma('foreign_keys = ON')
  assert.deepStrictEqual(
    getSubmissionsByProblem('orphan'),
    getOriginalSubmissionsByProblem(sqlite, 'orphan'),
  )
  assert.deepStrictEqual(getFirstAcByProblemIds(['orphan']), [
    { problem_id: 'orphan', first_ac_at: -1 },
  ])
})

test('First-AC aggregate preserves native maximum bind count and duplicate overflow', () => {
  const sqlite = getDbForTest()
  const option = sqlite
    .prepare<[], { compile_options: string }>('PRAGMA compile_options')
    .all()
    .find((row) => row.compile_options.startsWith('MAX_VARIABLE_NUMBER='))
  assert.ok(option, 'Native SQLite must report its compiled variable maximum')
  const maximum = Number(option.compile_options.split('=')[1])
  assert.ok(Number.isInteger(maximum) && maximum > 0)
  sqlite.exec(`INSERT INTO problems
    (id, platform, platform_problem_id, canonical_url, first_seen_at, created_at, updated_at)
    VALUES ('boundary', 'codeforces', 'boundary', 'https://example.test/boundary', 0, 0, 0);
    INSERT INTO submissions (id, problem_id, platform, platform_submission_id, verdict, submitted_at, created_at, updated_at)
    VALUES (NULL, 'boundary', 'codeforces', 'boundary', 'AC', 0, 0, 0)`)
  const ids = Array<string>(maximum).fill('boundary')
  const expected = getOriginalFirstAcByProblemIds(sqlite, ids)
  assert.deepStrictEqual(expected, [{ problem_id: 'boundary', first_ac_at: 0 }])
  assert.deepStrictEqual(getFirstAcByProblemIds(ids), expected)
  ids.push('boundary')
  const error = submissionReadOutcome(() => getOriginalFirstAcByProblemIds(sqlite, ids))
  assert.deepStrictEqual(error, {
    error: { name: 'SqliteError', message: 'too many SQL variables', code: 'SQLITE_ERROR' },
  })
  assert.deepStrictEqual(
    submissionReadOutcome(() => getFirstAcByProblemIds(ids)),
    error,
  )
})

test('Submission reads retain native read-only, transaction, empty batch and connection lifecycle', () => {
  const sqlite = getDbForTest()
  sqlite.exec(`INSERT INTO problems
    (id, platform, platform_problem_id, canonical_url, first_seen_at, created_at, updated_at)
    VALUES ('parent', 'codeforces', 'parent', 'https://example.test/parent', 0, 0, 0)`)
  const insert = sqlite.prepare(`INSERT INTO submissions
    (id, problem_id, platform, platform_submission_id, verdict, submitted_at, created_at, updated_at)
    VALUES (?, 'parent', 'codeforces', ?, 'AC', ?, 0, 0)`)
  insert.run(null, 'initial', 0)
  const observed: DataChangedPayload[] = []
  const unsubscribe = subscribeDataChanges((event) => observed.push(event))
  const before = sqlite.prepare('SELECT total_changes() AS count').get()
  try {
    sqlite.pragma('query_only = ON')
    assert.deepStrictEqual(
      getSubmissionsByProblem('parent'),
      getOriginalSubmissionsByProblem(sqlite, 'parent'),
    )
    assert.deepStrictEqual(
      getSubmissionsByProblemAsc('parent'),
      getOriginalSubmissionsByProblemAsc(sqlite, 'parent'),
    )
    assert.deepStrictEqual(
      getSubmissionsByPlatform('codeforces'),
      getOriginalSubmissionsByPlatform(sqlite, 'codeforces'),
    )
    assert.deepStrictEqual(
      getFirstAcByProblemIds(['parent']),
      getOriginalFirstAcByProblemIds(sqlite, ['parent']),
    )
    assert.strictEqual(sqlite.inTransaction, false)
    assert.deepStrictEqual(sqlite.prepare('SELECT total_changes() AS count').get(), before)
    sqlite.pragma('query_only = OFF')
    assert.throws(
      () =>
        sqlite.transaction(() => {
          insert.run('pending', 'pending', -1)
          assert.deepStrictEqual(
            getSubmissionsByProblem('parent'),
            getOriginalSubmissionsByProblem(sqlite, 'parent'),
          )
          assert.deepStrictEqual(
            getSubmissionsByProblemAsc('parent'),
            getOriginalSubmissionsByProblemAsc(sqlite, 'parent'),
          )
          assert.deepStrictEqual(
            getSubmissionsByPlatform('codeforces'),
            getOriginalSubmissionsByPlatform(sqlite, 'codeforces'),
          )
          assert.deepStrictEqual(getFirstAcByProblemIds(['parent']), [
            { problem_id: 'parent', first_ac_at: -1 },
          ])
          assert.strictEqual(sqlite.inTransaction, true)
          throw new Error('rollback submission fixture')
        })(),
      /rollback submission fixture/,
    )
    assert.deepStrictEqual(getFirstAcByProblemIds(['parent']), [
      { problem_id: 'parent', first_ac_at: 0 },
    ])
    assert.deepStrictEqual(observed, [])
  } finally {
    sqlite.pragma('query_only = OFF')
    unsubscribe()
  }
  closeDb()
  assert.deepStrictEqual(getFirstAcByProblemIds([]), [])
  assert.deepStrictEqual(getOriginalFirstAcByProblemIds(sqlite, []), [])
  assert.throws(() => getSubmissionsByProblem('parent'), /Database not initialized/)
  const reopened = initDbAtPath(':memory:')
  assert.deepStrictEqual(getSubmissionsByProblem('parent'), [])
  assert.deepStrictEqual(getSubmissionsByProblemAsc('parent'), [])
  assert.deepStrictEqual(getSubmissionsByPlatform('codeforces'), [])
  assert.deepStrictEqual(getFirstAcByProblemIds(['parent']), [])
  reopened.exec('DROP TABLE submissions')
  assert.deepStrictEqual(getFirstAcByProblemIds([]), [])
  for (const [original, current] of [
    [
      () => getOriginalSubmissionsByProblem(reopened, 'parent'),
      () => getSubmissionsByProblem('parent'),
    ],
    [
      () => getOriginalSubmissionsByProblemAsc(reopened, 'parent'),
      () => getSubmissionsByProblemAsc('parent'),
    ],
    [
      () => getOriginalSubmissionsByPlatform(reopened, 'codeforces'),
      () => getSubmissionsByPlatform('codeforces'),
    ],
    [
      () => getOriginalFirstAcByProblemIds(reopened, ['parent']),
      () => getFirstAcByProblemIds(['parent']),
    ],
  ]) {
    const expected = submissionReadOutcome(original)
    assert.ok('error' in expected)
    assert.deepStrictEqual(submissionReadOutcome(current), expected)
  }
})

function compareNativeSubmissionUpsert(
  run: (
    db: Database.Database,
    upsert: (data: SubmissionData) => boolean,
    events: DataChangedPayload[],
    trace: string[],
  ) => unknown,
): void {
  const results = []
  const originalUuid = crypto.randomUUID
  const originalNow = Date.now
  try {
    for (const original of [true, false]) {
      closeDb()
      const db = initDbAtPath(':memory:')
      const trace: string[] = []
      let sequence = 0
      crypto.randomUUID = () => {
        trace.push('uuid')
        return `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`
      }
      Date.now = () => 1.75
      const events: DataChangedPayload[] = []
      const transactionStates: boolean[] = []
      const unsubscribe = subscribeDataChanges((event) => {
        events.push(event)
        transactionStates.push(db.inTransaction)
      })
      try {
        const value = run(
          db,
          original ? (data) => runOriginalSubmissionUpsert(db, data) : upsertSubmission,
          events,
          trace,
        )
        results.push({
          value,
          rows: db.prepare('SELECT * FROM submissions ORDER BY rowid').all(),
          events,
          transactionStates,
          trace,
          sequence,
        })
      } finally {
        unsubscribe()
        closeDb()
      }
    }
  } finally {
    crypto.randomUUID = originalUuid
    Date.now = originalNow
  }
  assert.deepStrictEqual(results[1], results[0])
}

function nativeSubmissionInput(overrides: Partial<SubmissionData> = {}): SubmissionData {
  return {
    platform: 'codeforces',
    platformSubmissionId: 'native-upsert',
    verdict: 'AC',
    submittedAt: 1.75,
    ...overrides,
  }
}

test('Submission upsert preserves native raw defaults, literal bindings and null-ID duplicate short circuit', () => {
  compareNativeSubmissionUpsert((db, upsert, events, trace) => {
    for (const [index, value] of [
      '',
      "quoted'%_\\",
      '\u4e2d\u6587',
      '\0tail',
      '\ud800',
    ].entries()) {
      assert.strictEqual(
        upsert(
          nativeSubmissionInput({
            platform: value,
            platformSubmissionId: String(index),
            rawVerdict: '',
            language: '',
            runtimeMs: 0,
            memoryKb: 0,
            sourceUrl: '',
            rawJson: '',
          }),
        ),
        true,
      )
    }
    const stored = db.prepare('SELECT * FROM submissions ORDER BY rowid').all()
    assert.strictEqual(stored.length, 5)
    const raw = db
      .prepare<
        [],
        {
          submitted_at: number
          created_at: number
          updated_at: number
          is_first_ac: number
          deleted_at: number | null
        }
      >('SELECT submitted_at,created_at,updated_at,is_first_ac,deleted_at FROM submissions LIMIT 1')
      .get()
    assert.deepStrictEqual(raw, {
      submitted_at: 1.75,
      created_at: 1.75,
      updated_at: 1.75,
      is_first_ac: 0,
      deleted_at: null,
    })
    db.exec(`INSERT INTO submissions (id,platform,platform_submission_id,verdict,submitted_at,created_at,updated_at,deleted_at)
      VALUES (NULL,'codeforces','native-upsert','WA',0,0,0,0);
      ALTER TABLE submissions RENAME COLUMN source_url TO unused_source_url`)
    events.length = 0
    trace.length = 0
    db.pragma('query_only = ON')
    assert.strictEqual(upsert(nativeSubmissionInput()), false)
    assert.deepStrictEqual(trace, [])
    assert.deepStrictEqual(events, [])
    return stored
  })
})

test('Submission upsert prepares natively before getters and UUID, preserving failure stage', () => {
  compareNativeSubmissionUpsert((db, upsert, events, trace) => {
    db.exec('ALTER TABLE submissions RENAME COLUMN source_url TO absent_source_url')
    const data: SubmissionData = {
      get platform() {
        trace.push('platform')
        return 'codeforces'
      },
      get platformSubmissionId() {
        trace.push('key')
        return 'native-upsert'
      },
      get verdict() {
        trace.push('verdict')
        return 'AC' as const
      },
      get submittedAt() {
        trace.push('time')
        return 0
      },
    }
    const result = submissionReadOutcome(() => upsert(data))
    assert.deepStrictEqual(result, {
      error: {
        name: 'SqliteError',
        message: 'table submissions has no column named source_url',
        code: 'SQLITE_ERROR',
      },
    })
    assert.deepStrictEqual(trace, ['platform', 'key'])
    assert.deepStrictEqual(events, [])
    return result
  })
})

test('Submission upsert retains native IGNORE, FAIL and ABORT side effects and exact notification outcomes', () => {
  for (const mode of ['IGNORE', 'FAIL', 'ABORT', 'audit']) {
    compareNativeSubmissionUpsert((db, upsert, events) => {
      db.exec(`CREATE TABLE insert_audit (first_ac INTEGER, deleted_at INTEGER, instant INTEGER);
        CREATE TRIGGER observe_insert BEFORE INSERT ON submissions BEGIN
        INSERT INTO insert_audit VALUES (NEW.is_first_ac, NEW.deleted_at, NEW.submitted_at);
        ${mode === 'audit' ? '' : mode === 'IGNORE' ? 'SELECT RAISE(IGNORE);' : `SELECT RAISE(${mode}, 'native rejected');`} END`)
      const result = submissionReadOutcome(() => upsert(nativeSubmissionInput()))
      const audit = db.prepare('SELECT * FROM insert_audit').all()
      assert.deepStrictEqual(
        audit,
        mode === 'ABORT' ? [] : [{ first_ac: 0, deleted_at: null, instant: 1.75 }],
      )
      assert.deepStrictEqual(
        events,
        mode === 'audit' || mode === 'IGNORE'
          ? [{ tables: ['submissions', 'problems', 'stats'] }]
          : [],
      )
      if (mode === 'audit' || mode === 'IGNORE') assert.deepStrictEqual(result, { rows: true })
      else
        assert.deepStrictEqual(result, {
          error: {
            name: 'SqliteError',
            message: 'native rejected',
            code: `SQLITE_CONSTRAINT_TRIGGER`,
          },
        })
      return { result, audit }
    })
  }
})

test('Submission upsert native constraints/read-only and caller COMMIT failures preserve data/events', () => {
  for (const mode of [
    'readonly',
    'foreign-key',
    'unique',
    'commit',
    'rollback',
    'commit-failure',
  ]) {
    compareNativeSubmissionUpsert((db, upsert, events) => {
      if (mode === 'readonly') db.pragma('query_only = ON')
      if (mode === 'unique')
        db.exec(`INSERT INTO submissions (id,platform,platform_submission_id,verdict,submitted_at,created_at,updated_at)
        VALUES ('00000000-0000-4000-8000-000000000001','other','other','WA',0,0,0)`)
      let result
      if (['commit', 'rollback', 'commit-failure'].includes(mode)) {
        result = submissionReadOutcome(() =>
          withDataChangeTransaction(() =>
            db.transaction(() => {
              assert.strictEqual(upsert(nativeSubmissionInput()), true)
              assert.deepStrictEqual(events, [])
              withDataChangeTransaction(() =>
                db.transaction(() => {
                  upsert(nativeSubmissionInput({ platformSubmissionId: 'nested' }))
                })(),
              )
              assert.deepStrictEqual(events, [])
              if (mode === 'rollback') throw new Error('callback rollback')
              if (mode === 'commit-failure') {
                db.pragma('defer_foreign_keys = ON')
                upsert(
                  nativeSubmissionInput({ platformSubmissionId: 'deferred', problemId: 'missing' }),
                )
              }
            })(),
          ),
        )
      } else
        result = submissionReadOutcome(() =>
          upsert(nativeSubmissionInput(mode === 'foreign-key' ? { problemId: 'missing' } : {})),
        )
      if (mode !== 'commit') assert.ok('error' in result)
      assert.deepStrictEqual(
        events,
        mode === 'commit' ? [{ tables: ['submissions', 'problems', 'stats'] }] : [],
      )
      assert.strictEqual(db.inTransaction, false)
      return result
    })
  }
})

type NativeFirstAcScenario = {
  db: Database.Database
  update: typeof updateFirstAc
  recompute: typeof recomputeProblemSubmissionState
  events: DataChangedPayload[]
  trace: string[]
}

function compareNativeFirstAc(run: (scenario: NativeFirstAcScenario) => unknown): void {
  const results = []
  const originalNow = Date.now
  try {
    for (const original of [true, false]) {
      closeDb()
      const db = initDbAtPath(':memory:')
      const trace: string[] = []
      let clockCalls = 0
      Date.now = () => {
        clockCalls++
        return 1.75
      }
      const events: DataChangedPayload[] = []
      const transactionStates: boolean[] = []
      const unsubscribe = subscribeDataChanges((event) => {
        events.push(event)
        transactionStates.push(db.inTransaction)
        trace.push('event')
      })
      try {
        const result = run({
          db,
          events,
          trace,
          update: original ? (id) => runOriginalUpdateFirstAc(db, id) : updateFirstAc,
          recompute: original
            ? (ids) => runOriginalRecomputeProblemSubmissionState(db, ids)
            : recomputeProblemSubmissionState,
        })
        results.push({
          result,
          events,
          trace,
          clockCalls,
          transactionStates,
          problems: db.prepare('SELECT * FROM problems ORDER BY rowid').all(),
          submissions: db.prepare('SELECT * FROM submissions ORDER BY rowid').all(),
          inTransaction: db.inTransaction,
        })
      } finally {
        unsubscribe()
        closeDb()
      }
    }
  } finally {
    Date.now = originalNow
  }
  assert.deepStrictEqual(results[1], results[0])
}

function seedNativeFirstAc(
  db: Database.Database,
  id = 'first-ac',
  previous: number | string | null = null,
  submitted: number | string | null = 0,
  verdict = 'AC',
  childId: string | null = id,
): void {
  db.prepare(
    `INSERT INTO problems
    (id,platform,platform_problem_id,canonical_url,status,first_solved_at,first_seen_at,created_at,updated_at,deleted_at)
    VALUES (?,'test',?,'https://example.invalid/first-ac','unknown',?,0,0,12,0)`,
  ).run(id, id, previous)
  if (submitted !== null)
    db.prepare(
      `INSERT INTO submissions
    (id,problem_id,platform,platform_submission_id,verdict,submitted_at,created_at,updated_at,deleted_at)
    VALUES (?,?,'test',?,?,?,0,0,0)`,
    ).run(childId, id, id, verdict, submitted)
}

function nativeFirstAcState(db: Database.Database, id = 'first-ac') {
  return db
    .prepare<
      [string],
      { status: string; first_solved_at: number | string | null; updated_at: number }
    >('SELECT status,first_solved_at,updated_at FROM problems WHERE id = ?')
    .get(id)
}

function traceNativeFirstAc(db: Database.Database, trace: string[]) {
  const descriptor = Object.getOwnPropertyDescriptor(db, 'prepare')
  const prepare = db.prepare.bind(db)
  let nativeError: unknown
  Object.defineProperty(db, 'prepare', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const kind = /^\s*update/i.test(query)
        ? 'update'
        : /count\(\*\)/i.test(query)
          ? 'aggregate'
          : /from ["`]?submissions/i.test(query)
            ? 'ac'
            : 'parent'
      trace.push(`prepare:${kind}`)
      try {
        const statement = prepare(query)
        for (const method of ['get', 'run'] as const) {
          const execute = statement[method].bind(statement)
          Object.defineProperty(statement, method, {
            configurable: true,
            value: (...bindings: unknown[]) => {
              const normalized = kind === 'ac' ? bindings.slice(0, 1) : bindings
              trace.push(`${method}:${kind}:${JSON.stringify(normalized)}`)
              try {
                return execute(...bindings)
              } catch (error) {
                nativeError = error
                throw error
              }
            },
          })
        }
        return statement
      } catch (error) {
        nativeError = error
        throw error
      }
    },
  })
  return {
    failure: () => nativeError,
    restore: () => {
      if (descriptor) Object.defineProperty(db, 'prepare', descriptor)
      else Reflect.deleteProperty(db, 'prepare')
    },
  }
}

function nativeFirstAcIterable(trace: string[], ids: string[], failure?: Error): Iterable<string> {
  return {
    get [Symbol.iterator]() {
      trace.push('iterator:get')
      return function* () {
        trace.push('iterator:start')
        for (const id of ids) {
          trace.push(`iterator:yield:${id}`)
          yield id
        }
        if (failure) throw failure
        trace.push('iterator:end')
      }
    },
  }
}

test('First-AC writes preserve native raw scalars, nullable child IDs, tombstones and exact ID bindings', () => {
  for (const mode of ['append', 'recompute']) {
    compareNativeFirstAc(({ db, update, recompute, events }) => {
      const instants = [
        0,
        -1,
        1.75,
        8640000000000001,
        Number.MAX_SAFE_INTEGER + 1,
        'text-diagnostic',
      ]
      const dates: string[][] = []
      for (const [index, instant] of instants.entries()) {
        const id = `raw-${index}`
        seedNativeFirstAc(db, id, null, instant, 'AC', index === 0 ? null : id)
        dates.push(mode === 'append' ? update(id) : recompute([id]))
        assert.deepStrictEqual(nativeFirstAcState(db, id), {
          status: 'solved',
          first_solved_at: instant,
          updated_at: 1.75,
        })
        assert.deepStrictEqual(
          dates.at(-1),
          instant === 0 || instant === -1 ? [toLocalDay(instant)] : [],
        )
      }
      for (const id of ['', "literal'_%\\\u2603", '\u0000first-ac', '\ud800']) {
        seedNativeFirstAc(db, id, null, 0)
        dates.push(mode === 'append' ? update(id) : recompute([id]))
        assert.deepStrictEqual(nativeFirstAcState(db, id), {
          status: 'solved',
          first_solved_at: 0,
          updated_at: 1.75,
        })
      }
      seedNativeFirstAc(db, 'wrong-case', 0, 1, 'ac', null)
      dates.push(mode === 'append' ? update('wrong-case') : recompute(['wrong-case']))
      assert.deepStrictEqual(
        nativeFirstAcState(db, 'wrong-case'),
        mode === 'append'
          ? { status: 'unknown', first_solved_at: 0, updated_at: 12 }
          : { status: 'attempted', first_solved_at: null, updated_at: 1.75 },
      )
      assert.strictEqual(events.length, mode === 'append' ? 10 : 11)
      return {
        dates,
        storage: db
          .prepare(
            'SELECT typeof(first_solved_at) AS first_ac, typeof(updated_at) AS updated FROM problems ORDER BY rowid',
          )
          .all(),
      }
    })
  }
})

test('First-AC native preparation precedes complete iteration and preserves native damaged-column error identity', () => {
  for (const column of ['first_solved_at', 'submitted_at', 'updated_at']) {
    for (const mode of ['append', 'recompute']) {
      compareNativeFirstAc(({ db, update, recompute, trace, events }) => {
        seedNativeFirstAc(db)
        db.exec(
          `ALTER TABLE ${column === 'submitted_at' ? 'submissions' : 'problems'} RENAME COLUMN ${column} TO damaged_column`,
        )
        const tracking = traceNativeFirstAc(db, trace)
        let caught: unknown
        try {
          mode === 'append' ? update('first-ac') : recompute(nativeFirstAcIterable(trace, []))
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        assert.strictEqual(caught, tracking.failure())
        assert.ok(caught instanceof Error)
        assert.strictEqual(caught.name, 'SqliteError')
        assert.match(caught.message, /^no such column:/)
        assert.ok(caught.message.includes(column))
        assert.ok('code' in caught)
        assert.strictEqual(caught.code, 'SQLITE_ERROR')
        assert.ok(!trace.includes('iterator:get'))
        assert.ok(!trace.some((entry) => entry.startsWith('run:')))
        assert.deepStrictEqual(events, [])
        return { name: caught.name, code: caught.code }
      })
    }
  }
  for (const fails of [false, true]) {
    compareNativeFirstAc(({ db, recompute, trace, events }) => {
      seedNativeFirstAc(db)
      const failure = new Error('iterator sentinel')
      const tracking = traceNativeFirstAc(db, trace)
      let result: unknown
      try {
        if (fails) {
          try {
            recompute(nativeFirstAcIterable(trace, ['first-ac'], failure))
          } catch (error) {
            assert.strictEqual(error, failure)
            result = error.message
          }
        } else {
          db.pragma('query_only = ON')
          result = recompute(nativeFirstAcIterable(trace, []))
        }
      } finally {
        tracking.restore()
      }
      assert.deepStrictEqual(trace.slice(0, 5), [
        'prepare:parent',
        'prepare:aggregate',
        'prepare:update',
        'iterator:get',
        'iterator:start',
      ])
      assert.ok(!trace.some((entry) => entry.startsWith('get:') || entry.startsWith('run:')))
      assert.deepStrictEqual(events, [])
      assert.strictEqual(nativeFirstAcState(db)?.first_solved_at, null)
      return result
    })
  }
})

test('First-AC native no-AC bypasses unused UPDATE while actual readonly no-op and orphan UPDATE fail', () => {
  compareNativeFirstAc(({ db, update, trace, events }) => {
    seedNativeFirstAc(db, 'first-ac', 0, null)
    db.exec('ALTER TABLE problems RENAME COLUMN updated_at TO unused_updated_at')
    db.pragma('query_only = ON')
    const tracking = traceNativeFirstAc(db, trace)
    let dates
    try {
      dates = update('first-ac')
    } finally {
      tracking.restore()
    }
    assert.deepStrictEqual(dates, [toLocalDay(0)])
    assert.deepStrictEqual(trace, [
      'prepare:parent',
      'get:parent:["first-ac"]',
      'prepare:ac',
      'get:ac:["first-ac"]',
    ])
    assert.deepStrictEqual(events, [])
    return dates
  })
  for (const mode of ['append', 'recompute', 'orphan']) {
    compareNativeFirstAc(({ db, update, recompute, trace, events }) => {
      seedNativeFirstAc(db, 'first-ac', 0, 0)
      if (mode === 'orphan') {
        db.pragma('foreign_keys = OFF')
        db.exec('DELETE FROM problems')
        db.pragma('foreign_keys = ON')
      }
      db.pragma('query_only = ON')
      const tracking = traceNativeFirstAc(db, trace)
      let caught: unknown
      try {
        mode === 'recompute' ? recompute(['first-ac']) : update('first-ac')
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      assert.strictEqual(caught, tracking.failure())
      assert.ok(caught instanceof Error)
      assert.strictEqual(caught.name, 'SqliteError')
      assert.strictEqual(caught.message, 'attempt to write a readonly database')
      assert.ok('code' in caught)
      assert.strictEqual(caught.code, 'SQLITE_READONLY')
      assert.ok(trace.includes('prepare:update'))
      assert.ok(trace.some((entry) => entry.startsWith('run:update:')))
      assert.deepStrictEqual(events, [])
      return { name: caught.name, message: caught.message, code: caught.code }
    })
  }
})

test('First-AC native triggers observe exactly three SET targets and preserve IGNORE, FAIL and ABORT effects', () => {
  for (const mode of ['append', 'recompute']) {
    for (const action of ['audit', 'IGNORE', 'FAIL', 'ABORT']) {
      compareNativeFirstAc(({ db, update, recompute, events }) => {
        seedNativeFirstAc(db, 'first-ac', 86400000, 0)
        db.exec(`CREATE TABLE state_audit (phase TEXT, status TEXT, first_ac INTEGER, updated_at INTEGER);
          CREATE TRIGGER state_before BEFORE UPDATE ON problems BEGIN
            INSERT INTO state_audit VALUES ('before',NEW.status,NEW.first_solved_at,NEW.updated_at);
            ${action === 'audit' ? '' : action === 'IGNORE' ? 'SELECT RAISE(IGNORE);' : `SELECT RAISE(${action},'native state rejected');`}
          END;
          CREATE TRIGGER state_after AFTER UPDATE ON problems BEGIN
            INSERT INTO state_audit VALUES ('after',NEW.status,NEW.first_solved_at,NEW.updated_at);
          END;`)
        for (const column of ['status', 'first_solved_at', 'updated_at', 'title']) {
          db.exec(`CREATE TRIGGER state_of_${column} AFTER UPDATE OF ${column} ON problems BEGIN
            INSERT INTO state_audit VALUES ('${column}',NEW.status,NEW.first_solved_at,NEW.updated_at);
          END;`)
        }
        const result = submissionReadOutcome(() =>
          mode === 'append' ? update('first-ac') : recompute(['first-ac']),
        )
        const audit = db.prepare('SELECT * FROM state_audit ORDER BY rowid').all()
        assert.strictEqual(audit.length, action === 'audit' ? 5 : action === 'ABORT' ? 0 : 1)
        assert.deepStrictEqual(
          events,
          action === 'audit' ? [{ tables: ['problems', 'stats'] }] : [],
        )
        if (action === 'FAIL' || action === 'ABORT')
          assert.deepStrictEqual(result, {
            error: {
              name: 'SqliteError',
              message: 'native state rejected',
              code: 'SQLITE_CONSTRAINT_TRIGGER',
            },
          })
        else
          assert.deepStrictEqual(result, {
            rows: [...new Set([toLocalDay(86400000), toLocalDay(0)])],
          })
        assert.strictEqual(
          nativeFirstAcState(db)?.first_solved_at,
          action === 'audit' ? 0 : 86400000,
        )
        return { result, audit }
      })
    }
  }
})

test('First-AC native caller transactions preserve savepoints and suppress notifications on real COMMIT failure', () => {
  for (const mode of ['append', 'recompute']) {
    for (const action of ['commit', 'rollback', 'inner-rollback', 'commit-failure']) {
      compareNativeFirstAc(({ db, update, recompute, events }) => {
        seedNativeFirstAc(db)
        seedNativeFirstAc(db, 'nested')
        if (action === 'commit-failure')
          db.exec(`CREATE TRIGGER deferred_state AFTER UPDATE ON problems BEGIN
          INSERT INTO submissions (id,problem_id,platform,platform_submission_id,verdict,submitted_at,created_at,updated_at)
          VALUES ('deferred-' || NEW.id,'missing','deferred',NEW.id,'WA',0,0,0);
        END;`)
        let callbackFinished = false
        const result = submissionReadOutcome(() =>
          withDataChangeTransaction(() =>
            db.transaction(() => {
              if (action === 'commit-failure') db.pragma('defer_foreign_keys = ON')
              mode === 'append' ? update('first-ac') : recompute(['first-ac'])
              assert.deepStrictEqual(events, [])
              const nested = () =>
                withDataChangeTransaction(() =>
                  db.transaction(() => {
                    mode === 'append' ? update('nested') : recompute(['nested'])
                    if (action === 'inner-rollback') throw new Error('inner rollback')
                  })(),
                )
              if (action === 'inner-rollback') assert.throws(nested, /inner rollback/)
              else nested()
              assert.deepStrictEqual(events, [])
              if (action === 'rollback') throw new Error('outer rollback')
              callbackFinished = true
            })(),
          ),
        )
        const commits = action === 'commit' || action === 'inner-rollback'
        assert.strictEqual(nativeFirstAcState(db)?.first_solved_at, commits ? 0 : null)
        assert.strictEqual(
          nativeFirstAcState(db, 'nested')?.first_solved_at,
          action === 'commit' ? 0 : null,
        )
        assert.deepStrictEqual(events, commits ? [{ tables: ['problems', 'stats'] }] : [])
        assert.strictEqual(db.inTransaction, false)
        if (action === 'commit-failure') {
          assert.strictEqual(callbackFinished, true)
          assert.deepStrictEqual(result, {
            error: {
              name: 'SqliteError',
              message: 'FOREIGN KEY constraint failed',
              code: 'SQLITE_CONSTRAINT_FOREIGNKEY',
            },
          })
          assert.strictEqual(db.prepare('SELECT * FROM submissions').all().length, 2)
        }
        return { result, callbackFinished }
      })
    }
  }
})

test('First-AC native autocommit preserves partial failure and synchronous reentrant day snapshots', () => {
  compareNativeFirstAc(({ db, recompute, events, trace }) => {
    seedNativeFirstAc(db, 'first-ac', 86400000, 0)
    seedNativeFirstAc(db, 'next', 172800000, 86400000)
    const observed: unknown[] = []
    const unsubscribe = subscribeDataChanges(() => {
      observed.push(nativeFirstAcState(db))
      if (events.length === 1) {
        db.exec(
          "UPDATE problems SET first_solved_at = 172800000 WHERE id='first-ac'; UPDATE submissions SET submitted_at=0 WHERE problem_id='next'",
        )
        trace.push('listener')
      }
    })
    try {
      const dates = recompute(['first-ac', 'next', 'first-ac'])
      assert.deepStrictEqual(dates, [
        ...new Set([toLocalDay(86400000), toLocalDay(0), toLocalDay(172800000)]),
      ])
      assert.strictEqual(nativeFirstAcState(db, 'next')?.first_solved_at, 0)
      assert.deepStrictEqual(events, [
        { tables: ['problems', 'stats'] },
        { tables: ['problems', 'stats'] },
      ])
      return { dates, observed }
    } finally {
      unsubscribe()
    }
  })
  compareNativeFirstAc(({ db, recompute, events }) => {
    seedNativeFirstAc(db)
    seedNativeFirstAc(db, 'bad')
    db.exec(`CREATE TABLE partial_state_audit (id TEXT);
      CREATE TRIGGER partial_state BEFORE UPDATE ON problems BEGIN
        INSERT INTO partial_state_audit VALUES (NEW.id);
        SELECT CASE WHEN NEW.id='bad' THEN RAISE(FAIL,'later state rejected') END;
      END;`)
    const result = submissionReadOutcome(() => recompute(['first-ac', 'bad']))
    assert.deepStrictEqual(result, {
      error: {
        name: 'SqliteError',
        message: 'later state rejected',
        code: 'SQLITE_CONSTRAINT_TRIGGER',
      },
    })
    assert.strictEqual(nativeFirstAcState(db)?.first_solved_at, 0)
    assert.strictEqual(nativeFirstAcState(db, 'bad')?.first_solved_at, null)
    assert.deepStrictEqual(events, [{ tables: ['problems', 'stats'] }])
    const audit = db.prepare('SELECT * FROM partial_state_audit ORDER BY rowid').all()
    assert.deepStrictEqual(audit, [{ id: 'first-ac' }, { id: 'bad' }])
    return { result, audit }
  })
})

type NativeStatsReads = {
  distribution: typeof getStatsPlatformDistribution
  visits: typeof getProblemVisitStats
  latest: typeof getStatsLastActiveTime
}

function nativeStatsSnapshot(db: Database.Database, omitMigrationClock = false) {
  const tables = db
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
  return {
    changes: db.prepare('SELECT total_changes() AS count').get(),
    schema: db.prepare('SELECT * FROM sqlite_schema ORDER BY type,name').all(),
    tables: tables.map(({ name }) => ({
      name,
      rows: db
        .prepare(
          name === 'schema_migrations' && omitMigrationClock
            ? 'SELECT version, name FROM schema_migrations ORDER BY rowid'
            : `SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`,
        )
        .all(),
    })),
    inTransaction: db.inTransaction,
  }
}

function compareNativeStatsReads(
  run: (db: Database.Database, reads: NativeStatsReads) => unknown,
): void {
  const results = []
  const originalNow = Date.now
  try {
    Date.now = () => 1768443630123
    for (const original of [true, false]) {
      closeDb()
      const db = initDbAtPath(':memory:')
      const events: DataChangedPayload[] = []
      const unsubscribe = subscribeDataChanges((event) => events.push(event))
      function checked<T>(read: () => T): T {
        let current: Database.Database | undefined
        try {
          current = getDb()
        } catch {
          /* Uninitialized calls are checked as well. */
        }
        const before = current?.open ? nativeStatsSnapshot(current) : undefined
        const now = Date.now
        Date.now = () => {
          throw new Error('Stats read must not capture a clock')
        }
        try {
          return read()
        } finally {
          Date.now = now
          if (before && current) assert.deepStrictEqual(nativeStatsSnapshot(current), before)
          assert.deepStrictEqual(events, [])
        }
      }
      const reads: NativeStatsReads = {
        distribution: () =>
          checked(() =>
            original
              ? getOriginalStatsPlatformDistribution(getDb())
              : getStatsPlatformDistribution(),
          ),
        visits: (id) =>
          checked(() =>
            original ? getOriginalStatsProblemVisits(getDb(), id) : getProblemVisitStats(id),
          ),
        latest: () =>
          checked(() =>
            original ? getOriginalStatsLastActive(getDb()) : getStatsLastActiveTime(),
          ),
      }
      try {
        // Separate initializations use legacy clocks; checked() still compares every ledger field.
        results.push({ result: run(db, reads), state: nativeStatsSnapshot(getDb(), true), events })
      } finally {
        unsubscribe()
        closeDb()
      }
    }
  } finally {
    Date.now = originalNow
  }
  assert.deepStrictEqual(results[1], results[0])
}

function seedNativeStatsProblem(
  db: Database.Database,
  id: string | null,
  platform = 'test',
  key = id ?? 'null-parent',
  deletedAt: number | null = null,
) {
  db.prepare(
    `INSERT INTO problems(id,platform,platform_problem_id,canonical_url,first_seen_at,created_at,updated_at,deleted_at)
    VALUES (?,?,?,'https://example.invalid/stats',0,1,2,?)`,
  ).run(id, platform, key, deletedAt)
}

function seedNativeStatsVisit(
  db: Database.Database,
  problemId: string,
  duration: number | string | null,
  active: number | string | null,
  id: string | null = null,
  deletedAt: number | null = null,
) {
  db.prepare(
    `INSERT INTO problem_visits(id,problem_id,platform,url,entered_at,duration_seconds,active_seconds,created_at,updated_at,deleted_at)
    VALUES (?,?,'test','https://example.invalid/stats',1.75,?,?,0,0,?)`,
  ).run(id, problemId, duration, active, deletedAt)
}

function seedNativeStatsEvent(
  db: Database.Database,
  instant: number | string,
  id: string | null = null,
  deletedAt: number | null = null,
) {
  db.prepare(
    `INSERT INTO activity_events(id,event_type,occurred_at,local_day,created_at,updated_at,deleted_at)
    VALUES (?,'diagnostic-event',?,'2026-01-15',0,0,?)`,
  ).run(id, instant, deletedAt)
}

test('Basic statistics native reads retain COUNT(*) grouping and independent NULL aggregate denominators', () => {
  compareNativeStatsReads((db, reads) => {
    assert.deepStrictEqual(reads.distribution(), [])
    assert.deepStrictEqual(reads.visits('missing'), {
      total_visits: 0,
      total_duration: 0,
      total_active: 0,
      avg_duration: 0,
    })
    assert.strictEqual(reads.latest(), null)
    seedNativeStatsProblem(db, null, 'most', 'null-1')
    seedNativeStatsProblem(db, null, 'most', 'null-2')
    seedNativeStatsProblem(db, '', 'most')
    seedNativeStatsProblem(db, 'deleted', 'most', 'deleted', 0)
    for (const [index, platform] of [
      'Case',
      'case',
      "literal'_%\\",
      '\u4e2d\u6587',
      'with\0nul',
    ].entries())
      seedNativeStatsProblem(db, `p${index}`, platform)
    seedNativeStatsVisit(db, 'deleted', 10, null, null, 0)
    seedNativeStatsVisit(db, 'deleted', null, 7)
    seedNativeStatsVisit(db, 'deleted', 20, null, '')
    const distribution = reads.distribution()
    assert.deepStrictEqual(distribution[0], { platform: 'most', count: 3 })
    assert.strictEqual(distribution.length, 6)
    for (const row of distribution) assert.deepStrictEqual(Object.keys(row), ['platform', 'count'])
    const visits = reads.visits('deleted')
    assert.deepStrictEqual(visits, {
      total_visits: 3,
      total_duration: 30,
      total_active: 7,
      avg_duration: 15,
    })
    assert.deepStrictEqual(Object.keys(visits), [
      'total_visits',
      'total_duration',
      'total_active',
      'avg_duration',
    ])
    db.pragma('foreign_keys = OFF')
    seedNativeStatsVisit(db, 'orphan', -2.5, 1.25, null, 0)
    seedNativeStatsVisit(db, 'orphan', 4, -2)
    db.pragma('foreign_keys = ON')
    assert.deepStrictEqual(reads.visits('orphan'), {
      total_visits: 2,
      total_duration: 1.5,
      total_active: -0.75,
      avg_duration: 0.75,
    })
    db.pragma('query_only = ON')
    return {
      distribution: reads.distribution(),
      visits: reads.visits('deleted'),
      orphan: reads.visits('orphan'),
      latest: reads.latest(),
    }
  })
})

test('Basic statistics native reads preserve literal keys, raw latest scalar classes and tombstones', () => {
  compareNativeStatsReads((db, reads) => {
    const visits = []
    for (const key of ['', "literal'_%\\", 'Case', 'case', '\u4e2d\u6587', 'with\0nul', '\ud800']) {
      seedNativeStatsProblem(db, key)
      seedNativeStatsVisit(db, key, 1.75, null, null, 0)
      const row = reads.visits(key)
      assert.deepStrictEqual(row, {
        total_visits: 1,
        total_duration: 1.75,
        total_active: 0,
        avg_duration: 1.75,
      })
      visits.push(row)
    }
    const latest = []
    for (const instant of [
      0,
      -1,
      1.75,
      -0.5,
      8640000000000001,
      Number.MAX_SAFE_INTEGER + 1,
      'diagnostic-time',
    ]) {
      db.exec('DELETE FROM activity_events')
      seedNativeStatsEvent(db, -100, 'older')
      seedNativeStatsEvent(db, instant, null, 0)
      seedNativeStatsEvent(db, instant, 'tie', 0)
      const value = reads.latest()
      assert.strictEqual(value, instant)
      assert.strictEqual(typeof value, typeof instant)
      latest.push(value)
    }
    return { visits, latest }
  })
})

test('Basic statistics native INTEGER SUM overflow propagates from actual stepping without fallback', () => {
  for (const column of ['duration_seconds', 'active_seconds'])
    compareNativeStatsReads((db, reads) => {
      seedNativeStatsProblem(db, 'overflow')
      db.exec(`INSERT INTO problem_visits(id,problem_id,platform,url,entered_at,${column},created_at,updated_at)
      VALUES ('max','overflow','test','https://example.invalid/stats',0,9223372036854775807,0,0),
             ('one','overflow','test','https://example.invalid/stats',0,1,0,0)`)
      assert.deepStrictEqual(
        db.prepare(`SELECT typeof(${column}) AS storage FROM problem_visits ORDER BY rowid`).all(),
        [{ storage: 'integer' }, { storage: 'integer' }],
      )
      const descriptor = Object.getOwnPropertyDescriptor(db, 'prepare')
      const prepare = db.prepare.bind(db)
      const trace: string[] = []
      let nativeError: unknown
      Object.defineProperty(db, 'prepare', {
        configurable: true,
        value: (query: string) => {
          const statement = prepare(query)
          if (!/avg\(/i.test(query)) return statement
          trace.push('prepare')
          const get = statement.get.bind(statement)
          Object.defineProperty(statement, 'get', {
            configurable: true,
            value: (...bindings: unknown[]) => {
              trace.push('get')
              try {
                return get(...bindings)
              } catch (error) {
                nativeError = error
                throw error
              }
            },
          })
          return statement
        },
      })
      let caught: unknown
      try {
        reads.visits('overflow')
      } catch (error) {
        caught = error
      } finally {
        if (descriptor) Object.defineProperty(db, 'prepare', descriptor)
        else Reflect.deleteProperty(db, 'prepare')
      }
      assert.strictEqual(caught, nativeError)
      assert.ok(caught instanceof Error)
      assert.ok('code' in caught)
      const result = { name: caught.name, message: caught.message, code: caught.code }
      assert.deepStrictEqual(result, {
        name: 'SqliteError',
        message: 'integer overflow',
        code: 'SQLITE_ERROR',
      })
      assert.deepStrictEqual(trace, ['prepare', 'get'])
      return result
    })
})

test('Basic statistics native reads follow transaction and connection ownership through rollback and reopen', () => {
  compareNativeStatsReads((db, reads) => {
    const observed: unknown[] = []
    assert.throws(
      () =>
        db.transaction(() => {
          seedNativeStatsProblem(db, 'pending')
          seedNativeStatsVisit(db, 'pending', 10, 2)
          seedNativeStatsEvent(db, 1.75)
          observed.push([reads.distribution(), reads.visits('pending'), reads.latest()])
          assert.strictEqual(db.inTransaction, true)
          assert.throws(
            () =>
              db.transaction(() => {
                seedNativeStatsVisit(db, 'pending', 20, null, 'nested')
                observed.push(reads.visits('pending'))
                throw new Error('inner rollback')
              })(),
            /inner rollback/,
          )
          assert.strictEqual(reads.visits('pending').total_visits, 1)
          throw new Error('outer rollback')
        })(),
      /outer rollback/,
    )
    assert.deepStrictEqual(reads.distribution(), [])
    assert.deepStrictEqual(reads.visits('pending'), {
      total_visits: 0,
      total_duration: 0,
      total_active: 0,
      avg_duration: 0,
    })
    assert.strictEqual(reads.latest(), null)
    closeDb()
    const failures = [
      submissionReadOutcome(reads.distribution),
      submissionReadOutcome(() => reads.visits('pending')),
      submissionReadOutcome(reads.latest),
    ]
    for (const result of failures)
      assert.deepStrictEqual(result, {
        error: { name: 'Error', message: 'Database not initialized. Call initDb() first.' },
      })
    const next = initDbAtPath(':memory:')
    seedNativeStatsProblem(next, 'new', 'other')
    seedNativeStatsVisit(next, 'new', 3.5, 1)
    seedNativeStatsEvent(next, 0, null, 0)
    next.pragma('query_only = ON')
    return {
      observed,
      failures,
      current: [reads.distribution(), reads.visits('new'), reads.latest()],
    }
  })
})

let dbForTest: Database.Database | null = null
function getDbForTest(): Database.Database {
  assert.ok(dbForTest, 'Temporary database is not initialized')
  return dbForTest
}

function runWithTemporaryDatabase(fn: () => void): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-repository-test-'))
  const dbPath = path.join(tempDir, 'repository.sqlite')

  try {
    dbForTest = initDbAtPath(dbPath)
    assert.ok(dbPath.startsWith(tempDir))
    assert.ok(fs.existsSync(dbPath))
    fn()
  } finally {
    dbForTest = null
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

let failedCount = 0
console.log('Running database repository tests...\n')
for (const t of tests) {
  try {
    runWithTemporaryDatabase(t.fn)
    console.log(`[PASS] ${t.name}`)
  } catch (err: any) {
    console.error(`[FAIL] ${t.name}`)
    console.error(err.stack || err)
    failedCount++
  }
}

console.log(`\nTests finished. Failed: ${failedCount}/${tests.length}`)
if (failedCount > 0) {
  process.exitCode = 1
}
