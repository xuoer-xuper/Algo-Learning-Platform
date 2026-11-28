import assert from 'node:assert'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import NativeDatabase from 'better-sqlite3'
import { findNoteFilePath } from '../../electron/db/repositories/notes/file-path'
import { oldFindNoteFilePath } from './notes-file-path-oracle'
import {
  updateNoteTitleRow,
  updateNoteTypeRow,
} from '../../electron/db/repositories/notes/title-type'
import { oldUpdateNoteTitleRow, oldUpdateNoteTypeRow } from './notes-title-type-oracle'
import { deleteNoteRow } from '../../electron/db/repositories/notes/delete'
import { oldDeleteNoteRow } from './notes-delete-oracle'
import { updateNoteContentRow } from '../../electron/db/repositories/notes/content'
import { oldUpdateNoteContentRow } from './notes-content-oracle'
import {
  prepareCreateNoteInsert,
  type CreateNoteValues,
} from '../../electron/db/repositories/notes/create'
import { oldPrepareCreateNoteInsert } from './notes-create-oracle'
import {
  originalRecomputeDailyStatsAt,
  originalRecomputeAllDailyStatsAt,
  originalRecomputeDailyStats,
  originalRecomputeDailyStatsForDates,
  originalRecomputeAllDailyStats,
} from './stats-recompute-oracle'
import {
  recomputeDailyStatsAt as runtimeRecomputeDailyStatsAt,
  recomputeAllDailyStatsAt as runtimeRecomputeAllDailyStatsAt,
} from '../../electron/db/repositories/stats/recompute-runtime'
import {
  recomputeDailyStatsForDates,
  recomputeAllDailyStats,
} from '../../electron/db/repositories/stats/recompute'
import { getKnownMigrations } from '../../electron/db/connection'
import { applyDrizzleMigrations } from '../../src/main/db/migrate'
import { loadMigrationResources } from '../../src/main/db/migration-resources'
import { getOriginalOmniboxSuggestions } from './omnibox-suggestions-oracle'
import { getOriginalProblemDetail, getOriginalProblemVisits } from './problem-reads-oracle'
import { getOriginalRecentProblems } from './problem-recent-oracle'
import {
  getOriginalStatsPlatformDistribution,
  getOriginalStatsProblemVisits,
  getOriginalStatsLastActive,
} from './stats-basic-reads-oracle'
import {
  getOriginalAcTrend,
  getOriginalDailyActiveStats,
  getOriginalSubmissionTrend,
  getOriginalVisitedTrend,
} from './stats-daily-reads-oracle'
import { getOriginalStreakDays, invokeOriginalDayDiff } from './stats-streak-oracle'
import {
  getOriginalTimeline,
  getOriginalRevisitStats,
  getOriginalWrongProblems,
  getOriginalUnreviewedProblems,
} from './stats-insight-lists-oracle'
import { dayDiff } from '../../electron/db/repositories/stats/date'
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
import { sql } from 'drizzle-orm'
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
  getAcTrend,
  getDailyActiveStats,
  getSubmissionTrend,
  getVisitedTrend,
  getStreakDays,
  getTimeline,
  getRevisitStats,
  getWrongProblems,
  getUnreviewedProblems,
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

type NativeDailyReads = {
  daily: typeof getDailyActiveStats
  visited: typeof getVisitedTrend
  ac: typeof getAcTrend
  submissions: typeof getSubmissionTrend
}

function seedNativeDaily(
  db: Database.Database,
  day: string | null,
  base = 0,
  deletedAt: number | null = null,
) {
  db.prepare(
    `INSERT INTO user_daily_stats
    (local_day,active_seconds,duration_seconds,visited_problem_count,solved_problem_count,
     submission_count,ac_submission_count,recomputed_at,created_at,updated_at,deleted_at)
    VALUES (?,?,?,?,?,?,?,1.75,0,2,?)`,
  ).run(day, base + 1, base + 2, base + 3, base + 4, base + 5, base + 6, deletedAt)
}

function compareNativeDailyReads(
  run: (scenario: {
    db: Database.Database
    reads: NativeDailyReads
    trace: string[]
    setClock: (instant: number) => void
    failClock: (error: Error) => void
  }) => unknown,
): void {
  const results = []
  const originalNow = Date.now
  try {
    for (const original of [true, false]) {
      Date.now = () => new Date(2026, 10, 20, 0, 30).getTime()
      closeDb()
      const db = initDbAtPath(':memory:')
      const trace: string[] = []
      const events: DataChangedPayload[] = []
      const unsubscribe = subscribeDataChanges((event) => events.push(event))
      let instant = new Date(2026, 10, 20, 0, 30).getTime()
      let clockFailure: Error | undefined
      Date.now = () => {
        trace.push('clock')
        if (clockFailure) throw clockFailure
        return instant
      }
      function checked<T>(read: () => T): T {
        let current: Database.Database | undefined
        try {
          current = getDb()
        } catch {
          /* Closed connection failures are part of this comparison. */
        }
        const before = current?.open ? nativeStatsSnapshot(current) : undefined
        try {
          return read()
        } finally {
          if (before && current) assert.deepStrictEqual(nativeStatsSnapshot(current), before)
          assert.deepStrictEqual(events, [])
        }
      }
      const reads: NativeDailyReads = {
        daily: (days) =>
          checked(() =>
            original ? getOriginalDailyActiveStats(getDb(), days) : getDailyActiveStats(days),
          ),
        visited: (days) =>
          checked(() =>
            original ? getOriginalVisitedTrend(getDb(), days) : getVisitedTrend(days),
          ),
        ac: (days) =>
          checked(() => (original ? getOriginalAcTrend(getDb(), days) : getAcTrend(days))),
        submissions: (days) =>
          checked(() =>
            original ? getOriginalSubmissionTrend(getDb(), days) : getSubmissionTrend(days),
          ),
      }
      try {
        const result = run({
          db,
          reads,
          trace,
          setClock: (value) => {
            instant = value
          },
          failClock: (error) => {
            clockFailure = error
          },
        })
        // Only independent initialization clocks differ; checked() includes the whole ledger.
        results.push({ result, trace, state: nativeStatsSnapshot(getDb(), true), events })
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

function traceNativeDaily(db: Database.Database, trace: string[]) {
  const descriptor = Object.getOwnPropertyDescriptor(db, 'prepare')
  const prepare = db.prepare.bind(db)
  let nativeError: unknown
  Object.defineProperty(db, 'prepare', {
    configurable: true,
    value: (query: string) => {
      if (!/from ["`]?user_daily_stats/i.test(query) || !/order by .*local_day/i.test(query))
        return prepare(query)
      const kind = /active_seconds/i.test(query)
        ? 'daily'
        : /ac_submission_count/i.test(query)
          ? 'submissions'
          : /visited_problem_count/i.test(query)
            ? 'visited'
            : 'ac'
      trace.push(`prepare:${kind}`)
      try {
        const statement = prepare(query)
        const all = statement.all.bind(statement)
        Object.defineProperty(statement, 'all', {
          configurable: true,
          value: (...bindings: unknown[]) => {
            const text = bindings
              .map((value) =>
                typeof value === 'number'
                  ? Object.is(value, -0)
                    ? '-0'
                    : String(value)
                  : JSON.stringify(value),
              )
              .join(',')
            trace.push(`all:${kind}:[${text}]`)
            try {
              return all(...bindings)
            } catch (error) {
              nativeError = error
              throw error
            }
          },
        })
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

test('Daily native reads preserve multiple NULL keys, raw metrics, tombstones, aliases and row limits', () => {
  compareNativeDailyReads(({ db, reads, trace, failClock }) => {
    assert.deepStrictEqual(
      [reads.daily(), reads.visited(), reads.ac(), reads.submissions()],
      [[], [], [], []],
    )
    const days = [null, null, '', '2026-02-30', '2026-11-19', '2026-11-20', '2026-11-21', 'zzz']
    for (const [index, day] of days.entries()) seedNativeDaily(db, day, index * 10 - 0.25, 0)
    assert.throws(() => seedNativeDaily(db, '2026-11-20'), /UNIQUE constraint failed/)
    failClock(new Error('uncapped reads must not capture a clock'))
    const result = {
      daily: reads.daily(-1),
      visited: reads.visited(),
      ac: reads.ac(),
      submissions: reads.submissions(-1),
    }
    assert.deepStrictEqual(
      result.visited.map((row) => row.local_day),
      days,
    )
    assert.deepStrictEqual(
      result.daily.map((row) => row.local_day),
      ['zzz', '2026-11-21', '2026-11-20', '2026-11-19', '2026-02-30', '', null, null],
    )
    assert.deepStrictEqual(
      result.daily.find((row) => row.local_day === '2026-11-20'),
      {
        local_day: '2026-11-20',
        active_seconds: 50.75,
        duration_seconds: 51.75,
        visited: 52.75,
        solved: 53.75,
        submissions: 54.75,
        ac: 55.75,
      },
    )
    assert.strictEqual(result.ac.find((row) => row.local_day === '2026-11-20')?.count, 53.75)
    for (const row of result.daily)
      assert.deepStrictEqual(Object.keys(row), [
        'local_day',
        'active_seconds',
        'duration_seconds',
        'visited',
        'solved',
        'submissions',
        'ac',
      ])
    for (const row of result.submissions)
      assert.deepStrictEqual(Object.keys(row), ['local_day', 'total', 'ac'])
    for (let index = 0; index < 35; index++) seedNativeDaily(db, `raw-${index}`, index)
    assert.strictEqual(reads.daily().length, 30)
    assert.strictEqual(reads.submissions().length, 30)
    assert.strictEqual(reads.visited().length, 43)
    assert.deepStrictEqual(trace, [])
    return result
  })
})

test('Daily native LIMIT bindings retain zero, negative, fractional, NaN and infinity behavior', () => {
  compareNativeDailyReads(({ db, reads, trace, failClock }) => {
    seedNativeDaily(db, null)
    seedNativeDaily(db, null, 10)
    seedNativeDaily(db, '2026-11-20', 20)
    failClock(new Error('LIMIT reads must not capture a clock'))
    const results = []
    const tracking = traceNativeDaily(db, trace)
    try {
      for (const query of ['daily', 'submissions'] as const) {
        for (const days of [
          undefined,
          0,
          -0,
          1,
          -1,
          -5,
          1.25,
          -1.25,
          NaN,
          Infinity,
          -Infinity,
          Number.MAX_SAFE_INTEGER,
        ]) {
          const result = submissionReadOutcome(() => reads[query](days))
          results.push(result)
          if (days === 0) assert.deepStrictEqual(result.rows, [])
          if (days === -1 || days === -5) {
            assert.ok(Array.isArray(result.rows))
            assert.strictEqual(result.rows.length, 3)
          }
          if (days !== undefined && (!Number.isFinite(days) || !Number.isInteger(days))) {
            assert.deepStrictEqual(result.error, {
              name: 'SqliteError',
              message: 'datatype mismatch',
              code: 'SQLITE_MISMATCH',
            })
          }
        }
      }
      let caught: unknown
      try {
        reads.daily(NaN)
      } catch (error) {
        caught = error
      }
      assert.strictEqual(caught, tracking.failure())
    } finally {
      tracking.restore()
    }
    assert.ok(!trace.includes('clock'))
    assert.ok(trace.includes('all:daily:[NaN]'))
    assert.ok(trace.includes('all:submissions:[-0]'))
    return results
  })
})

test('Daily native truthy cutoff keeps lexical inclusion, prepare-before-clock and exact errors', () => {
  compareNativeDailyReads(({ db, reads, trace, setClock, failClock }) => {
    const days = [null, null, '', '2026-02-30', '2026-11-19', '2026-11-20', '2026-11-21', 'zzz']
    for (const [index, day] of days.entries()) seedNativeDaily(db, day, index * 10, 0)
    const tracking = traceNativeDaily(db, trace)
    const results = []
    try {
      for (const query of ['visited', 'ac'] as const) {
        for (const value of [undefined, 0, -0, NaN]) {
          const start = trace.length
          const rows = reads[query](value)
          assert.deepStrictEqual(
            rows.map((row) => row.local_day),
            days,
          )
          assert.deepStrictEqual(trace.slice(start), [`prepare:${query}`, `all:${query}:[]`])
          results.push(rows)
        }
        for (const value of [1, -1, 1.5, Infinity]) {
          const start = trace.length
          const result = submissionReadOutcome(() => reads[query](value))
          assert.deepStrictEqual(trace.slice(start, start + 2), [`prepare:${query}`, 'clock'])
          if (value === 1 || value === -1) {
            const rows = reads[query](value)
            assert.deepStrictEqual(
              rows.map((row) => row.local_day),
              value === 1
                ? ['2026-11-19', '2026-11-20', '2026-11-21', 'zzz']
                : ['2026-11-21', 'zzz'],
            )
          } else {
            assert.deepStrictEqual(result.error, {
              name: 'TypeError',
              message: 'Day shift must be an integer',
            })
            assert.strictEqual(trace.length, start + 2)
          }
          results.push(result)
        }
      }
      setClock(new Date(2026, 10, 19, 23, 59, 59, 999).getTime())
      reads.visited(1)
      assert.strictEqual(trace.at(-1), 'all:visited:["2026-11-18"]')
      setClock(new Date(2026, 10, 20, 0, 0).getTime())
      reads.visited(1)
      assert.strictEqual(trace.at(-1), 'all:visited:["2026-11-19"]')
      const clockFailure = new Error('native clock sentinel')
      failClock(clockFailure)
      assert.throws(
        () => reads.ac(1),
        (error: unknown) => error === clockFailure,
      )
      db.exec('DROP TABLE user_daily_stats')
      for (const query of ['visited', 'ac'] as const) {
        const start = trace.length
        let caught: unknown
        try {
          reads[query](1.5)
        } catch (error) {
          caught = error
        }
        assert.strictEqual(caught, tracking.failure())
        const result = submissionReadOutcome(() => {
          throw caught
        })
        assert.deepStrictEqual(result.error, {
          name: 'SqliteError',
          message: 'no such table: user_daily_stats',
          code: 'SQLITE_ERROR',
        })
        assert.deepStrictEqual(trace.slice(start), [`prepare:${query}`])
        results.push(result)
      }
    } finally {
      tracking.restore()
    }
    return results
  })
})

test('Daily native reads retain query-only, caller savepoints, rollback and current-handle lifecycle', () => {
  compareNativeDailyReads(({ db, reads }) => {
    seedNativeDaily(db, null, 10, 0)
    seedNativeDaily(db, '2026-11-20', 20, 0)
    db.pragma('query_only = ON')
    const initial = [reads.daily(-1), reads.visited(), reads.ac(1), reads.submissions(-1)]
    db.pragma('query_only = OFF')
    const pending: unknown[] = []
    assert.throws(
      () =>
        db.transaction(() => {
          seedNativeDaily(db, '2026-11-21', 30)
          pending.push(reads.daily(-1), reads.visited(), reads.ac(1), reads.submissions(-1))
          assert.strictEqual(db.inTransaction, true)
          assert.throws(
            () =>
              db.transaction(() => {
                seedNativeDaily(db, null, 40)
                pending.push(reads.visited())
                assert.strictEqual(reads.ac().length, 4)
                throw new Error('daily nested rollback')
              })(),
            /daily nested rollback/,
          )
          assert.strictEqual(reads.visited().length, 3)
          throw new Error('daily outer rollback')
        })(),
      /daily outer rollback/,
    )
    assert.strictEqual(db.inTransaction, false)
    assert.deepStrictEqual(
      [reads.daily(-1), reads.visited(), reads.ac(1), reads.submissions(-1)],
      initial,
    )
    closeDb()
    const failures = [
      submissionReadOutcome(() => reads.daily()),
      submissionReadOutcome(() => reads.visited(1.5)),
      submissionReadOutcome(() => reads.ac(Infinity)),
      submissionReadOutcome(() => reads.submissions()),
    ]
    for (const result of failures)
      assert.deepStrictEqual(result, {
        error: { name: 'Error', message: 'Database not initialized. Call initDb() first.' },
      })
    const next = initDbAtPath(':memory:')
    seedNativeDaily(next, null, -2.75)
    next.pragma('query_only = ON')
    const current = [reads.daily(-1), reads.visited(), reads.ac(), reads.submissions(-1)]
    assert.ok(current.every((rows) => rows.length === 1 && rows[0].local_day === null))
    return { initial, pending, failures, current }
  })
})

function seedNativeStreak(
  db: Database.Database,
  day: string | null,
  active = 300,
  submissions = 0,
  solved = 0,
  deletedAt: number | null = null,
) {
  db.prepare(
    `INSERT INTO user_daily_stats
    (local_day,active_seconds,duration_seconds,visited_problem_count,solved_problem_count,
     submission_count,ac_submission_count,recomputed_at,created_at,updated_at,deleted_at)
    VALUES (?,?,10000,10000,?,?,10000,1.75,0,2,?)`,
  ).run(day, active, solved, submissions, deletedAt)
}

function compareNativeStreak(
  run: (scenario: {
    db: Database.Database
    read: typeof getStreakDays
    trace: string[]
    setClock: (instant: number) => void
    failClock: (error: Error | undefined) => void
  }) => unknown,
) {
  const results = []
  const originalNow = Date.now
  try {
    for (const original of [true, false]) {
      Date.now = () => new Date(2026, 10, 20, 0, 30).getTime()
      closeDb()
      const db = initDbAtPath(':memory:')
      const trace: string[] = []
      const events: DataChangedPayload[] = []
      const unsubscribe = subscribeDataChanges((event) => events.push(event))
      let instant = new Date(2026, 10, 20, 0, 30).getTime()
      let clockFailure: Error | undefined
      Date.now = () => {
        trace.push('clock')
        if (clockFailure) throw clockFailure
        return instant
      }
      function read() {
        let current: Database.Database | undefined
        try {
          current = getDb()
        } catch {
          /* Uninitialized reads must fail without a clock or cached handle. */
        }
        const before = current?.open ? nativeStatsSnapshot(current) : undefined
        try {
          return original ? getOriginalStreakDays(getDb()) : getStreakDays()
        } finally {
          if (before && current) assert.deepStrictEqual(nativeStatsSnapshot(current), before)
          assert.deepStrictEqual(events, [])
        }
      }
      try {
        const result = run({
          db,
          read,
          trace,
          setClock: (value) => {
            instant = value
          },
          failClock: (error) => {
            clockFailure = error
          },
        })
        // Per-read snapshots include every ledger field; only independent setup clocks differ.
        results.push({ result, trace, state: nativeStatsSnapshot(getDb(), true), events })
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

test('Streak native thresholds, DESC anchoring and tombstones preserve numeric results without writes', () => {
  compareNativeStreak(({ db, read, trace, failClock }) => {
    failClock(new Error('empty cannot read the clock'))
    assert.deepStrictEqual(read(), { current: 0, longest: 0 })
    seedNativeStreak(db, '2026-11-20', 299)
    seedNativeStreak(db, null, -1, -1, -1)
    assert.deepStrictEqual(read(), { current: 0, longest: 0 })
    assert.deepStrictEqual(trace, [])
    failClock(undefined)
    db.prepare(
      'UPDATE user_daily_stats SET active_seconds=300, deleted_at=0 WHERE local_day=?',
    ).run('2026-11-20')
    seedNativeStreak(db, '2026-11-19', 0, 1)
    seedNativeStreak(db, '2026-11-18', 0, 0, 0.25)
    seedNativeStreak(db, '2026-11-16', 300)
    db.pragma('reverse_unordered_selects = ON')
    const tracking = traceNativeDaily(db, trace)
    let result
    try {
      result = read()
      assert.deepStrictEqual(result, { current: 3, longest: 3 })
      assert.deepStrictEqual(trace, ['prepare:daily', 'all:daily:[]', 'clock'])
    } finally {
      tracking.restore()
    }
    seedNativeStreak(db, '2026-11-21')
    assert.deepStrictEqual(read(), { current: 0, longest: 4 })
    db.exec("DELETE FROM user_daily_stats WHERE local_day >= '2026-11-20'")
    assert.deepStrictEqual(read(), { current: 0, longest: 2 })
    return result
  })
})

test('Streak native singleton NULL and malformed days differ from paired validation before clock', () => {
  compareNativeStreak(({ db, read, trace, failClock }) => {
    const results = []
    for (const day of [null, '', 'bad', '2026-02-30', '9999-12-31']) {
      db.exec('DELETE FROM user_daily_stats')
      seedNativeStreak(db, day)
      const start = trace.length
      assert.deepStrictEqual(read(), { current: 0, longest: 1 })
      assert.deepStrictEqual(trace.slice(start), ['clock'])
      const sentinel = new Error('streak clock sentinel')
      failClock(sentinel)
      let caught: unknown
      try {
        read()
      } catch (error) {
        caught = error
      }
      assert.strictEqual(caught, sentinel)
      failClock(undefined)
    }
    for (const days of [
      [null, null],
      ['2026-11-20', null],
      ['9999-12-31', null],
      ['2026-11-20', 'bad'],
    ]) {
      db.exec('DELETE FROM user_daily_stats')
      for (const day of days) seedNativeStreak(db, day)
      failClock(new Error('paired validation must win'))
      const start = trace.length
      const result = submissionReadOutcome(read)
      assert.deepStrictEqual(result, {
        error: days.includes('9999-12-31')
          ? { name: 'RangeError', message: 'Local day is outside the supported calendar range' }
          : { name: 'TypeError', message: 'Invalid local day' },
      })
      assert.deepStrictEqual(trace.slice(start), [])
      results.push(result)
    }
    return results
  })
})

test('Streak native helper retains ordered range failures, leap/year, DST and skipped-day calendars', () => {
  for (const [later, earlier] of [
    ['2026-03-09', '2026-03-08'],
    ['2026-11-02', '2026-11-01'],
    ['2024-03-01', '2024-02-29'],
    ['2026-01-01', '2025-12-31'],
    ['2011-12-31', '2011-12-30'],
    ['2011-12-31', '2011-12-29'],
    ['9999-12-31', null],
    [null, '9999-12-31'],
  ]) {
    assert.deepStrictEqual(
      submissionReadOutcome(() => dayDiff(later, earlier)),
      submissionReadOutcome(() => invokeOriginalDayDiff(later, earlier)),
    )
  }
  compareNativeStreak(({ db, read, trace, setClock }) => {
    seedNativeStreak(db, '2026-03-09')
    seedNativeStreak(db, '2026-03-08')
    setClock(new Date(2026, 2, 9, 0, 30).getTime())
    const nativeParse = Date.parse
    Date.parse = (value) => {
      trace.push(`parse:${value}`)
      return nativeParse(value)
    }
    try {
      const result = read()
      assert.deepStrictEqual(result, { current: 2, longest: 2 })
      const pair = ['parse:2026-03-09T00:00:00Z', 'parse:2026-03-08T00:00:00Z']
      assert.deepStrictEqual(trace, [...pair, 'clock', ...pair])
      setClock(NaN)
      assert.deepStrictEqual(submissionReadOutcome(read), {
        error: { name: 'TypeError', message: 'Timestamp must be integer milliseconds' },
      })
      return result
    } finally {
      Date.parse = nativeParse
    }
  })
})

test('Streak native read-only, savepoint, rollback, current-handle and prepare errors preserve ownership', () => {
  compareNativeStreak(({ db, read, trace, failClock }) => {
    seedNativeStreak(db, '2026-11-20')
    db.pragma('query_only = ON')
    const initial = read()
    assert.deepStrictEqual(initial, { current: 1, longest: 1 })
    db.pragma('query_only = OFF')
    assert.throws(
      () =>
        db.transaction(() => {
          seedNativeStreak(db, '2026-11-19')
          assert.deepStrictEqual(read(), { current: 2, longest: 2 })
          assert.strictEqual(db.inTransaction, true)
          assert.throws(
            () =>
              db.transaction(() => {
                seedNativeStreak(db, '2026-11-18')
                assert.deepStrictEqual(read(), { current: 3, longest: 3 })
                throw new Error('streak nested rollback')
              })(),
            /streak nested rollback/,
          )
          assert.deepStrictEqual(read(), { current: 2, longest: 2 })
          throw new Error('streak outer rollback')
        })(),
      /streak outer rollback/,
    )
    assert.strictEqual(db.inTransaction, false)
    assert.deepStrictEqual(read(), initial)
    closeDb()
    const closedStart = trace.length
    const closed = submissionReadOutcome(read)
    assert.deepStrictEqual(closed, {
      error: { name: 'Error', message: 'Database not initialized. Call initDb() first.' },
    })
    assert.deepStrictEqual(trace.slice(closedStart), [])
    const next = initDbAtPath(':memory:')
    seedNativeStreak(next, null)
    next.pragma('query_only = ON')
    assert.deepStrictEqual(read(), { current: 0, longest: 1 })
    next.pragma('query_only = OFF')
    next.exec('ALTER TABLE user_daily_stats RENAME COLUMN active_seconds TO damaged_column')
    failClock(new Error('prepare must win'))
    const tracking = traceNativeDaily(next, trace)
    const start = trace.length
    let caught: unknown
    try {
      read()
    } catch (error) {
      caught = error
    } finally {
      tracking.restore()
    }
    assert.strictEqual(caught, tracking.failure())
    assert.ok(caught instanceof Error && 'code' in caught)
    assert.strictEqual(caught.name, 'SqliteError')
    assert.strictEqual(caught.code, 'SQLITE_ERROR')
    assert.match(caught.message, /^no such column: .*active_seconds/)
    assert.deepStrictEqual(trace.slice(start), ['prepare:daily'])
    return { initial, closed, failure: { name: caught.name, code: caught.code } }
  })
})

type NativeInsightReads = {
  timeline: typeof getTimeline
  revisit: typeof getRevisitStats
  wrong: typeof getWrongProblems
  unreviewed: typeof getUnreviewedProblems
}
const nativeInsightQueries = ['timeline', 'revisit', 'wrong', 'unreviewed'] as const

function nativeInsightLimit(
  reads: NativeInsightReads,
  query: (typeof nativeInsightQueries)[number],
  limit?: number,
) {
  return query === 'unreviewed' ? reads.unreviewed(undefined, limit) : reads[query](limit)
}

function compareNativeInsights(
  run: (scenario: {
    db: Database.Database
    reads: NativeInsightReads
    trace: string[]
    setClocks: (...values: number[]) => void
  }) => unknown,
) {
  const originalNow = Date.now
  const results = []
  try {
    for (const original of [true, false]) {
      const now = new Date(2026, 10, 20, 0, 30, 0, 123).getTime()
      Date.now = () => now
      closeDb()
      const db = initDbAtPath(':memory:')
      const events: DataChangedPayload[] = [],
        trace: string[] = []
      const unsubscribe = subscribeDataChanges((event) => events.push(event))
      let clocks = [now]
      Date.now = () => {
        trace.push('clock')
        return clocks.length > 1 ? clocks.splice(0, 1)[0] : clocks[0]
      }
      function checked<T>(read: () => T): T {
        let current: Database.Database | undefined
        try {
          current = getDb()
        } catch {
          /* Closed access is also compared. */
        }
        const before = current?.open ? nativeStatsSnapshot(current) : undefined
        try {
          return read()
        } finally {
          if (before && current) assert.deepStrictEqual(nativeStatsSnapshot(current), before)
          assert.deepStrictEqual(events, [])
        }
      }
      const reads: NativeInsightReads = {
        timeline: (limit) =>
          checked(() => (original ? getOriginalTimeline(getDb(), limit) : getTimeline(limit))),
        revisit: (limit) =>
          checked(() =>
            original ? getOriginalRevisitStats(getDb(), limit) : getRevisitStats(limit),
          ),
        wrong: (limit) =>
          checked(() =>
            original ? getOriginalWrongProblems(getDb(), limit) : getWrongProblems(limit),
          ),
        unreviewed: (days, limit) =>
          checked(() =>
            original
              ? getOriginalUnreviewedProblems(getDb(), days, limit)
              : getUnreviewedProblems(days, limit),
          ),
      }
      try {
        const result = run({
          db,
          reads,
          trace,
          setClocks: (...values) => {
            clocks = values
          },
        })
        // Each read keeps all ledger fields; only independent setup clocks differ here.
        results.push({ result, trace, state: nativeStatsSnapshot(getDb(), true), events })
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

function seedNativeInsightSubmission(
  db: Database.Database,
  parent: string | null,
  id: string | null,
  key: string,
  verdict = 'WA',
  time: number | string = 0,
  deleted: number | null = null,
) {
  db.prepare(
    `INSERT INTO submissions(id,problem_id,platform,platform_submission_id,verdict,submitted_at,created_at,updated_at,deleted_at)
    VALUES (?,?,'test',?,?,?,0,0,?)`,
  ).run(id, parent, key, verdict, time, deleted)
}

function seedNativeInsightLists(db: Database.Database, count = 3) {
  for (let i = 0; i < count; i++) {
    const id = `insight-${i}`
    seedNativeStatsProblem(db, id)
    db.prepare('UPDATE problems SET last_visited_at=? WHERE id=?').run(i, id)
    seedNativeStatsVisit(db, id, 0, 0, `${id}-v1`)
    seedNativeStatsVisit(db, id, 0, 0, `${id}-v2`, 0)
    seedNativeInsightSubmission(db, id, `${id}-s`, id, 'WA', i + 0.75)
    seedNativeStatsEvent(db, i, `${id}-event`, 0)
  }
}

function traceNativeInsights(db: Database.Database, trace: string[]) {
  const descriptor = Object.getOwnPropertyDescriptor(db, 'prepare'),
    prepare = db.prepare.bind(db)
  let nativeError: unknown
  Object.defineProperty(db, 'prepare', {
    configurable: true,
    value: (query: string) => {
      if (!/order by/i.test(query) || !/limit/i.test(query)) return prepare(query)
      trace.push('prepare')
      try {
        const statement = prepare(query),
          all = statement.all.bind(statement)
        Object.defineProperty(statement, 'all', {
          configurable: true,
          value: (...bindings: unknown[]) => {
            trace.push(
              `all:[${bindings.map((value) => (typeof value === 'number' ? (Object.is(value, -0) ? '-0' : String(value)) : JSON.stringify(value))).join(',')}]`,
            )
            try {
              return all(...bindings)
            } catch (error) {
              nativeError = error
              throw error
            }
          },
        })
        return statement
      } catch (error) {
        nativeError = error
        throw error
      }
    },
  })
  return {
    error: () => nativeError,
    restore: () => {
      if (descriptor) Object.defineProperty(db, 'prepare', descriptor)
      else Reflect.deleteProperty(db, 'prepare')
    },
  }
}

test('Insight native lists preserve NULL IDs, COUNT child IDs, raw MAX and tombstoned anti-AC', () => {
  compareNativeInsights(({ db, reads }) => {
    seedNativeInsightLists(db, 1)
    for (const key of ['null-a', 'null-b']) {
      seedNativeStatsProblem(db, null, 'test', key)
      seedNativeStatsEvent(db, 99.75, null, 0)
    }
    db.exec('UPDATE problems SET last_visited_at=0 WHERE id IS NULL')
    seedNativeStatsVisit(db, 'insight-0', 0, 0, null, 0)
    db.exec('UPDATE problem_visits SET entered_at=99.75 WHERE id IS NULL')
    seedNativeStatsProblem(db, 'one-visit')
    seedNativeStatsVisit(db, 'one-visit', 0, 0, 'only')
    seedNativeStatsVisit(db, 'one-visit', 0, 0, null)
    seedNativeStatsProblem(db, 'anonymous-submission')
    seedNativeInsightSubmission(db, 'anonymous-submission', null, 'null-wa', 'TESTING', 50.25, 0)
    seedNativeStatsProblem(db, 'accepted')
    seedNativeInsightSubmission(db, 'accepted', 'wa', 'accepted-wa', 'WA', 100)
    seedNativeInsightSubmission(db, 'accepted', null, 'accepted-ac', 'AC', 0, 0)
    seedNativeInsightSubmission(db, 'insight-0', 'lowercase', 'lowercase', 'ac', 3.25)
    const result = {
      timeline: reads.timeline(-1),
      revisit: reads.revisit(-1),
      wrong: reads.wrong(-1),
      unreviewed: reads.unreviewed(),
    }
    assert.strictEqual(result.timeline.filter((row) => row.id === null).length, 2)
    for (const row of result.timeline)
      assert.deepStrictEqual(Object.keys(row), [
        'id',
        'event_type',
        'occurred_at',
        'platform',
        'url',
        'problem_id',
      ])
    assert.deepStrictEqual(
      result.revisit.map((row) => [row.problem_id, row.visit_count, row.last_visit]),
      [['insight-0', 2, 99.75]],
    )
    assert.deepStrictEqual(
      result.wrong.map((row) => [row.id, row.wrong_count, row.last_attempt]),
      [
        ['anonymous-submission', 0, 50.25],
        ['insight-0', 2, 3.25],
      ],
    )
    assert.strictEqual(result.unreviewed.filter((row) => row.id === null).length, 2)
    return result
  })
})

test('Insight native LIMIT bindings preserve negative, NaN, fractional, infinite and default boundaries', () => {
  compareNativeInsights(({ db, reads, trace }) => {
    seedNativeInsightLists(db, 55)
    const tracking = traceNativeInsights(db, trace),
      results = []
    try {
      for (const query of nativeInsightQueries) {
        for (const limit of [
          undefined,
          0,
          -0,
          1,
          50,
          -1,
          -5,
          1.25,
          -1.25,
          NaN,
          Infinity,
          -Infinity,
          Number.MAX_SAFE_INTEGER,
          Number.MAX_SAFE_INTEGER + 1,
        ]) {
          const result = submissionReadOutcome(() => nativeInsightLimit(reads, query, limit))
          const effective = limit === undefined ? 50 : limit
          if (Number.isFinite(effective) && Number.isInteger(effective)) {
            assert.ok(
              'rows' in result && Array.isArray(result.rows),
              `${query} LIMIT ${String(limit)}: ${JSON.stringify(result)}`,
            )
            const expectedLength =
              effective === 0 ? 0 : effective < 0 ? 55 : Math.min(effective, 55)
            assert.strictEqual(result.rows.length, expectedLength)
          } else
            assert.deepStrictEqual(result, {
              error: { name: 'SqliteError', message: 'datatype mismatch', code: 'SQLITE_MISMATCH' },
            })
          results.push(result)
        }
      }
      let caught: unknown
      try {
        reads.timeline(NaN)
      } catch (error) {
        caught = error
      }
      assert.strictEqual(caught, tracking.error())
      assert.ok(trace.includes('all:[NaN]'))
      assert.ok(trace.includes('all:[-0]'))
      return results
    } finally {
      tracking.restore()
    }
  })
})

test('Insight native unreviewed preserves prepare/two-clock/bind order and strict midnight cutoff', () => {
  compareNativeInsights(({ db, reads, trace, setClocks }) => {
    seedNativeStatsProblem(db, null, 'test', 'included')
    seedNativeStatsProblem(db, 'boundary')
    const first = new Date(2026, 10, 20, 23, 59, 59, 999).getTime(),
      second = new Date(2026, 10, 21, 0).getTime()
    const cutoff = new Date(2026, 10, 20, 0).getTime()
    db.prepare('UPDATE problems SET last_visited_at=? WHERE id IS NULL').run(
      new Date(2026, 10, 19, 0).getTime(),
    )
    db.prepare('UPDATE problems SET last_visited_at=? WHERE id=?').run(cutoff, 'boundary')
    setClocks(first, second)
    const tracking = traceNativeInsights(db, trace),
      results = []
    try {
      const rows = reads.unreviewed(1, -1)
      assert.deepStrictEqual(
        rows.map((row) => [row.id, row.days_since]),
        [[null, 1]],
      )
      assert.deepStrictEqual(trace, ['prepare', 'clock', 'clock', `all:[${first},${cutoff},-1]`])
      results.push(rows)
      for (const days of [0, -0, -1, 0.5, NaN, Infinity, -Infinity]) {
        const start = trace.length,
          result = submissionReadOutcome(() => reads.unreviewed(days))
        assert.deepStrictEqual(trace.slice(start, start + 3), ['prepare', 'clock', 'clock'])
        if (!Number.isInteger(days))
          assert.deepStrictEqual(result, {
            error: { name: 'TypeError', message: 'Day shift must be an integer' },
          })
        results.push(result)
      }
      return results
    } finally {
      tracking.restore()
    }
  })
})

test('Insight native reads preserve query-only, savepoints, full ledger and current-handle errors', () => {
  compareNativeInsights(({ db, reads, trace }) => {
    seedNativeInsightLists(db, 1)
    db.pragma('query_only = ON')
    const initial = nativeInsightQueries.map((query) => nativeInsightLimit(reads, query))
    db.pragma('query_only = OFF')
    assert.throws(
      () =>
        db.transaction(() => {
          seedNativeStatsEvent(db, 99, null)
          assert.strictEqual(reads.timeline().length, 2)
          assert.throws(
            () =>
              db.transaction(() => {
                seedNativeStatsProblem(db, null)
                db.exec('UPDATE problems SET last_visited_at=0 WHERE id IS NULL')
                assert.strictEqual(reads.unreviewed().length, 2)
                throw new Error('insight nested rollback')
              })(),
            /insight nested rollback/,
          )
          assert.strictEqual(reads.unreviewed().length, 1)
          throw new Error('insight outer rollback')
        })(),
      /insight outer rollback/,
    )
    assert.deepStrictEqual(
      nativeInsightQueries.map((query) => nativeInsightLimit(reads, query)),
      initial,
    )
    closeDb()
    const start = trace.length
    const errors = nativeInsightQueries.map((query) =>
      submissionReadOutcome(() => nativeInsightLimit(reads, query)),
    )
    for (const result of errors)
      assert.deepStrictEqual(result, {
        error: { name: 'Error', message: 'Database not initialized. Call initDb() first.' },
      })
    assert.deepStrictEqual(trace.slice(start), [])
    const next = initDbAtPath(':memory:')
    seedNativeStatsEvent(next, 0, null)
    assert.deepStrictEqual(
      reads.timeline().map((row) => row.id),
      [null],
    )
    const tracking = traceNativeInsights(next, trace),
      errorStart = trace.length
    next.pragma('foreign_keys = OFF')
    next.exec('DROP TABLE problems')
    let caught: unknown
    try {
      reads.unreviewed(1.25)
    } catch (error) {
      caught = error
    } finally {
      tracking.restore()
    }
    assert.strictEqual(caught, tracking.error())
    assert.ok(caught instanceof Error && 'code' in caught)
    assert.strictEqual(caught.code, 'SQLITE_ERROR')
    assert.match(caught.message, /^no such table:/)
    assert.deepStrictEqual(trace.slice(errorStart), ['prepare'])
    return { initial, errors }
  })
})

const NATIVE_RECOMPUTE_DAY = '2026-03-08'
const NATIVE_RECOMPUTE_NEXT = '2026-03-09'
const NATIVE_RECOMPUTE_NOW = 1768443630123

type NativeRecompute = {
  db: Database.Database
  daily: typeof recomputeDailyStats
  selected: typeof recomputeDailyStatsForDates
  all: typeof recomputeAllDailyStats
  at: typeof runtimeRecomputeDailyStatsAt
  allAt: typeof runtimeRecomputeAllDailyStatsAt
  events: DataChangedPayload[]
  trace: string[]
  clocks: (...values: number[]) => void
}

function recomputeLedger(db: Database.Database) {
  return [
    db.prepare('SELECT * FROM schema_migrations ORDER BY rowid').all(),
    db.prepare('SELECT * FROM __drizzle_migrations ORDER BY rowid').all(),
  ]
}
function compareNativeRecompute(run: (context: NativeRecompute) => unknown) {
  const results = [],
    originalNow = Date.now
  try {
    for (const original of [true, false]) {
      Date.now = () => NATIVE_RECOMPUTE_NOW
      closeDb()
      const db = initDbAtPath(':memory:')
      applyDrizzleMigrations(
        db,
        loadMigrationResources(path.resolve('drizzle')),
        getKnownMigrations(),
      )
      const ledger = recomputeLedger(db)
      const events: DataChangedPayload[] = [],
        trace: string[] = []
      let clocks = [NATIVE_RECOMPUTE_NOW]
      Date.now = () => {
        trace.push('clock')
        const now = clocks.length > 1 ? clocks.shift() : clocks[0]
        assert.notStrictEqual(now, undefined)
        return now ?? NATIVE_RECOMPUTE_NOW
      }
      const unsubscribe = subscribeDataChanges((event) => {
        events.push(event)
        trace.push(`event:${getDb().inTransaction}`)
      })
      try {
        const result = run({
          db,
          events,
          trace,
          clocks: (...values) => {
            clocks = values
          },
          daily: original ? originalRecomputeDailyStats : recomputeDailyStats,
          selected: original ? originalRecomputeDailyStatsForDates : recomputeDailyStatsForDates,
          all: original ? originalRecomputeAllDailyStats : recomputeAllDailyStats,
          at: original ? originalRecomputeDailyStatsAt : runtimeRecomputeDailyStatsAt,
          allAt: original ? originalRecomputeAllDailyStatsAt : runtimeRecomputeAllDailyStatsAt,
        })
        if (db.open) assert.deepStrictEqual(recomputeLedger(db), ledger)
        // Preserve full ledgers during each operation; only independent setup clocks are excluded.
        results.push({ result, events, trace, state: nativeStatsSnapshot(getDb(), true) })
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
function seedNativeRecomputeCache(
  db: Database.Database,
  day: string | null = NATIVE_RECOMPUTE_DAY,
) {
  db.prepare(
    `INSERT INTO user_daily_stats(local_day,active_seconds,duration_seconds,created_at,updated_at,deleted_at)
    VALUES (?,91,92,2,3,0)`,
  ).run(day)
}
function nativeRecomputeRows(db: Database.Database) {
  return db.prepare('SELECT * FROM user_daily_stats ORDER BY rowid').all()
}
function traceNativeRecompute(
  db: Database.Database,
  trace: string[],
  failPrepare = 0,
  failure = new Error('native prepare sentinel'),
) {
  const prepare = db.prepare.bind(db),
    stringify = JSON.stringify
  const descriptor = Object.getOwnPropertyDescriptor(db, 'prepare')
  const queries: string[] = [],
    bindings: unknown[][] = []
  let nativeError: unknown
  Object.defineProperty(db, 'prepare', {
    configurable: true,
    value: (query: string) => {
      queries.push(query)
      const normalized = query.toLowerCase().replaceAll('"', '')
      const kind = normalized.startsWith('insert')
        ? 'write'
        : normalized.includes('union')
          ? 'facts'
          : normalized.includes('group by')
            ? 'platforms'
            : normalized.includes('from user_daily_stats')
              ? 'cache'
              : normalized.includes('from problem_visits')
                ? 'visits'
                : normalized.includes('from submissions')
                  ? 'submissions'
                  : 'solved'
      trace.push(`prepare:${kind}`)
      if (queries.length === failPrepare) throw failure
      let statement: Database.Statement
      try {
        statement = prepare(query)
      } catch (error) {
        nativeError = error
        throw error
      }
      for (const method of ['get', 'all', 'run'] as const) {
        const native = statement[method].bind(statement)
        Object.defineProperty(statement, method, {
          configurable: true,
          value: (...values: unknown[]) => {
            trace.push(
              `${method}:${kind}:${stringify(values, (_key, value: unknown) => (typeof value === 'bigint' ? `${value}n` : value))}`,
            )
            bindings.push(values)
            try {
              return native(...values)
            } catch (error) {
              nativeError = error
              throw error
            }
          },
        })
      }
      return statement
    },
  })
  return {
    queries,
    bindings,
    error: () => nativeError,
    restore: () => {
      if (descriptor) Object.defineProperty(db, 'prepare', descriptor)
      else Reflect.deleteProperty(db, 'prepare')
    },
  }
}

test('Recompute native safe-integer handles retain BigInt counts and late JSON failure', () => {
  for (const nonempty of [false, true])
    compareNativeRecompute(({ db, at, trace }) => {
      if (nonempty) {
        seedNativeStatsProblem(db, 'safe-integer')
        seedNativeStatsVisit(db, 'safe-integer', 1, 1)
        db.prepare('UPDATE problem_visits SET entered_at=?').run(
          localDayBounds(NATIVE_RECOMPUTE_DAY).start,
        )
      }
      db.defaultSafeIntegers(true)
      const tracking = traceNativeRecompute(db, trace)
      let result
      try {
        result = submissionReadOutcome(() => at(db, NATIVE_RECOMPUTE_DAY, NATIVE_RECOMPUTE_NOW))
      } finally {
        tracking.restore()
        db.defaultSafeIntegers(false)
      }
      assert.strictEqual(tracking.queries.length, 5)
      if (nonempty) {
        assert.deepStrictEqual(result, {
          error: { name: 'TypeError', message: 'Do not know how to serialize a BigInt' },
        })
        assert.deepStrictEqual(nativeRecomputeRows(db), [])
      } else {
        assert.deepStrictEqual(tracking.bindings[4], [
          NATIVE_RECOMPUTE_DAY,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          null,
          NATIVE_RECOMPUTE_NOW,
          NATIVE_RECOMPUTE_NOW,
          NATIVE_RECOMPUTE_NOW,
        ])
        assert.deepStrictEqual(result, { rows: undefined })
      }
      return result
    })
})

test('Recompute native aggregates preserve raw metrics, exact eleven binds and cache metadata', () => {
  for (const now of [0, 1.75, 8640000000000001])
    compareNativeRecompute(({ db, at, events, trace }) => {
      const { start, end } = localDayBounds(NATIVE_RECOMPUTE_DAY)
      db.pragma('foreign_keys=OFF')
      seedNativeStatsProblem(db, 'p')
      seedNativeStatsProblem(db, '')
      seedNativeStatsProblem(db, null)
      seedNativeStatsProblem(db, 'deleted', 'test', 'deleted', 0)
      db.prepare('UPDATE problems SET first_solved_at=?').run(start)
      seedNativeStatsVisit(db, 'p', null, null, null, 0)
      seedNativeStatsVisit(db, '', 1.25, -2.5, 'fraction')
      seedNativeStatsVisit(db, 'orphan', -3, 'text', 'text')
      db.prepare('UPDATE problem_visits SET entered_at=?').run(start)
      db.exec(`INSERT INTO submissions (id,problem_id,platform,platform_submission_id,verdict,submitted_at,created_at,updated_at,deleted_at)
      VALUES (NULL,NULL,'test','null','AC',${start},0,0,0),('s','p','test','s','ac',${end - 1},0,0,NULL),('out','p','test','out','AC',${end},0,0,NULL)`)
      const tracking = traceNativeRecompute(db, trace)
      try {
        at(db, NATIVE_RECOMPUTE_DAY, now)
      } finally {
        tracking.restore()
      }
      assert.deepStrictEqual(tracking.bindings, [
        ...Array.from({ length: 4 }, () => [start, end]),
        [
          NATIVE_RECOMPUTE_DAY,
          -2.5,
          -1.75,
          3,
          3,
          2,
          1,
          '[{"platform":"test","count":3}]',
          now,
          now,
          now,
        ],
      ])
      const fresh = db
        .prepare('SELECT created_at,updated_at,recomputed_at,deleted_at FROM user_daily_stats')
        .get()
      assert.deepStrictEqual(fresh, {
        created_at: now,
        updated_at: now,
        recomputed_at: now,
        deleted_at: null,
      })
      db.exec('UPDATE user_daily_stats SET created_at=3.5,deleted_at=0')
      at(db, NATIVE_RECOMPUTE_DAY, now)
      assert.deepStrictEqual(
        db.prepare('SELECT created_at,deleted_at FROM user_daily_stats').get(),
        { created_at: 3.5, deleted_at: 0 },
      )
      assert.deepStrictEqual(events, [])
      return db
        .prepare(
          'SELECT typeof(active_seconds) AS active,typeof(duration_seconds) AS duration,typeof(recomputed_at) AS clock FROM user_daily_stats',
        )
        .get()
    })
})

test('Recompute native UPSERT preserves all nine UPDATE OF targets and fresh/conflict trigger effects', () => {
  compareNativeRecompute(({ db, daily, events }) => {
    seedNativeRecomputeCache(db)
    db.exec('CREATE TABLE recompute_update_audit (name TEXT)')
    const targets = [
      'active_seconds',
      'duration_seconds',
      'visited_problem_count',
      'solved_problem_count',
      'submission_count',
      'ac_submission_count',
      'platform_distribution_json',
      'recomputed_at',
      'updated_at',
    ]
    for (const name of [...targets, 'created_at', 'deleted_at', 'local_day'])
      db.exec(
        `CREATE TRIGGER recompute_${name} AFTER UPDATE OF ${name} ON user_daily_stats BEGIN INSERT INTO recompute_update_audit VALUES ('${name}'); END;`,
      )
    daily(NATIVE_RECOMPUTE_DAY)
    assert.deepStrictEqual(
      db.prepare('SELECT name FROM recompute_update_audit ORDER BY name').all(),
      targets.sort().map((name) => ({ name })),
    )
    assert.deepStrictEqual(events, [{ tables: ['stats'] }])
  })
  for (const conflict of [false, true])
    for (const mode of ['IGNORE', 'FAIL', 'ABORT'])
      compareNativeRecompute(({ db, daily, events }) => {
        if (conflict) seedNativeRecomputeCache(db)
        db.exec(`CREATE TABLE recompute_trigger_audit (phase TEXT);
      CREATE TRIGGER recompute_reject BEFORE ${conflict ? 'UPDATE' : 'INSERT'} ON user_daily_stats BEGIN
        INSERT INTO recompute_trigger_audit VALUES ('before');
        SELECT RAISE(${mode}${mode === 'IGNORE' ? '' : ",'recompute rejected'"});
      END;`)
        const result = submissionReadOutcome(() => daily(NATIVE_RECOMPUTE_DAY))
        assert.deepStrictEqual(events, mode === 'IGNORE' ? [{ tables: ['stats'] }] : [])
        assert.deepStrictEqual(
          db.prepare('SELECT * FROM recompute_trigger_audit').all(),
          mode === 'ABORT' ? [] : [{ phase: 'before' }],
        )
        assert.strictEqual(nativeRecomputeRows(db).length, conflict ? 1 : 0)
        return result
      })
})

test('Recompute native overflow precedes broken INSERT and serialization follows native preparation', () => {
  compareNativeRecompute(({ db, daily, trace, events }) => {
    seedNativeStatsProblem(db, 'p')
    seedNativeStatsVisit(db, 'p', 0, 0, 'a')
    seedNativeStatsVisit(db, 'p', 0, 0, 'b')
    db.prepare('UPDATE problem_visits SET entered_at=?').run(
      localDayBounds(NATIVE_RECOMPUTE_DAY).start,
    )
    db.exec(
      "UPDATE problem_visits SET duration_seconds=CASE id WHEN 'a' THEN 9223372036854775807 ELSE 1 END; DROP TABLE user_daily_stats",
    )
    assert.deepStrictEqual(
      db.prepare('SELECT typeof(duration_seconds) AS type FROM problem_visits').all(),
      [{ type: 'integer' }, { type: 'integer' }],
    )
    const tracking = traceNativeRecompute(db, trace)
    let caught: unknown
    try {
      daily(NATIVE_RECOMPUTE_DAY)
    } catch (error) {
      caught = error
    } finally {
      tracking.restore()
    }
    assert.strictEqual(caught, tracking.error())
    assert.ok(caught instanceof Error && 'code' in caught)
    assert.deepStrictEqual(
      { name: caught.name, message: caught.message, code: caught.code },
      { name: 'SqliteError', message: 'integer overflow', code: 'SQLITE_ERROR' },
    )
    assert.strictEqual(tracking.queries.length, 1)
    assert.deepStrictEqual(events, [])
  })
  for (const broken of [false, true])
    compareNativeRecompute(({ db, daily, trace }) => {
      seedNativeStatsProblem(db, 'p')
      seedNativeStatsVisit(db, 'p', 0, 0)
      db.prepare('UPDATE problem_visits SET entered_at=?').run(
        localDayBounds(NATIVE_RECOMPUTE_DAY).start,
      )
      if (broken) db.exec('DROP TABLE user_daily_stats')
      const tracking = traceNativeRecompute(db, trace),
        stringify = JSON.stringify,
        sentinel = new Error('native serialization sentinel')
      JSON.stringify = (value: unknown) => {
        if (Array.isArray(value)) {
          trace.push('json')
          throw sentinel
        }
        return stringify(value)
      }
      let caught: unknown
      try {
        daily(NATIVE_RECOMPUTE_DAY)
      } catch (error) {
        caught = error
      } finally {
        JSON.stringify = stringify
        tracking.restore()
      }
      assert.strictEqual(caught, broken ? tracking.error() : sentinel)
      assert.deepStrictEqual(trace.slice(-1), broken ? ['prepare:write'] : ['json'])
      assert.strictEqual(tracking.queries.length, 5)
    })
  for (const step of [1, 2, 3, 4, 5])
    compareNativeRecompute(({ db, daily, trace, events }) => {
      const sentinel = new Error('native prepare sentinel'),
        tracking = traceNativeRecompute(db, trace, step, sentinel)
      let caught: unknown
      try {
        daily(NATIVE_RECOMPUTE_DAY)
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      assert.strictEqual(caught, sentinel)
      assert.strictEqual(tracking.queries.length, step)
      assert.deepStrictEqual(events, [])
    })
})

test('Recompute native all-days materializes UNION and preserves NULL/invalid fact failure stages', () => {
  compareNativeRecompute(({ db, all, trace, events }) => {
    const instant = localDayBounds(NATIVE_RECOMPUTE_DAY).start
    seedNativeRecomputeCache(db, NATIVE_RECOMPUTE_NEXT)
    seedNativeRecomputeCache(db)
    seedNativeStatsProblem(db, 'p')
    seedNativeStatsVisit(db, 'p', 0, 0)
    db.prepare('UPDATE problems SET first_solved_at=?').run(instant)
    db.prepare('UPDATE problem_visits SET entered_at=?').run(instant)
    seedNativeStatsEvent(db, instant, null, 0)
    db.prepare(
      `INSERT INTO submissions (platform,platform_submission_id,verdict,submitted_at,created_at,updated_at) VALUES ('test','s','AC',?,0,0)`,
    ).run(instant)
    const tracking = traceNativeRecompute(db, trace)
    try {
      assert.strictEqual(all(), 2)
    } finally {
      tracking.restore()
    }
    assert.strictEqual(tracking.queries.filter((q) => /union/i.test(q)).length, 1)
    assert.strictEqual((tracking.queries[1].match(/union/gi) ?? []).length, 3)
    assert.deepStrictEqual(
      tracking.bindings.filter((b) => b.length === 11).map((b) => b[0]),
      [NATIVE_RECOMPUTE_DAY, NATIVE_RECOMPUTE_NEXT],
    )
    assert.deepStrictEqual(events, [{ tables: ['stats'] }])
  })
  for (const reverse of [false, true])
    compareNativeRecompute(({ db, all, events }) => {
      seedNativeRecomputeCache(db, null)
      seedNativeRecomputeCache(db)
      if (reverse) db.pragma('reverse_unordered_selects=ON')
      const result = submissionReadOutcome(all)
      assert.deepStrictEqual(result, { error: { name: 'TypeError', message: 'Invalid local day' } })
      assert.deepStrictEqual(
        db
          .prepare('SELECT updated_at FROM user_daily_stats WHERE local_day=?')
          .get(NATIVE_RECOMPUTE_DAY),
        { updated_at: reverse ? NATIVE_RECOMPUTE_NOW : 3 },
      )
      assert.deepStrictEqual(events, [])
    })
  for (const invalid of [1.75, 'invalid', 9007199254740992, 8640000000000001, 8640000000000000])
    compareNativeRecompute(({ db, all, events, trace }) => {
      seedNativeRecomputeCache(db)
      seedNativeStatsEvent(db, invalid)
      const before = nativeStatsSnapshot(db),
        tracking = traceNativeRecompute(db, trace)
      let result
      try {
        result = submissionReadOutcome(all)
      } finally {
        tracking.restore()
      }
      if (invalid === 8640000000000000)
        assert.deepStrictEqual(db.prepare('SELECT updated_at FROM user_daily_stats').get(), {
          updated_at: NATIVE_RECOMPUTE_NOW,
        })
      else {
        assert.deepStrictEqual(nativeStatsSnapshot(db), before)
        assert.strictEqual(tracking.queries.length, 2)
      }
      assert.deepStrictEqual(events, [])
      return result
    })
})

test('Recompute native wrappers retain midnight clocks, eager iterables and legacy partial notifications', () => {
  compareNativeRecompute(({ db, daily, selected, all, trace, events, clocks }) => {
    assert.strictEqual(all(), 0)
    assert.deepStrictEqual(trace, ['clock'])
    trace.length = 0
    const midnight = localDayBounds(NATIVE_RECOMPUTE_NEXT).start
    clocks(midnight - 1, midnight)
    daily()
    assert.deepStrictEqual(db.prepare('SELECT local_day,created_at FROM user_daily_stats').all(), [
      { local_day: NATIVE_RECOMPUTE_DAY, created_at: midnight },
    ])
    assert.deepStrictEqual(trace, ['clock', 'clock', 'event:false'])
    trace.length = 0
    clocks(NATIVE_RECOMPUTE_NOW)
    const iterable: Iterable<string> = {
      *[Symbol.iterator]() {
        trace.push('start')
        yield NATIVE_RECOMPUTE_NEXT
        yield NATIVE_RECOMPUTE_DAY
        yield NATIVE_RECOMPUTE_NEXT
        trace.push('end')
      },
    }
    assert.strictEqual(selected(iterable), 2)
    assert.deepStrictEqual(trace, ['start', 'end', 'clock', 'event:false', 'clock', 'event:false'])
    const late = submissionReadOutcome(() => selected(['zz-invalid', NATIVE_RECOMPUTE_DAY]))
    assert.strictEqual(events.length, 4)
    closeDb()
    trace.length = 0
    assert.strictEqual(selected([]), 0)
    assert.deepStrictEqual(trace, [])
    const sentinel = new Error('native iterable sentinel'),
      throwing: Iterable<string> = {
        *[Symbol.iterator]() {
          yield NATIVE_RECOMPUTE_DAY
          throw sentinel
        },
      }
    let caught: unknown
    try {
      selected(throwing)
    } catch (error) {
      caught = error
    }
    assert.strictEqual(caught, sentinel)
    assert.deepStrictEqual(trace, [])
    const missing = submissionReadOutcome(() => daily())
    assert.deepStrictEqual(trace, [])
    initDbAtPath(':memory:')
    daily(NATIVE_RECOMPUTE_DAY)
    return { late, missing }
  })
  compareNativeRecompute(({ db, daily, events }) => {
    let reentered = false
    const offThrow = subscribeDataChanges(() => {
      throw new Error('recompute listener sentinel')
    })
    const offReenter = subscribeDataChanges(() => {
      if (!reentered) {
        reentered = true
        daily(NATIVE_RECOMPUTE_NEXT)
      }
    })
    try {
      daily(NATIVE_RECOMPUTE_DAY)
    } finally {
      offThrow()
      offReenter()
    }
    assert.strictEqual(nativeRecomputeRows(db).length, 2)
    assert.deepStrictEqual(events, [{ tables: ['stats'] }, { tables: ['stats'] }])
  })
})

test('Recompute native real COMMIT, rollback, savepoint and deferred FK failure own notification scope', () => {
  for (const mode of ['commit', 'rollback', 'inner-rollback', 'commit-failure'])
    compareNativeRecompute(({ db, daily, events }) => {
      if (mode === 'commit-failure')
        db.exec(`CREATE TRIGGER recompute_deferred_fk AFTER INSERT ON user_daily_stats BEGIN
      INSERT INTO submissions (id,problem_id,platform,platform_submission_id,verdict,submitted_at,created_at,updated_at)
      VALUES (NEW.local_day,'missing-parent','fixture',NEW.local_day,'WA',0,0,0);
    END;`)
      let callbackFinished = false
      const result = submissionReadOutcome(() =>
        withDataChangeTransaction(() =>
          db.transaction(() => {
            if (mode === 'commit-failure') db.pragma('defer_foreign_keys=ON')
            daily(NATIVE_RECOMPUTE_DAY)
            assert.strictEqual(nativeRecomputeRows(db).length, 1)
            assert.deepStrictEqual(events, [])
            const nested = () =>
              withDataChangeTransaction(() =>
                db.transaction(() => {
                  daily(NATIVE_RECOMPUTE_NEXT)
                  if (mode === 'inner-rollback') throw new Error('inner rollback')
                })(),
              )
            if (mode === 'inner-rollback') assert.throws(nested, /inner rollback/)
            else nested()
            assert.deepStrictEqual(events, [])
            if (mode === 'rollback') throw new Error('outer rollback')
            callbackFinished = true
          })(),
        ),
      )
      const committed = mode === 'commit' || mode === 'inner-rollback'
      assert.deepStrictEqual(events, committed ? [{ tables: ['stats'] }] : [])
      assert.strictEqual(
        nativeRecomputeRows(db).length,
        mode === 'commit' ? 2 : mode === 'inner-rollback' ? 1 : 0,
      )
      assert.strictEqual(db.inTransaction, false)
      if (mode === 'commit-failure') {
        assert.strictEqual(callbackFinished, true)
        assert.deepStrictEqual(result, {
          error: {
            name: 'SqliteError',
            message: 'FOREIGN KEY constraint failed',
            code: 'SQLITE_CONSTRAINT_FOREIGNKEY',
          },
        })
        assert.deepStrictEqual(db.prepare('SELECT * FROM submissions').all(), [])
      }
      return { result, callbackFinished }
    })
})

test('Recompute native explicit handles, readonly/query-only errors and calendar boundaries remain independent', () => {
  compareNativeRecompute(({ db, daily, at, events, trace }) => {
    db.pragma('query_only=ON')
    const before = nativeStatsSnapshot(db),
      tracking = traceNativeRecompute(db, trace)
    let caught: unknown
    try {
      daily(NATIVE_RECOMPUTE_DAY)
    } catch (error) {
      caught = error
    } finally {
      tracking.restore()
    }
    assert.strictEqual(caught, tracking.error())
    assert.ok(caught instanceof Error && 'code' in caught)
    assert.strictEqual(caught.code, 'SQLITE_READONLY')
    assert.deepStrictEqual(nativeStatsSnapshot(db), before)
    assert.deepStrictEqual(events, [])
    db.pragma('query_only=OFF')
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-recompute-native-')),
      target = path.join(directory, 'readonly.sqlite')
    const other = new NativeDatabase(':memory:')
    const errors = []
    try {
      for (const { sql } of db
        .prepare<[], { sql: string }>(
          "SELECT sql FROM sqlite_schema WHERE type='table' AND name IN ('problems','problem_visits','submissions','user_daily_stats')",
        )
        .all())
        other.exec(sql)
      at(other, NATIVE_RECOMPUTE_DAY, 1.75)
      assert.strictEqual(nativeRecomputeRows(other).length, 1)
      assert.strictEqual(nativeRecomputeRows(db).length, 0)
      db.prepare('VACUUM INTO ?').run(target)
      const readonly = new NativeDatabase(target, { readonly: true })
      try {
        errors.push(submissionReadOutcome(() => at(readonly, NATIVE_RECOMPUTE_DAY, 0)))
      } finally {
        readonly.close()
      }
      errors.push(submissionReadOutcome(() => at(readonly, NATIVE_RECOMPUTE_DAY, 0)))
    } finally {
      other.close()
      assert.ok(
        path
          .resolve(directory)
          .startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-recompute-native-`),
      )
      fs.rmSync(directory, { recursive: true, force: true })
    }
    for (const day of ['2026-03-08', '2026-11-01', '2024-02-29', '2025-12-31']) {
      const { start, end } = localDayBounds(day)
      seedNativeStatsProblem(db, day)
      for (const [index, instant] of [start - 1, start, end - 1, end].entries()) {
        const id = `${day}:${index}`
        seedNativeStatsVisit(db, day, 10, 2, id)
        db.prepare('UPDATE problem_visits SET entered_at=? WHERE id=?').run(instant, id)
      }
      at(db, day, NATIVE_RECOMPUTE_NOW)
      assert.deepStrictEqual(
        db
          .prepare('SELECT duration_seconds,active_seconds FROM user_daily_stats WHERE local_day=?')
          .get(day),
        { duration_seconds: 20, active_seconds: 4 },
      )
    }
    return errors
  })
})

function seedNativeNotePath(db: Database.Database, id: string | null, filePath: unknown) {
  db.prepare(
    `INSERT INTO notes(id,title,file_path,created_at,updated_at,deleted_at)
    VALUES (?,'Synthetic note',?,0,1.75,0)`,
  ).run(id, filePath)
}

function traceNativeNotePath(
  db: Database.Database,
  failure?: { stage: 'prepare' | 'get'; value: unknown },
) {
  const descriptor = Object.getOwnPropertyDescriptor(db, 'prepare')
  const prepare = db.prepare.bind(db)
  const queries: string[] = []
  const bindings: unknown[][] = []
  const stages: string[] = []
  let thrown: unknown
  Object.defineProperty(db, 'prepare', {
    configurable: true,
    value: (query: string) => {
      queries.push(query)
      stages.push('prepare')
      if (failure?.stage === 'prepare') {
        thrown = failure.value
        throw thrown
      }
      try {
        const statement = prepare(query)
        const get = statement.get.bind(statement)
        Object.defineProperty(statement, 'get', {
          configurable: true,
          value: (...values: unknown[]) => {
            bindings.push(values)
            stages.push('get')
            if (failure?.stage === 'get') {
              thrown = failure.value
              throw thrown
            }
            try {
              return get(...values)
            } catch (error) {
              thrown = error
              throw error
            }
          },
        })
        return statement
      } catch (error) {
        thrown = error
        throw error
      }
    },
  })
  return {
    queries,
    bindings,
    stages,
    error: () => thrown,
    restore: () => {
      if (descriptor) Object.defineProperty(db, 'prepare', descriptor)
      else Reflect.deleteProperty(db, 'prepare')
    },
  }
}

test('Notes native file-path reads preserve one-field one-bind equality and raw empty/NUL/surrogate paths', () => {
  const db = getDbForTest()
  const events: DataChangedPayload[] = []
  const off = subscribeDataChanges((event) => events.push(event))
  try {
    for (const [index, id] of [
      '',
      'Case',
      'case',
      ' spaced ',
      "' OR 1=1 --",
      '%_\\',
      '\u4e2d\u6587',
      'emoji-\ud83d\ude00',
      'with\0nul',
      '\ud800',
      'x'.repeat(201),
    ].entries()) {
      const rawPath = ['', ' raw/path ', 'path\0tail', '\ud800', '\u4e2d\u6587/\ud83d\ude00'][
        index % 5
      ]
      seedNativeNotePath(db, id, rawPath)
      const expected = oldFindNoteFilePath(db, id)
      const before = nativeStatsSnapshot(db)
      const tracking = traceNativeNotePath(db)
      let actual
      try {
        actual = findNoteFilePath(db, id)
        assert.deepStrictEqual(tracking.stages, ['prepare', 'get'])
        assert.deepStrictEqual(tracking.bindings, [[id]])
        assert.strictEqual(tracking.queries.length, 1)
        assert.strictEqual(
          tracking.queries[0],
          'select "file_path" from "notes" where "notes"."id" = ?',
        )
      } finally {
        tracking.restore()
      }
      assert.deepStrictEqual(actual, expected)
      assert.deepStrictEqual(Object.keys(actual ?? {}), ['file_path'])
      assert.deepStrictEqual(nativeStatsSnapshot(db), before)
    }
    seedNativeNotePath(db, null, 'anonymous1')
    seedNativeNotePath(db, null, 'anonymous2')
    seedNativeNotePath(db, 'blob-path', Buffer.from([0, 128, 255]))
    for (const id of [null, 'missing', 'blob-path']) {
      const expected = Reflect.apply(oldFindNoteFilePath, undefined, [db, id])
      const before = nativeStatsSnapshot(db)
      const tracking = traceNativeNotePath(db)
      let actual
      try {
        actual = Reflect.apply(findNoteFilePath, undefined, [db, id])
        assert.deepStrictEqual(tracking.bindings, [[id]])
        assert.deepStrictEqual(tracking.stages, ['prepare', 'get'])
      } finally {
        tracking.restore()
      }
      assert.deepStrictEqual(actual, expected)
      assert.deepStrictEqual(nativeStatsSnapshot(db), before)
    }
    assert.deepStrictEqual(events, [])
  } finally {
    off()
  }
})

test('Notes native query-only and readonly reads use explicit handles without global initialization or caching', () => {
  const db = getDbForTest()
  seedNativeNotePath(db, 'note', 'original/path')
  db.pragma('query_only=ON')
  const before = nativeStatsSnapshot(db)
  assert.deepStrictEqual(findNoteFilePath(db, 'note'), oldFindNoteFilePath(db, 'note'))
  assert.deepStrictEqual(nativeStatsSnapshot(db), before)
  db.pragma('query_only=OFF')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-notes-native-'))
  const target = path.join(directory, 'readonly.sqlite')
  db.prepare('VACUUM INTO ?').run(target)
  const readonly = new NativeDatabase(target, { readonly: true })
  const other = new NativeDatabase(':memory:')
  try {
    assert.strictEqual(readonly.readonly, true)
    assert.deepStrictEqual(findNoteFilePath(readonly, 'note'), { file_path: 'original/path' })
    const definition = db
      .prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE name='notes'")
      .get()
    assert.ok(definition)
    other.exec(definition.sql)
    seedNativeNotePath(other, 'note', 'independent/path')
    closeDb()
    assert.throws(getDb, /Database not initialized/)
    assert.deepStrictEqual(findNoteFilePath(other, 'note'), { file_path: 'independent/path' })
    assert.deepStrictEqual(
      submissionReadOutcome(() => findNoteFilePath(db, 'note')),
      submissionReadOutcome(() => oldFindNoteFilePath(db, 'note')),
    )
    const next = initDbAtPath(':memory:')
    seedNativeNotePath(next, 'note', 'next/path')
    assert.deepStrictEqual(findNoteFilePath(next, 'note'), { file_path: 'next/path' })
    assert.deepStrictEqual(findNoteFilePath(other, 'note'), { file_path: 'independent/path' })
  } finally {
    other.close()
    readonly.close()
    assert.ok(
      path
        .resolve(directory)
        .startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-notes-native-`),
    )
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('Notes native file-path lookups expose caller transaction/savepoint visibility without read effects', () => {
  const db = getDbForTest()
  const events: DataChangedPayload[] = []
  const off = subscribeDataChanges((event) => events.push(event))
  const read = () => {
    const before = nativeStatsSnapshot(db)
    const actual = findNoteFilePath(db, 'note')
    assert.deepStrictEqual(actual, oldFindNoteFilePath(db, 'note'))
    assert.deepStrictEqual(nativeStatsSnapshot(db), before)
    return actual
  }
  try {
    assert.throws(
      () =>
        db.transaction(() => {
          seedNativeNotePath(db, 'note', 'outer/path')
          assert.deepStrictEqual(read(), { file_path: 'outer/path' })
          assert.throws(
            () =>
              db.transaction(() => {
                db.prepare('UPDATE notes SET file_path=? WHERE id=?').run('', 'note')
                assert.deepStrictEqual(read(), { file_path: '' })
                throw new Error('inner rollback')
              })(),
            /inner rollback/,
          )
          assert.deepStrictEqual(read(), { file_path: 'outer/path' })
          throw new Error('outer rollback')
        })(),
      /outer rollback/,
    )
    assert.strictEqual(read(), undefined)
    assert.deepStrictEqual(events, [])
    assert.strictEqual(db.inTransaction, false)
  } finally {
    off()
  }
})

test('Notes native prepare/get errors retain identity and invalid binding failures still reach native get', () => {
  const db = getDbForTest()
  seedNativeNotePath(db, 'note', 'file')
  for (const stage of ['prepare', 'get'] as const) {
    const sentinel = { stage, message: 'native read sentinel' }
    for (const read of [oldFindNoteFilePath, findNoteFilePath]) {
      const tracking = traceNativeNotePath(db, { stage, value: sentinel })
      let caught: unknown
      try {
        read(db, 'note')
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      assert.strictEqual(caught, sentinel)
      assert.strictEqual(caught, tracking.error())
      assert.deepStrictEqual(
        tracking.stages,
        stage === 'prepare' ? ['prepare'] : ['prepare', 'get'],
      )
    }
  }
  for (const id of [undefined, { bad: true }, Symbol('invalid')]) {
    const results = []
    for (const read of [oldFindNoteFilePath, findNoteFilePath]) {
      const tracking = traceNativeNotePath(db)
      let result
      try {
        result = submissionReadOutcome(() => Reflect.apply(read, undefined, [db, id]))
        assert.deepStrictEqual(tracking.stages, ['prepare', 'get'])
      } finally {
        tracking.restore()
      }
      results.push(result)
    }
    assert.deepStrictEqual(results[1], results[0])
  }
})

test('Notes native damaged-DDL errors retain prepare stage and code with explicit quoted-column spelling qualification', () => {
  for (const damage of ['table', 'column'] as const) {
    const db = new NativeDatabase(':memory:')
    try {
      if (damage === 'column') db.exec('CREATE TABLE notes(id TEXT PRIMARY KEY)')
      const messages: string[] = []
      for (const read of [oldFindNoteFilePath, findNoteFilePath]) {
        const tracking = traceNativeNotePath(db)
        let caught: unknown
        try {
          Reflect.apply(read, undefined, [db, null])
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        assert.strictEqual(caught, tracking.error())
        assert.ok(caught instanceof Error && 'code' in caught)
        assert.strictEqual(caught.name, 'SqliteError')
        assert.strictEqual(caught.code, 'SQLITE_ERROR')
        assert.deepStrictEqual(tracking.stages, ['prepare'])
        messages.push(caught.message)
      }
      if (damage === 'table')
        assert.deepStrictEqual(messages, ['no such table: notes', 'no such table: notes'])
      else {
        assert.strictEqual(messages[0], 'no such column: file_path')
        assert.match(messages[1] ?? '', /^no such column:.*file_path/)
        console.log(`Notes native missing-column diagnostics: ${JSON.stringify(messages)}`)
      }
    } finally {
      db.close()
    }
  }
})

type NativeNoteMetadataWrite = typeof updateNoteTitleRow
type NativeNoteMetadataKind = 'title' | 'note_type'

function compareNativeNoteMetadata(
  run: (
    db: Database.Database,
    write: NativeNoteMetadataWrite,
    kind: NativeNoteMetadataKind,
  ) => unknown,
): void {
  const definition = getDbForTest()
    .prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE name='notes'")
    .get()
  assert.ok(definition)
  for (const [kind, old, current] of [
    ['title', oldUpdateNoteTitleRow, updateNoteTitleRow],
    ['note_type', oldUpdateNoteTypeRow, updateNoteTypeRow],
  ] as const) {
    const results = []
    for (const write of [old, current]) {
      const db = new NativeDatabase(':memory:')
      const events: DataChangedPayload[] = []
      const off = subscribeDataChanges((event) => events.push(event))
      try {
        db.pragma('foreign_keys=ON')
        db.exec(definition.sql)
        results.push({ result: run(db, write, kind), state: nativeStatsSnapshot(db), events })
        assert.deepStrictEqual(events, [], 'Explicit metadata helpers must not publish events')
      } finally {
        off()
        db.close()
      }
    }
    assert.deepStrictEqual(results[1], results[0], kind)
  }
}

function traceNativeNoteMetadata(
  db: Database.Database,
  failure?: { stage: 'prepare' | 'run'; value: unknown },
) {
  const descriptor = Object.getOwnPropertyDescriptor(db, 'prepare')
  const prepare = db.prepare.bind(db)
  const queries: string[] = []
  const bindings: unknown[][] = []
  const stages: string[] = []
  let thrown: unknown
  let nativeResult: Database.RunResult | undefined
  Object.defineProperty(db, 'prepare', {
    configurable: true,
    value: (query: string) => {
      queries.push(query)
      stages.push('prepare')
      if (failure?.stage === 'prepare') {
        thrown = failure.value
        throw thrown
      }
      try {
        const statement = prepare(query)
        const run = statement.run.bind(statement)
        Object.defineProperty(statement, 'run', {
          configurable: true,
          value: (...values: unknown[]) => {
            bindings.push(values)
            stages.push('run')
            if (failure?.stage === 'run') {
              thrown = failure.value
              throw thrown
            }
            try {
              nativeResult = run(...values)
              return nativeResult
            } catch (error) {
              thrown = error
              throw error
            }
          },
        })
        return statement
      } catch (error) {
        thrown = error
        throw error
      }
    },
  })
  return {
    queries,
    bindings,
    stages,
    error: () => thrown,
    result: () => nativeResult,
    restore: () => {
      if (descriptor) Object.defineProperty(db, 'prepare', descriptor)
      else Reflect.deleteProperty(db, 'prepare')
    },
  }
}

test('Notes metadata native builders retain two targets, three raw bindings and original RunResult identity', () => {
  compareNativeNoteMetadata((db, write, kind) => {
    const outcomes = []
    for (const [index, id] of ['', 'note', "literal_%'", '\u4e2d\u6587', null].entries()) {
      seedNativeNotePath(db, id, 'unchanged/path')
      const value =
        kind === 'title' ? `title-${index}` : ['solution', 'review', 'summary'][index % 3]
      const instant = [0, 1.75, 1768443630123, 9e15, 'raw-time'][index]
      const tracking = traceNativeNoteMetadata(db)
      let result
      try {
        result = Reflect.apply(write, undefined, [db, id, value, instant])
        assert.strictEqual(result, tracking.result())
        assert.deepStrictEqual(tracking.stages, ['prepare', 'run'])
        assert.deepStrictEqual(tracking.bindings, [[value, instant, id]])
        assert.strictEqual(tracking.queries.length, 1)
        assert.strictEqual(
          tracking.queries[0]
            ?.replaceAll('"', '')
            .replaceAll('notes.id', 'id')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase(),
          `update notes set ${kind} = ?, updated_at = ? where id = ?`,
        )
      } finally {
        tracking.restore()
      }
      assert.ok(result)
      assert.strictEqual(result.changes, id === null ? 0 : 1)
      outcomes.push(result)
    }
    const sameValue = kind === 'title' ? 'title-1' : 'review'
    outcomes.push(write(db, 'note', sameValue, 1.75))
    assert.strictEqual(outcomes.at(-1)?.changes, 1)
    assert.strictEqual(write(db, 'missing', 'review', 0).changes, 0)
    assert.deepStrictEqual(db.prepare('SELECT DISTINCT file_path FROM notes').all(), [
      { file_path: 'unchanged/path' },
    ])
    return outcomes
  })
})

test('Notes metadata native malformed inputs use actual undefined NULL and array/object binding semantics', () => {
  compareNativeNoteMetadata((db, write) => {
    seedNativeNotePath(db, 'note', 'unchanged/path')
    seedNativeNotePath(db, null, 'anonymous/path')
    const cases: Array<[unknown, unknown, unknown]> = [
      ['note', undefined, 0],
      ['missing', undefined, 0],
      ['note', null, 0],
      [null, 'review', 0],
      [undefined, 'review', 0],
      ['note', ['review'], 0],
      ['note', [], 0],
      ['note', ['review', 9], 0],
      ['note', {}, 0],
      ['note', { unused: 'review' }, 0],
      ['note', Buffer.from([0, 128, 255]), 0],
      ['note', true, 0],
      ['note', Symbol('invalid'), 0],
      ['note', new Date(0), 0],
      ['note', 'review', undefined],
      ['missing', 'review', undefined],
      ['note', 'review', null],
      ['note', 'review', [1.25]],
      ['note', 'review', {}],
      ['note', 'review', 9e15],
      ['note', 'review', 'raw-time'],
      [['note'], 'review', 0],
      [{ unused: 'note' }, 'review', 0],
      [[], 'review', 0],
    ]
    return cases.map(([id, value, instant], index) => {
      db.prepare(
        "UPDATE notes SET title='Synthetic note',note_type='solution',updated_at=1.75",
      ).run()
      const tracking = traceNativeNoteMetadata(db)
      let result
      try {
        result = submissionReadOutcome(() =>
          Reflect.apply(write, undefined, [db, id, value, instant]),
        )
        assert.deepStrictEqual(tracking.stages, ['prepare', 'run'])
        assert.deepStrictEqual(tracking.bindings, [[value, instant, id]])
      } finally {
        tracking.restore()
      }
      if (index === 0) assert.strictEqual(result.error?.code, 'SQLITE_CONSTRAINT_NOTNULL')
      if (index === 1 || index === 3 || index === 4 || index === 15) {
        assert.ok(result.rows && typeof result.rows === 'object' && 'changes' in result.rows)
        assert.strictEqual(result.rows.changes, 0)
      }
      return { result, state: nativeStatsSnapshot(db) }
    })
  })
})

test('Notes metadata native UPDATE OF and IGNORE FAIL ABORT effects match original statements', () => {
  compareNativeNoteMetadata((db, write, kind) => {
    seedNativeNotePath(db, 'note', 'unchanged/path')
    db.exec('CREATE TABLE metadata_targets(name TEXT); CREATE TABLE metadata_effects(name TEXT)')
    for (const target of [
      'id',
      'title',
      'note_type',
      'updated_at',
      'content',
      'file_path',
      'word_count',
      'created_at',
      'deleted_at',
      'problem_id',
    ]) {
      db.exec(
        `CREATE TRIGGER target_${target} AFTER UPDATE OF ${target} ON notes BEGIN INSERT INTO metadata_targets VALUES ('${target}'); END`,
      )
    }
    assert.strictEqual(
      write(db, 'note', kind === 'title' ? 'Synthetic note' : 'solution', 1.75).changes,
      1,
    )
    assert.deepStrictEqual(
      db.prepare('SELECT name FROM metadata_targets ORDER BY name').all(),
      [kind, 'updated_at'].sort().map((name) => ({ name })),
    )
    const outcomes = []
    for (const mode of ['IGNORE', 'FAIL', 'ABORT'] as const) {
      db.exec(`CREATE TRIGGER metadata_probe BEFORE UPDATE OF ${kind} ON notes BEGIN
        INSERT INTO metadata_effects VALUES ('${mode}');
        SELECT RAISE(${mode === 'IGNORE' ? mode : `${mode}, 'metadata rejected'`}); END`)
      const result = submissionReadOutcome(() => write(db, 'note', 'review', 42))
      if (mode === 'IGNORE') {
        assert.ok(result.rows && typeof result.rows === 'object' && 'changes' in result.rows)
        assert.strictEqual(result.rows.changes, 0)
      } else assert.strictEqual(result.error?.code, 'SQLITE_CONSTRAINT_TRIGGER')
      outcomes.push({ result, audit: db.prepare('SELECT * FROM metadata_effects').all() })
      db.exec('DROP TRIGGER metadata_probe')
    }
    assert.deepStrictEqual(db.prepare('SELECT * FROM metadata_effects').all(), [
      { name: 'IGNORE' },
      { name: 'FAIL' },
    ])
    return outcomes
  })
})

test('Notes metadata native failures preserve identity and prepare/run stages including missing-row readonly attempts', () => {
  compareNativeNoteMetadata((db, write) => {
    seedNativeNotePath(db, 'note', 'unchanged/path')
    for (const stage of ['prepare', 'run'] as const) {
      const sentinel = { stage }
      const tracking = traceNativeNoteMetadata(db, { stage, value: sentinel })
      let caught: unknown
      try {
        write(db, 'note', 'review', 0)
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      assert.strictEqual(caught, sentinel)
      assert.strictEqual(caught, tracking.error())
      assert.deepStrictEqual(
        tracking.stages,
        stage === 'prepare' ? ['prepare'] : ['prepare', 'run'],
      )
    }
    db.pragma('query_only=ON')
    const outcomes = []
    for (const id of ['note', 'missing', null]) {
      const tracking = traceNativeNoteMetadata(db)
      let result
      try {
        result = submissionReadOutcome(() => Reflect.apply(write, undefined, [db, id, 'review', 0]))
        assert.deepStrictEqual(tracking.stages, ['prepare', 'run'])
        assert.ok(tracking.error() instanceof Error)
      } finally {
        tracking.restore()
      }
      assert.strictEqual(result.error?.code, 'SQLITE_READONLY')
      outcomes.push(result)
    }
    db.pragma('query_only=OFF')
    return outcomes
  })
  for (const damage of ['table', 'title', 'note_type', 'updated_at'] as const) {
    const db = new NativeDatabase(':memory:')
    try {
      if (damage !== 'table')
        db.exec(
          `CREATE TABLE notes(id TEXT, ${['title', 'note_type', 'updated_at']
            .filter((column) => column !== damage)
            .map((column) => `${column} TEXT`)
            .join(',')})`,
        )
      for (const [old, current] of [
        [oldUpdateNoteTitleRow, updateNoteTitleRow],
        [oldUpdateNoteTypeRow, updateNoteTypeRow],
      ]) {
        if (
          (damage === 'title' && old === oldUpdateNoteTypeRow) ||
          (damage === 'note_type' && old === oldUpdateNoteTitleRow)
        )
          continue
        const errors = []
        for (const write of [old, current]) {
          assert.ok(write)
          const tracking = traceNativeNoteMetadata(db)
          let caught: unknown
          try {
            write(db, 'missing', 'review', 0)
          } catch (error) {
            caught = error
          } finally {
            tracking.restore()
          }
          assert.strictEqual(caught, tracking.error())
          assert.ok(caught instanceof Error && 'code' in caught)
          assert.deepStrictEqual(tracking.stages, ['prepare'])
          errors.push({ constructor: caught.constructor, name: caught.name, code: caught.code })
        }
        assert.deepStrictEqual(errors[1], errors[0])
        assert.strictEqual(errors[0]?.code, 'SQLITE_ERROR')
      }
    } finally {
      db.close()
    }
  }
})

test('Notes metadata explicit handles retain native bigint results, readonly/closed failures and reinitialization independence', () => {
  compareNativeNoteMetadata((db, write) => {
    seedNativeNotePath(db, 'note', 'unchanged/path')
    db.defaultSafeIntegers(true)
    const tracking = traceNativeNoteMetadata(db)
    let result
    try {
      result = write(db, 'note', 'review', 0)
      assert.strictEqual(result, tracking.result())
      assert.strictEqual(typeof result.lastInsertRowid, 'bigint')
    } finally {
      tracking.restore()
    }
    return result
  })
  const source = getDbForTest()
  seedNativeNotePath(source, 'note', 'source/path')
  const definition = source
    .prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE name='notes'")
    .get()
  assert.ok(definition)
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-notes-metadata-native-'))
  const target = path.join(directory, 'readonly.sqlite')
  source.prepare('VACUUM INTO ?').run(target)
  const readonly = new NativeDatabase(target, { readonly: true })
  const other = new NativeDatabase(':memory:')
  try {
    for (const id of ['note', 'missing']) {
      for (const [old, current] of [
        [oldUpdateNoteTitleRow, updateNoteTitleRow],
        [oldUpdateNoteTypeRow, updateNoteTypeRow],
      ] as const) {
        const expected = submissionReadOutcome(() => old(readonly, id, 'review', 0))
        assert.strictEqual(expected.error?.code, 'SQLITE_READONLY')
        assert.deepStrictEqual(
          submissionReadOutcome(() => current(readonly, id, 'review', 0)),
          expected,
        )
      }
    }
    other.exec(definition.sql)
    seedNativeNotePath(other, 'note', 'other/path')
    closeDb()
    assert.throws(getDb, /Database not initialized/)
    assert.strictEqual(updateNoteTitleRow(other, 'note', 'other title', 0).changes, 1)
    for (const [old, current] of [
      [oldUpdateNoteTitleRow, updateNoteTitleRow],
      [oldUpdateNoteTypeRow, updateNoteTypeRow],
    ] as const) {
      assert.deepStrictEqual(
        submissionReadOutcome(() => current(source, 'note', 'review', 0)),
        submissionReadOutcome(() => old(source, 'note', 'review', 0)),
      )
    }
    const next = initDbAtPath(':memory:')
    seedNativeNotePath(next, 'note', 'next/path')
    assert.strictEqual(updateNoteTypeRow(next, 'note', 'summary', 0).changes, 1)
    assert.deepStrictEqual(other.prepare('SELECT title,note_type,file_path FROM notes').get(), {
      title: 'other title',
      note_type: 'solution',
      file_path: 'other/path',
    })
  } finally {
    other.close()
    readonly.close()
    assert.ok(
      path
        .resolve(directory)
        .startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-notes-metadata-native-`),
    )
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('Notes metadata native writes preserve caller savepoints and actual deferred COMMIT failure', () => {
  compareNativeNoteMetadata((db, write, kind) => {
    seedNativeNotePath(db, 'note', 'unchanged/path')
    db.transaction(() => {
      assert.strictEqual(write(db, 'note', 'outer', 0).changes, 1)
      assert.throws(
        () =>
          db.transaction(() => {
            write(db, 'note', 'inner', 1)
            throw new Error('inner rollback')
          })(),
        /inner rollback/,
      )
      assert.deepStrictEqual(
        db.prepare(`SELECT ${kind} AS value FROM notes WHERE id='note'`).get(),
        { value: 'outer' },
      )
    })()
    db.exec(
      'CREATE TABLE metadata_commit(note_id TEXT REFERENCES notes(id) DEFERRABLE INITIALLY DEFERRED)',
    )
    const before = db.prepare('SELECT * FROM notes').all()
    let callbackFinished = false
    const result = submissionReadOutcome(() =>
      db.transaction(() => {
        write(db, 'note', 'uncommitted', 2)
        db.prepare('INSERT INTO metadata_commit VALUES (?)').run('absent')
        callbackFinished = true
      })(),
    )
    assert.strictEqual(callbackFinished, true)
    assert.strictEqual(result.error?.code, 'SQLITE_CONSTRAINT_FOREIGNKEY')
    assert.strictEqual(db.inTransaction, false)
    assert.deepStrictEqual(db.prepare('SELECT * FROM notes').all(), before)
    assert.deepStrictEqual(db.prepare('SELECT * FROM metadata_commit').all(), [])
    return result
  })
})

function compareNativeNoteDelete(
  run: (db: Database.Database, remove: typeof deleteNoteRow) => unknown,
): void {
  const definition = getDbForTest()
    .prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE name='notes'")
    .get()
  assert.ok(definition)
  const results = []
  for (const remove of [oldDeleteNoteRow, deleteNoteRow]) {
    const db = new NativeDatabase(':memory:')
    const events: DataChangedPayload[] = []
    const off = subscribeDataChanges((event) => events.push(event))
    try {
      db.pragma('foreign_keys=ON')
      db.exec(definition.sql)
      results.push({ result: run(db, remove), state: nativeStatsSnapshot(db), events })
      assert.deepStrictEqual(events, [], 'Explicit DELETE helper must not publish events')
    } finally {
      off()
      db.close()
    }
  }
  assert.deepStrictEqual(results[1], results[0])
}

test('Notes DELETE native helper preserves one raw bind, untouched result and actual container diagnostics', () => {
  compareNativeNoteDelete((db, remove) => {
    const ids = ['note', '', 'Case', 'case', "literal_%'", '\u4e2d\u6587', 'with\0nul', null]
    const inputs: unknown[] = [
      ...ids,
      'missing',
      undefined,
      ['note'],
      ['note', 'extra'],
      [],
      {},
      { noteId: 'note' },
      Buffer.from('note'),
      Symbol('invalid'),
      true,
      new Date(0),
    ]
    return inputs.map((id) => {
      db.exec('DELETE FROM notes')
      for (const stored of ids) seedNativeNotePath(db, stored, 'unchanged/path')
      const tracking = traceNativeNoteMetadata(db)
      const originalNow = Date.now
      const originalUuid = crypto.randomUUID
      let result
      try {
        Date.now = () => {
          throw new Error('DELETE helper must not read the clock')
        }
        crypto.randomUUID = () => {
          throw new Error('DELETE helper must not create an ID')
        }
        result = submissionReadOutcome(() => {
          const native: unknown = Reflect.apply(remove, undefined, [db, id])
          assert.strictEqual(native, tracking.result())
          return native
        })
        assert.deepStrictEqual(tracking.stages, ['prepare', 'run'])
        assert.deepStrictEqual(tracking.bindings, [[id]])
        assert.strictEqual(tracking.queries.length, 1)
        assert.strictEqual(
          tracking.queries[0]
            ?.replaceAll('"', '')
            .replaceAll('notes.id', 'id')
            .trim()
            .toLowerCase(),
          'delete from notes where id = ?',
        )
      } finally {
        Date.now = originalNow
        crypto.randomUUID = originalUuid
        tracking.restore()
      }
      if (id === null || id === undefined || id === 'missing') {
        assert.ok(result.rows && typeof result.rows === 'object' && 'changes' in result.rows)
        assert.strictEqual(result.rows.changes, 0)
      }
      return { result, state: nativeStatsSnapshot(db) }
    })
  })
})

test('Notes DELETE native helper preserves trigger effects, readonly attempts and injected failure identities', () => {
  compareNativeNoteDelete((db, remove) => {
    seedNativeNotePath(db, 'note', 'unchanged/path')
    db.exec('CREATE TABLE delete_audit(mode TEXT)')
    const outcomes = []
    for (const mode of ['IGNORE', 'FAIL', 'ABORT'] as const) {
      db.exec(`CREATE TRIGGER delete_probe BEFORE DELETE ON notes BEGIN
        INSERT INTO delete_audit VALUES ('${mode}');
        SELECT RAISE(${mode === 'IGNORE' ? mode : `${mode}, 'delete rejected'`}); END`)
      const result = submissionReadOutcome(() => remove(db, 'note'))
      if (mode === 'IGNORE') {
        assert.ok(result.rows && typeof result.rows === 'object' && 'changes' in result.rows)
        assert.strictEqual(result.rows.changes, 0)
      } else assert.strictEqual(result.error?.code, 'SQLITE_CONSTRAINT_TRIGGER')
      outcomes.push({ result, audit: db.prepare('SELECT * FROM delete_audit').all() })
      assert.ok(db.prepare("SELECT id FROM notes WHERE id='note'").get())
      db.exec('DROP TRIGGER delete_probe')
    }
    assert.deepStrictEqual(db.prepare('SELECT * FROM delete_audit').all(), [
      { mode: 'IGNORE' },
      { mode: 'FAIL' },
    ])
    for (const stage of ['prepare', 'run'] as const) {
      const sentinel = { stage }
      const tracking = traceNativeNoteMetadata(db, { stage, value: sentinel })
      let caught: unknown
      try {
        remove(db, 'note')
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      assert.strictEqual(caught, sentinel)
      assert.strictEqual(caught, tracking.error())
      assert.deepStrictEqual(
        tracking.stages,
        stage === 'prepare' ? ['prepare'] : ['prepare', 'run'],
      )
    }
    db.pragma('query_only=ON')
    for (const id of ['note', 'missing', null, undefined]) {
      const tracking = traceNativeNoteMetadata(db)
      let result
      try {
        result = submissionReadOutcome(() => Reflect.apply(remove, undefined, [db, id]))
        assert.deepStrictEqual(tracking.stages, ['prepare', 'run'])
      } finally {
        tracking.restore()
      }
      assert.strictEqual(result.error?.code, 'SQLITE_READONLY')
      outcomes.push({ result, audit: db.prepare('SELECT * FROM delete_audit').all() })
    }
    db.pragma('query_only=OFF')
    return outcomes
  })
})

test('Notes DELETE native result keeps bigint and explicit handles stay independent across readonly close and reinit', () => {
  compareNativeNoteDelete((db, remove) => {
    seedNativeNotePath(db, 'note', 'unchanged/path')
    db.defaultSafeIntegers(true)
    const tracking = traceNativeNoteMetadata(db)
    try {
      const result = remove(db, 'note')
      assert.strictEqual(result, tracking.result())
      assert.strictEqual(typeof result.lastInsertRowid, 'bigint')
      return result
    } finally {
      tracking.restore()
    }
  })
  const source = getDbForTest()
  seedNativeNotePath(source, 'note', 'source/path')
  const definition = source
    .prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE name='notes'")
    .get()
  assert.ok(definition)
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-notes-delete-native-'))
  const target = path.join(directory, 'readonly.sqlite')
  source.prepare('VACUUM INTO ?').run(target)
  const readonly = new NativeDatabase(target, { readonly: true })
  const other = new NativeDatabase(':memory:')
  try {
    for (const id of ['note', 'missing']) {
      const expected = submissionReadOutcome(() => oldDeleteNoteRow(readonly, id))
      assert.strictEqual(expected.error?.code, 'SQLITE_READONLY')
      assert.deepStrictEqual(
        submissionReadOutcome(() => deleteNoteRow(readonly, id)),
        expected,
      )
    }
    other.exec(definition.sql)
    seedNativeNotePath(other, 'note', 'other/path')
    closeDb()
    assert.throws(getDb, /Database not initialized/)
    assert.strictEqual(deleteNoteRow(other, 'note').changes, 1)
    assert.deepStrictEqual(
      submissionReadOutcome(() => deleteNoteRow(source, 'note')),
      submissionReadOutcome(() => oldDeleteNoteRow(source, 'note')),
    )
    const next = initDbAtPath(':memory:')
    seedNativeNotePath(next, 'note', 'next/path')
    assert.strictEqual(deleteNoteRow(next, 'note').changes, 1)
    assert.strictEqual(deleteNoteRow(other, 'note').changes, 0)
  } finally {
    other.close()
    readonly.close()
    assert.ok(
      path
        .resolve(directory)
        .startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-notes-delete-native-`),
    )
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('Notes DELETE native damaged schema fails at prepare while savepoints and actual COMMIT remain caller-owned', () => {
  for (const tableExists of [false, true]) {
    const db = new NativeDatabase(':memory:')
    try {
      if (tableExists) db.exec('CREATE TABLE notes(removed_id TEXT)')
      const errors = []
      for (const remove of [oldDeleteNoteRow, deleteNoteRow]) {
        const tracking = traceNativeNoteMetadata(db)
        let caught: unknown
        try {
          remove(db, 'missing')
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        assert.strictEqual(caught, tracking.error())
        assert.ok(caught instanceof Error && 'code' in caught)
        assert.deepStrictEqual(tracking.stages, ['prepare'])
        assert.strictEqual(caught.code, 'SQLITE_ERROR')
        errors.push({ constructor: caught.constructor, name: caught.name, code: caught.code })
      }
      assert.deepStrictEqual(errors[1], errors[0])
    } finally {
      db.close()
    }
  }
  compareNativeNoteDelete((db, remove) => {
    seedNativeNotePath(db, 'outer', 'outer/path')
    seedNativeNotePath(db, 'inner', 'inner/path')
    db.transaction(() => {
      assert.strictEqual(remove(db, 'outer').changes, 1)
      assert.throws(
        () =>
          db.transaction(() => {
            remove(db, 'inner')
            throw new Error('inner rollback')
          })(),
        /inner rollback/,
      )
      assert.deepStrictEqual(db.prepare('SELECT id FROM notes').all(), [{ id: 'inner' }])
    })()
    db.exec(
      'CREATE TABLE delete_commit(note_id TEXT REFERENCES notes(id) DEFERRABLE INITIALLY DEFERRED)',
    )
    db.prepare('INSERT INTO delete_commit VALUES (?)').run('inner')
    let callbackFinished = false
    const result = submissionReadOutcome(() =>
      db.transaction(() => {
        assert.strictEqual(remove(db, 'inner').changes, 1)
        callbackFinished = true
      })(),
    )
    assert.strictEqual(callbackFinished, true)
    assert.strictEqual(result.error?.code, 'SQLITE_CONSTRAINT_FOREIGNKEY')
    assert.strictEqual(db.inTransaction, false)
    assert.deepStrictEqual(db.prepare('SELECT id FROM notes').all(), [{ id: 'inner' }])
    return result
  })
})

function compareNativeNoteContent(
  run: (db: Database.Database, write: typeof updateNoteContentRow) => unknown,
): void {
  const definition = getDbForTest()
    .prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE name='notes'")
    .get()
  assert.ok(definition)
  const results = []
  for (const write of [oldUpdateNoteContentRow, updateNoteContentRow]) {
    const db = new NativeDatabase(':memory:')
    const events: DataChangedPayload[] = []
    const off = subscribeDataChanges((event) => events.push(event))
    try {
      db.pragma('foreign_keys=ON')
      db.exec(definition.sql)
      results.push({ result: run(db, write), state: nativeStatsSnapshot(db), events })
      assert.deepStrictEqual(events, [], 'Explicit content helper must not publish events')
    } finally {
      off()
      db.close()
    }
  }
  assert.deepStrictEqual(results[1], results[0])
}

test('Notes content native carrier preserves four raw bindings, result identity and container-order negative control', () => {
  compareNativeNoteContent((db, write) => {
    seedNativeNotePath(db, 'note', 'unchanged/path')
    seedNativeNotePath(db, null, 'anonymous/path')
    const cases: Array<[unknown, unknown, unknown, unknown]> = [
      ['note', 'body', 2, 0],
      ['note', 'body', 2, 1.75],
      ['note', '', 0, 9e15],
      ['note', Buffer.from([0, 128, 255]), 2, 'raw-time'],
      ['note', 'body', 2n, 3n],
      ['note', 'body', 'raw-count', Buffer.from('raw-time')],
      ['missing', 'body', 2, 0],
      [null, 'body', 2, 0],
      [undefined, 'body', 2, 0],
      ['note', ['body', 'injected'], 2, []],
      ['note', ['body'], 2, 0],
      ['note', {}, 2, 0],
      ['note', 'body', {}, 0],
      ['note', 'body', 2, {}],
      [['note'], 'body', 2, 0],
      [{ id: 'note' }, 'body', 2, 0],
      ['note', Symbol('content'), 2, 0],
      ['note', 'body', true, 0],
      ['note', 'body', 2, new Date(0)],
      ['note', 'body', NaN, Infinity],
    ]
    const results = cases.map(([id, content, count, instant]) => {
      db.prepare("UPDATE notes SET content='',word_count=0,updated_at=1.75").run()
      const tracking = traceNativeNoteMetadata(db)
      const originalNow = Date.now
      const originalUuid = crypto.randomUUID
      let result
      try {
        Date.now = () => {
          throw new Error('Content helper must not read clock')
        }
        crypto.randomUUID = () => {
          throw new Error('Content helper must not create ID')
        }
        result = submissionReadOutcome(() => {
          const native: unknown = Reflect.apply(write, undefined, [db, id, content, count, instant])
          assert.strictEqual(native, tracking.result())
          return native
        })
        assert.deepStrictEqual(tracking.stages, ['prepare', 'run'])
        assert.deepStrictEqual(tracking.bindings, [[content, count, instant, id]])
        assert.strictEqual(tracking.queries.length, 1)
        if (write === updateNoteContentRow) {
          assert.ok(
            tracking.queries[0]
              ?.replaceAll('"', '')
              .toLowerCase()
              .startsWith(
                'with note_write_values as (select ? as content, ? as word_count, ? as updated_at, ? as note_id from (select 1)) update notes set ',
              ),
          )
        }
      } finally {
        Date.now = originalNow
        crypto.randomUUID = originalUuid
        tracking.restore()
      }
      return { result, state: nativeStatsSnapshot(db) }
    })
    Reflect.apply(write, undefined, [db, 'note', ['body', 'injected'], 2, []])
    const expected = { content: 'body', word_count: 'injected', updated_at: 2 }
    assert.deepStrictEqual(
      db.prepare("SELECT content,word_count,updated_at FROM notes WHERE id='note'").get(),
      expected,
    )
    const reordered = createDrizzleClient(db)
      .update(ormNotes)
      .set({
        content: sql`${sql.placeholder('content')}`,
        word_count: sql`${sql.placeholder('wordCount')}`,
        updated_at: sql`${sql.placeholder('now')}`,
      })
      .where(eq(ormNotes.id, sql.placeholder('noteId')))
      .prepare()
    reordered.run({ content: ['body', 'injected'], wordCount: 2, now: [], noteId: 'note' })
    const changed = db
      .prepare("SELECT content,word_count,updated_at FROM notes WHERE id='note'")
      .get()
    assert.deepStrictEqual(changed, { content: 'injected', word_count: 2, updated_at: 'body' })
    assert.notDeepStrictEqual(changed, expected)
    return results
  })
})

test('Notes content native combined NULL constraints and ID affinities retain original outcomes', () => {
  compareNativeNoteContent((db, write) => {
    seedNativeNotePath(db, 'note', 'unchanged/path')
    const results = []
    for (const missing of [false, true])
      for (const value of [null, undefined])
        for (let mask = 1; mask < 8; mask++) {
          const content = mask & 1 ? value : 'body'
          const count = mask & 2 ? value : 2
          const instant = mask & 4 ? value : 0
          const result = submissionReadOutcome(() =>
            Reflect.apply(write, undefined, [
              db,
              missing ? 'missing' : 'note',
              content,
              count,
              instant,
            ]),
          )
          if (missing) {
            assert.ok(result.rows && typeof result.rows === 'object' && 'changes' in result.rows)
            assert.strictEqual(result.rows.changes, 0)
          } else assert.strictEqual(result.error?.code, 'SQLITE_CONSTRAINT_NOTNULL')
          results.push({ result, state: nativeStatsSnapshot(db) })
        }
    for (const [stored, bound] of [
      [42, '42'],
      ['42', 42],
      ['042', 42],
      [42, 42n],
      [Buffer.from('42'), Buffer.from('42')],
      [Buffer.from('42'), '42'],
      ['42', Buffer.from('42')],
      ['', ''],
      ['\u4e2d\u6587', '\u4e2d\u6587'],
      ["literal_%'", "literal_%'"],
    ]) {
      db.exec('DELETE FROM notes')
      Reflect.apply(seedNativeNotePath, undefined, [db, stored, 'unchanged/path'])
      const result = submissionReadOutcome(() =>
        Reflect.apply(write, undefined, [db, bound, 'affinity', 1, 0]),
      )
      results.push({ result, state: nativeStatsSnapshot(db) })
    }
    return results
  })
})

test('Notes content native UPDATE OF and NEW values preserve exact targets and IGNORE FAIL ABORT audit effects', () => {
  compareNativeNoteContent((db, write) => {
    seedNativeNotePath(db, 'note', 'unchanged/path')
    seedNativeNotePath(db, 'other', 'other/path')
    db.exec(
      'CREATE TABLE content_targets(name TEXT); CREATE TABLE content_values(stage TEXT,content,word_count,updated_at); CREATE TABLE content_effects(mode TEXT)',
    )
    for (const target of [
      'id',
      'title',
      'note_type',
      'updated_at',
      'content',
      'file_path',
      'word_count',
      'created_at',
      'deleted_at',
      'problem_id',
    ]) {
      db.exec(
        `CREATE TRIGGER content_target_${target} AFTER UPDATE OF ${target} ON notes BEGIN INSERT INTO content_targets VALUES ('${target}'); END`,
      )
    }
    for (const stage of ['BEFORE', 'AFTER'])
      db.exec(
        `CREATE TRIGGER content_values_${stage} ${stage} UPDATE ON notes BEGIN INSERT INTO content_values VALUES ('${stage}',NEW.content,NEW.word_count,NEW.updated_at); END`,
      )
    assert.strictEqual(write(db, 'note', 'body', 2, 1.75).changes, 1)
    assert.deepStrictEqual(db.prepare('SELECT name FROM content_targets ORDER BY name').all(), [
      { name: 'content' },
      { name: 'updated_at' },
      { name: 'word_count' },
    ])
    assert.deepStrictEqual(db.prepare('SELECT * FROM content_values ORDER BY stage').all(), [
      { stage: 'AFTER', content: 'body', word_count: 2, updated_at: 1.75 },
      { stage: 'BEFORE', content: 'body', word_count: 2, updated_at: 1.75 },
    ])
    const results = []
    for (const mode of ['IGNORE', 'FAIL', 'ABORT'] as const) {
      db.exec(
        `CREATE TRIGGER content_probe BEFORE UPDATE OF content ON notes BEGIN INSERT INTO content_effects VALUES ('${mode}'); SELECT RAISE(${mode === 'IGNORE' ? mode : `${mode}, 'content rejected'`}); END`,
      )
      const result = submissionReadOutcome(() => write(db, 'note', 'rejected', 9, 3))
      if (mode === 'IGNORE') {
        assert.ok(result.rows && typeof result.rows === 'object' && 'changes' in result.rows)
        assert.strictEqual(result.rows.changes, 0)
      } else assert.strictEqual(result.error?.code, 'SQLITE_CONSTRAINT_TRIGGER')
      results.push({ result, audit: db.prepare('SELECT * FROM content_effects').all() })
      db.exec('DROP TRIGGER content_probe')
    }
    assert.deepStrictEqual(db.prepare('SELECT * FROM content_effects').all(), [
      { mode: 'IGNORE' },
      { mode: 'FAIL' },
    ])
    return results
  })
})

test('Notes content native failures retain prepare/run identity and missing-row readonly attempts', () => {
  compareNativeNoteContent((db, write) => {
    seedNativeNotePath(db, 'note', 'unchanged/path')
    for (const stage of ['prepare', 'run'] as const) {
      const sentinel = { stage }
      const tracking = traceNativeNoteMetadata(db, { stage, value: sentinel })
      let caught: unknown
      try {
        write(db, 'note', 'body', 2, 0)
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      assert.strictEqual(caught, sentinel)
      assert.strictEqual(caught, tracking.error())
      assert.deepStrictEqual(
        tracking.stages,
        stage === 'prepare' ? ['prepare'] : ['prepare', 'run'],
      )
    }
    db.pragma('query_only=ON')
    const results = []
    for (const id of ['note', 'missing', null]) {
      const tracking = traceNativeNoteMetadata(db)
      let result
      try {
        result = submissionReadOutcome(() =>
          Reflect.apply(write, undefined, [db, id, 'body', 2, 0]),
        )
        assert.deepStrictEqual(tracking.stages, ['prepare', 'run'])
      } finally {
        tracking.restore()
      }
      assert.strictEqual(result.error?.code, 'SQLITE_READONLY')
      results.push(result)
    }
    db.pragma('query_only=OFF')
    return results
  })
  for (const missing of ['table', 'id', 'content', 'word_count', 'updated_at']) {
    const db = new NativeDatabase(':memory:')
    try {
      if (missing !== 'table')
        db.exec(
          `CREATE TABLE notes(${['id', 'content', 'word_count', 'updated_at']
            .filter((column) => column !== missing)
            .map((column) => `${column} TEXT`)
            .join(',')})`,
        )
      for (const write of [oldUpdateNoteContentRow, updateNoteContentRow]) {
        const tracking = traceNativeNoteMetadata(db)
        let caught: unknown
        try {
          write(db, 'note', 'body', 2, 0)
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        assert.strictEqual(caught, tracking.error())
        assert.ok(caught instanceof Error && 'code' in caught)
        assert.strictEqual(caught.name, 'SqliteError')
        assert.strictEqual(caught.code, 'SQLITE_ERROR')
        assert.deepStrictEqual(tracking.stages, ['prepare'])
      }
    } finally {
      db.close()
    }
  }
})

test('Notes content native explicit handles keep bigint results and readonly close/reinit independence', () => {
  compareNativeNoteContent((db, write) => {
    seedNativeNotePath(db, 'note', 'unchanged/path')
    db.defaultSafeIntegers(true)
    const tracking = traceNativeNoteMetadata(db)
    try {
      const result = write(db, 'note', 'body', 2, 0)
      assert.strictEqual(result, tracking.result())
      assert.strictEqual(typeof result.lastInsertRowid, 'bigint')
      return result
    } finally {
      tracking.restore()
    }
  })
  const source = getDbForTest()
  seedNativeNotePath(source, 'note', 'source/path')
  const definition = source
    .prepare<[], { sql: string }>("SELECT sql FROM sqlite_schema WHERE name='notes'")
    .get()
  assert.ok(definition)
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-notes-content-native-'))
  const target = path.join(directory, 'readonly.sqlite')
  source.prepare('VACUUM INTO ?').run(target)
  const readonly = new NativeDatabase(target, { readonly: true })
  const other = new NativeDatabase(':memory:')
  try {
    for (const id of ['note', 'missing']) {
      const expected = submissionReadOutcome(() =>
        oldUpdateNoteContentRow(readonly, id, 'body', 2, 0),
      )
      assert.strictEqual(expected.error?.code, 'SQLITE_READONLY')
      assert.deepStrictEqual(
        submissionReadOutcome(() => updateNoteContentRow(readonly, id, 'body', 2, 0)),
        expected,
      )
    }
    other.exec(definition.sql)
    seedNativeNotePath(other, 'note', 'other/path')
    closeDb()
    assert.throws(getDb, /Database not initialized/)
    assert.strictEqual(updateNoteContentRow(other, 'note', 'other body', 2, 0).changes, 1)
    assert.deepStrictEqual(
      submissionReadOutcome(() => updateNoteContentRow(source, 'note', 'body', 2, 0)),
      submissionReadOutcome(() => oldUpdateNoteContentRow(source, 'note', 'body', 2, 0)),
    )
    const next = initDbAtPath(':memory:')
    seedNativeNotePath(next, 'note', 'next/path')
    assert.strictEqual(updateNoteContentRow(next, 'note', 'next body', 3, 1).changes, 1)
    assert.deepStrictEqual(
      other.prepare('SELECT content,word_count,updated_at,file_path FROM notes').get(),
      { content: 'other body', word_count: 2, updated_at: 0, file_path: 'other/path' },
    )
  } finally {
    other.close()
    readonly.close()
    const absolute = path.resolve(directory)
    assert.strictEqual(path.dirname(absolute), path.resolve(os.tmpdir()))
    assert.ok(path.basename(absolute).startsWith('algo-notes-content-native-'))
    assert.strictEqual(fs.lstatSync(absolute).isSymbolicLink(), false)
    assert.strictEqual(path.dirname(fs.realpathSync(absolute)), fs.realpathSync(os.tmpdir()))
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('Notes content native savepoint and deferred COMMIT failure preserve earlier committed rows', () => {
  compareNativeNoteContent((db, write) => {
    seedNativeNotePath(db, 'note', 'unchanged/path')
    db.transaction(() => {
      write(db, 'note', 'outer body', 2, 0)
      assert.throws(
        () =>
          db.transaction(() => {
            write(db, 'note', 'inner body', 3, 1)
            throw new Error('inner rollback')
          })(),
        /inner rollback/,
      )
      assert.deepStrictEqual(db.prepare('SELECT content,word_count,updated_at FROM notes').get(), {
        content: 'outer body',
        word_count: 2,
        updated_at: 0,
      })
    })()
    const before = db.prepare('SELECT * FROM notes').all()
    db.exec(
      'CREATE TABLE content_commit(note_id TEXT REFERENCES notes(id) DEFERRABLE INITIALLY DEFERRED)',
    )
    let callbackFinished = false
    const result = submissionReadOutcome(() =>
      db.transaction(() => {
        write(db, 'note', 'uncommitted', 4, 2)
        db.prepare('INSERT INTO content_commit VALUES (?)').run('missing')
        callbackFinished = true
      })(),
    )
    assert.strictEqual(callbackFinished, true)
    assert.strictEqual(result.error?.code, 'SQLITE_CONSTRAINT_FOREIGNKEY')
    assert.strictEqual(db.inTransaction, false)
    assert.deepStrictEqual(db.prepare('SELECT * FROM notes').all(), before)
    assert.deepStrictEqual(db.prepare('SELECT * FROM content_commit').all(), [])
    return result
  })
})

function nativeNoteCreateValues(): CreateNoteValues {
  return {
    id: 'note',
    problemId: 'orphan-parent',
    title: 'Title',
    filePath: 'synthetic/path',
    noteType: 'solution',
    content: 'body',
    wordCount: 1,
    now: 17,
  }
}

function nativeNoteCreateSchema(): string {
  return getDbForTest()
    .prepare<[], { sql: string }>(
      "SELECT sql FROM sqlite_schema WHERE tbl_name='notes' AND sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,name",
    )
    .all()
    .map(({ sql: definition }) => definition)
    .join(';')
}

function compareNativeNoteCreate(
  run: (db: Database.Database, prepare: typeof prepareCreateNoteInsert) => unknown,
): void {
  const definition = nativeNoteCreateSchema()
  const results = []
  for (const prepare of [oldPrepareCreateNoteInsert, prepareCreateNoteInsert]) {
    const db = new NativeDatabase(':memory:')
    const events: DataChangedPayload[] = []
    const off = subscribeDataChanges((event) => events.push(event))
    try {
      db.pragma('foreign_keys=ON')
      db.exec(definition)
      results.push({ result: run(db, prepare), state: nativeStatsSnapshot(db), events })
      assert.deepStrictEqual(events, [], 'Explicit creation helper must not publish events')
    } finally {
      off()
      db.close()
    }
  }
  assert.deepStrictEqual(results[1], results[0])
}

test('Notes create native carrier retains nine raw bindings, native results and array-order negative control', () => {
  compareNativeNoteCreate((db, prepare) => {
    const patches: object[] = [
      {},
      { id: null, problemId: null, content: '', wordCount: 0, now: 0 },
      { id: undefined, problemId: undefined, now: 1.75 },
      { id: '', problemId: '', now: 9e15 },
      { id: "literal_%'", problemId: '\u4e2d\u6587', now: -1 },
      { id: Buffer.from('id'), problemId: Buffer.from('parent'), content: Buffer.from([0, 255]) },
      { id: 42, title: 7, filePath: 9, noteType: 3, wordCount: '4.5', now: 'raw-time' },
      { wordCount: 2n, now: 9007199254740993n },
      { wordCount: -Infinity, now: Infinity },
      { wordCount: NaN },
      { now: NaN },
      { content: ['body', 'count-injected', 41], wordCount: 7, now: [] },
      { id: ['note'], content: ['body'], wordCount: [2], now: [3] },
      { content: [] },
      { content: {} },
      { title: {}, content: {} },
      { title: Symbol('title'), now: 2n ** 63n },
      { title: 2n ** 63n, now: Symbol('now') },
      { now: true },
      { now: new Date(0) },
      { content: () => 'body' },
    ]
    const results = patches.map((patch) => {
      db.exec('DELETE FROM notes')
      const values = { ...nativeNoteCreateValues(), ...patch }
      const tracking = traceNativeNoteMetadata(db)
      const originalNow = Date.now
      const originalUuid = crypto.randomUUID
      let result
      try {
        Date.now = () => {
          throw new Error('Create helper must not read clock')
        }
        crypto.randomUUID = () => {
          throw new Error('Create helper must not generate IDs')
        }
        const prepared = prepare(db)
        assert.deepStrictEqual(tracking.stages, ['prepare'])
        assert.deepStrictEqual(tracking.bindings, [])
        result = submissionReadOutcome(() => {
          try {
            const native: unknown = Reflect.apply(prepared.run, prepared, [values])
            assert.strictEqual(native, tracking.result())
            return native
          } catch (error) {
            assert.strictEqual(error, tracking.error())
            throw error
          }
        })
        assert.deepStrictEqual(tracking.stages, ['prepare', 'run'])
        assert.deepStrictEqual(tracking.bindings, [
          [
            values.id,
            values.problemId,
            values.title,
            values.filePath,
            values.noteType,
            values.content,
            values.wordCount,
            values.now,
            values.now,
          ],
        ])
        assert.strictEqual(tracking.bindings[0]?.[7], values.now)
        assert.strictEqual(tracking.bindings[0]?.[8], values.now)
        assert.strictEqual(tracking.queries.length, 1)
        assert.strictEqual(tracking.queries[0]?.match(/\?/g)?.length, 9)
        if (prepare === prepareCreateNoteInsert) {
          const query = tracking.queries[0]?.replaceAll('"', '').toLowerCase()
          assert.ok(query?.startsWith('with note_create_values as (select ? as id,'))
          assert.ok(query.includes('null as deleted_at'))
          assert.ok(!query.includes('returning') && !query.includes('on conflict'))
        }
      } finally {
        Date.now = originalNow
        crypto.randomUUID = originalUuid
        tracking.restore()
      }
      if (typeof values.title === 'symbol') assert.strictEqual(result.error?.name, 'TypeError')
      if (typeof values.title === 'bigint') assert.strictEqual(result.error?.name, 'RangeError')
      return {
        result,
        rows: db
          .prepare(
            'SELECT *,typeof(id) AS id_type,typeof(problem_id) AS parent_type,typeof(content) AS content_type,typeof(word_count) AS count_type,typeof(created_at) AS time_type FROM notes',
          )
          .safeIntegers(true)
          .all(),
      }
    })
    db.exec('DELETE FROM notes')
    const malformed = {
      ...nativeNoteCreateValues(),
      content: ['body', 'count-injected', 41],
      wordCount: 7,
      now: [],
    }
    Reflect.apply(prepare(db).run, undefined, [malformed])
    const expected = {
      content: 'body',
      word_count: 'count-injected',
      created_at: 41,
      updated_at: 7,
    }
    const selection = 'SELECT content,word_count,created_at,updated_at FROM notes'
    assert.deepStrictEqual(db.prepare(selection).get(), expected)
    db.exec('DELETE FROM notes')
    createDrizzleClient(db)
      .insert(ormNotes)
      .values({
        id: sql`${sql.placeholder('id')}`,
        problem_id: sql`${sql.placeholder('problemId')}`,
        title: sql`${sql.placeholder('title')}`,
        file_path: sql`${sql.placeholder('filePath')}`,
        note_type: sql`${sql.placeholder('noteType')}`,
        content: sql`${sql.placeholder('content')}`,
        word_count: sql`${sql.placeholder('wordCount')}`,
        created_at: sql`${sql.placeholder('now')}`,
        updated_at: sql`${sql.placeholder('now')}`,
      })
      .prepare()
      .run(malformed)
    const reordered = db.prepare(selection).get()
    assert.deepStrictEqual(reordered, {
      content: '41.0',
      word_count: 7,
      created_at: 'body',
      updated_at: 'count-injected',
    })
    assert.notDeepStrictEqual(reordered, expected)
    return results
  })
})

test('Notes create native factory prepares before payload getters and preserves failure identities and stages', () => {
  compareNativeNoteCreate((db, prepare) => {
    for (const stage of ['success', 'prepare', 'parent', 'title', 'run'] as const) {
      db.exec('DELETE FROM notes')
      const sentinel = { stage }
      const tracking = traceNativeNoteMetadata(
        db,
        stage === 'prepare' || stage === 'run' ? { stage, value: sentinel } : undefined,
      )
      const input = {
        get problemId() {
          tracking.stages.push('parent')
          if (stage === 'parent') throw sentinel
          return 'parent'
        },
        get title() {
          tracking.stages.push('title')
          if (stage === 'title') throw sentinel
          return 'Title'
        },
      }
      let caught: unknown
      try {
        const result = prepare(db).run({
          ...nativeNoteCreateValues(),
          problemId: input.problemId,
          title: input.title,
        })
        assert.strictEqual(result, tracking.result())
      } catch (error) {
        caught = error
      } finally {
        tracking.restore()
      }
      assert.strictEqual(caught, stage === 'success' ? undefined : sentinel)
      const full = ['prepare', 'parent', 'title', 'run']
      const end = stage === 'success' ? full.length : full.indexOf(stage) + 1
      assert.deepStrictEqual(tracking.stages, full.slice(0, end))
      if (stage === 'prepare' || stage === 'run') assert.strictEqual(caught, tracking.error())
    }
  })
  for (const missing of ['table', 'title', 'content', 'created_at']) {
    const db = new NativeDatabase(':memory:')
    try {
      if (missing !== 'table') {
        db.exec(nativeNoteCreateSchema())
        db.exec(`ALTER TABLE notes RENAME COLUMN ${missing} TO removed_column`)
      }
      for (const prepare of [oldPrepareCreateNoteInsert, prepareCreateNoteInsert]) {
        const tracking = traceNativeNoteMetadata(db)
        let caught: unknown
        try {
          prepare(db)
        } catch (error) {
          caught = error
        } finally {
          tracking.restore()
        }
        assert.strictEqual(caught, tracking.error())
        assert.ok(caught instanceof Error && 'code' in caught)
        assert.strictEqual(caught.name, 'SqliteError')
        assert.strictEqual(caught.code, 'SQLITE_ERROR')
        assert.deepStrictEqual(tracking.stages, ['prepare'])
      }
    } finally {
      db.close()
    }
  }
})

test('Notes create native frozen defaults and combined constraints retain physical priority before uniqueness', () => {
  compareNativeNoteCreate((db, prepare) => {
    const columns = db
      .prepare<[], { name: string; dflt_value: unknown }>('PRAGMA table_info(notes)')
      .all()
    assert.strictEqual(columns.find(({ name }) => name === 'deleted_at')?.dflt_value, null)
    prepare(db).run(nativeNoteCreateValues())
    assert.deepStrictEqual(db.prepare('SELECT deleted_at FROM notes').get(), { deleted_at: null })
    const keys = ['title', 'filePath', 'noteType', 'now', 'content', 'wordCount'] as const
    const physical = ['title', 'file_path', 'note_type', 'created_at', 'content', 'word_count']
    const results = []
    for (const value of [null, undefined]) {
      for (let mask = 1; mask < 64; mask++) {
        const payload: Record<string, unknown> = { ...nativeNoteCreateValues() }
        keys.forEach((key, index) => {
          if (mask & (1 << index)) payload[key] = value
        })
        const result = submissionReadOutcome(() =>
          Reflect.apply(prepare(db).run, undefined, [payload]),
        )
        assert.strictEqual(result.error?.code, 'SQLITE_CONSTRAINT_NOTNULL')
        const first = keys.findIndex((_, index) => (mask & (1 << index)) !== 0)
        assert.strictEqual(
          result.error?.message,
          `NOT NULL constraint failed: notes.${physical[first]}`,
        )
        results.push(result)
      }
    }
    const duplicate = submissionReadOutcome(() => prepare(db).run(nativeNoteCreateValues()))
    assert.strictEqual(duplicate.error?.code, 'SQLITE_CONSTRAINT_PRIMARYKEY')
    for (const id of [null, undefined, '', Buffer.from('note')]) {
      db.exec('DELETE FROM notes')
      const payload = { ...nativeNoteCreateValues(), id }
      const first = submissionReadOutcome(() =>
        Reflect.apply(prepare(db).run, undefined, [payload]),
      )
      const second = submissionReadOutcome(() =>
        Reflect.apply(prepare(db).run, undefined, [payload]),
      )
      if (id == null) assert.ok(!second.error)
      else assert.strictEqual(second.error?.code, 'SQLITE_CONSTRAINT_PRIMARYKEY')
      results.push({ first, second, rows: db.prepare('SELECT * FROM notes').all() })
    }
    return { results, duplicate }
  })
})

test('Notes create native triggers retain NEW fields, rowids and IGNORE FAIL ABORT audit effects', () => {
  compareNativeNoteCreate((db, prepare) => {
    db.exec(
      'CREATE TABLE create_values(stage TEXT,id,parent,title,path,type,content,count,created,updated,deleted); CREATE TABLE create_rowids(stage TEXT,new_rowid,last_rowid); CREATE TABLE create_effects(mode TEXT)',
    )
    for (const stage of ['BEFORE', 'AFTER']) {
      db.exec(`CREATE TRIGGER create_values_${stage} ${stage} INSERT ON notes BEGIN
        INSERT INTO create_values VALUES ('${stage}',NEW.id,NEW.problem_id,NEW.title,NEW.file_path,NEW.note_type,NEW.content,NEW.word_count,NEW.created_at,NEW.updated_at,NEW.deleted_at); END`)
      db.exec(`CREATE TRIGGER create_rowids_${stage} ${stage} INSERT ON notes BEGIN
        INSERT INTO create_rowids VALUES ('${stage}',NEW.rowid,last_insert_rowid()); END`)
    }
    assert.deepStrictEqual(prepare(db).run(nativeNoteCreateValues()), {
      changes: 1,
      lastInsertRowid: 1,
    })
    assert.deepStrictEqual(prepare(db).run({ ...nativeNoteCreateValues(), id: 'second' }), {
      changes: 1,
      lastInsertRowid: 2,
    })
    assert.deepStrictEqual(db.prepare('SELECT * FROM create_rowids').all(), [
      { stage: 'BEFORE', new_rowid: -1, last_rowid: 0 },
      { stage: 'AFTER', new_rowid: 1, last_rowid: 1 },
      { stage: 'BEFORE', new_rowid: -1, last_rowid: 1 },
      { stage: 'AFTER', new_rowid: 2, last_rowid: 2 },
    ])
    const expected = {
      id: 'note',
      parent: 'orphan-parent',
      title: 'Title',
      path: 'synthetic/path',
      type: 'solution',
      content: 'body',
      count: 1,
      created: 17,
      updated: 17,
      deleted: null,
    }
    assert.deepStrictEqual(db.prepare("SELECT * FROM create_values WHERE id='note'").all(), [
      { stage: 'BEFORE', ...expected },
      { stage: 'AFTER', ...expected },
    ])
    db.exec(
      'DROP TRIGGER create_values_BEFORE; DROP TRIGGER create_values_AFTER; DROP TRIGGER create_rowids_BEFORE; DROP TRIGGER create_rowids_AFTER',
    )
    const results = []
    for (const timing of ['BEFORE', 'AFTER']) {
      for (const mode of ['IGNORE', 'FAIL', 'ABORT']) {
        const id = `${timing}-${mode}`
        db.exec(`CREATE TRIGGER create_probe ${timing} INSERT ON notes BEGIN
          INSERT INTO create_effects VALUES ('${id}'); SELECT RAISE(${mode === 'IGNORE' ? mode : `${mode}, 'create rejected'`}); END`)
        const result = submissionReadOutcome(() =>
          prepare(db).run({ ...nativeNoteCreateValues(), id }),
        )
        if (mode === 'IGNORE') {
          assert.ok(result.rows && typeof result.rows === 'object' && 'changes' in result.rows)
          assert.strictEqual(result.rows.changes, timing === 'BEFORE' ? 0 : 1)
        } else assert.strictEqual(result.error?.code, 'SQLITE_CONSTRAINT_TRIGGER')
        results.push({ result, state: nativeStatsSnapshot(db) })
        db.exec('DROP TRIGGER create_probe')
      }
    }
    assert.deepStrictEqual(db.prepare('SELECT * FROM create_effects').all(), [
      { mode: 'BEFORE-IGNORE' },
      { mode: 'BEFORE-FAIL' },
      { mode: 'AFTER-IGNORE' },
      { mode: 'AFTER-FAIL' },
    ])
    return results
  })
})

test('Notes create native safe-integer results and multibyte payloads remain unencoded', () => {
  compareNativeNoteCreate((db, prepare) => {
    seedNativeNotePath(db, 'existing', 'existing/path')
    db.exec('UPDATE notes SET rowid=9007199254740992')
    db.defaultSafeIntegers(true)
    const content = '\u4e2d'.repeat(1_398_101) + 'x'
    assert.strictEqual(Buffer.byteLength(content), 4 * 1024 * 1024)
    const tracking = traceNativeNoteMetadata(db)
    let result
    try {
      result = prepare(db).run({ ...nativeNoteCreateValues(), content, now: 1.75 })
      assert.strictEqual(result, tracking.result())
      assert.strictEqual(result.lastInsertRowid, 9007199254740993n)
    } finally {
      tracking.restore()
    }
    assert.deepStrictEqual(
      db
        .prepare("SELECT content,created_at,updated_at,deleted_at FROM notes WHERE id='note'")
        .get(),
      { content, created_at: 1.75, updated_at: 1.75, deleted_at: null },
    )
    return result
  })
})

test('Notes create native explicit handles preserve readonly closed and reinitialized connection independence', () => {
  compareNativeNoteCreate((db, prepare) => {
    db.pragma('query_only=ON')
    const tracking = traceNativeNoteMetadata(db)
    let result
    try {
      result = submissionReadOutcome(() => prepare(db).run(nativeNoteCreateValues()))
      assert.deepStrictEqual(tracking.stages, ['prepare', 'run'])
      assert.strictEqual(result.error?.code, 'SQLITE_READONLY')
    } finally {
      tracking.restore()
      db.pragma('query_only=OFF')
    }
    return result
  })
  const source = getDbForTest()
  const definition = nativeNoteCreateSchema()
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-notes-create-native-'))
  const target = path.join(directory, 'readonly.sqlite')
  source.prepare('VACUUM INTO ?').run(target)
  const readonly = new NativeDatabase(target, { readonly: true })
  const other = new NativeDatabase(':memory:')
  try {
    const expected = submissionReadOutcome(() =>
      oldPrepareCreateNoteInsert(readonly).run(nativeNoteCreateValues()),
    )
    assert.strictEqual(expected.error?.code, 'SQLITE_READONLY')
    assert.deepStrictEqual(
      submissionReadOutcome(() => prepareCreateNoteInsert(readonly).run(nativeNoteCreateValues())),
      expected,
    )
    other.exec(definition)
    const oldPrepared = oldPrepareCreateNoteInsert(source)
    const prepared = prepareCreateNoteInsert(source)
    closeDb()
    assert.throws(getDb, /Database not initialized/)
    assert.strictEqual(prepareCreateNoteInsert(other).run(nativeNoteCreateValues()).changes, 1)
    assert.deepStrictEqual(
      submissionReadOutcome(() => prepareCreateNoteInsert(source)),
      submissionReadOutcome(() => oldPrepareCreateNoteInsert(source)),
    )
    assert.deepStrictEqual(
      submissionReadOutcome(() => prepared.run(nativeNoteCreateValues())),
      submissionReadOutcome(() => oldPrepared.run(nativeNoteCreateValues())),
    )
    const next = initDbAtPath(':memory:')
    assert.strictEqual(
      prepareCreateNoteInsert(next).run({ ...nativeNoteCreateValues(), title: 'New connection' })
        .changes,
      1,
    )
    assert.deepStrictEqual(other.prepare('SELECT title FROM notes').all(), [{ title: 'Title' }])
    assert.deepStrictEqual(next.prepare('SELECT title FROM notes').all(), [
      { title: 'New connection' },
    ])
  } finally {
    other.close()
    readonly.close()
    const absolute = path.resolve(directory)
    assert.strictEqual(path.dirname(absolute), path.resolve(os.tmpdir()))
    assert.ok(path.basename(absolute).startsWith('algo-notes-create-native-'))
    assert.strictEqual(fs.lstatSync(absolute).isSymbolicLink(), false)
    assert.strictEqual(path.dirname(fs.realpathSync(absolute)), fs.realpathSync(os.tmpdir()))
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('Notes create native savepoints and actual deferred COMMIT failures retain earlier autocommit rows', () => {
  compareNativeNoteCreate((db, prepare) => {
    prepare(db).run({ ...nativeNoteCreateValues(), id: 'committed' })
    db.transaction(() => {
      prepare(db).run({ ...nativeNoteCreateValues(), id: 'outer' })
      assert.throws(
        () =>
          db.transaction(() => {
            prepare(db).run({ ...nativeNoteCreateValues(), id: 'inner' })
            throw new Error('inner rollback')
          })(),
        /inner rollback/,
      )
      assert.deepStrictEqual(db.prepare('SELECT id FROM notes ORDER BY id').all(), [
        { id: 'committed' },
        { id: 'outer' },
      ])
    })()
    const before = db.prepare('SELECT * FROM notes ORDER BY rowid').all()
    db.exec(
      'CREATE TABLE create_commit(note_id TEXT REFERENCES notes(id) DEFERRABLE INITIALLY DEFERRED)',
    )
    let callbackFinished = false
    const result = submissionReadOutcome(() =>
      db.transaction(() => {
        prepare(db).run({ ...nativeNoteCreateValues(), id: 'uncommitted' })
        db.prepare('INSERT INTO create_commit VALUES (?)').run('missing')
        callbackFinished = true
      })(),
    )
    assert.strictEqual(callbackFinished, true)
    assert.strictEqual(result.error?.code, 'SQLITE_CONSTRAINT_FOREIGNKEY')
    assert.strictEqual(db.inTransaction, false)
    assert.deepStrictEqual(db.prepare('SELECT * FROM notes ORDER BY rowid').all(), before)
    assert.deepStrictEqual(db.prepare('SELECT * FROM create_commit').all(), [])
    return result
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
