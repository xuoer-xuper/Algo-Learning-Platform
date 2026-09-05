import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection.ts'
import { createDatabaseBackup } from '../../electron/backup/backupService.ts'
import {
  exportLearningData,
  importLearningData,
  previewLearningDataImport,
} from '../../electron/backup/learningDataExport.ts'
import type { LearningDataExport } from '../../electron/backup/types.ts'
import { upsertCookieMetadata } from '../../electron/db/repositories/cookieRecordRepository.ts'
import { upsertAccount, upsertRatingHistory } from '../../electron/db/repositories/accountRepository.ts'
import { upsertProblem } from '../../electron/db/repositories/problemRepository.ts'
import { upsertSubmission } from '../../electron/db/repositories/submissionRepository.ts'

const day = '2026-07-04'
const forbiddenCookieHeader = ['Cook', 'ie'].join('') + ': hidden-session-value'
const forbiddenLocalPath = 'D:\\Users\\private\\solution.cpp'

interface ProblemRow {
  id: string
  platform: string
  platform_problem_id: string
  canonical_url: string
}

interface TestPaths {
  tempDir: string
  sourceDbPath: string
  targetDbPath: string
}

const tests: { name: string; fn: () => void | Promise<void> }[] = []
function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn })
}

function seedSourceDatabase(): void {
  const db = getDb()
  upsertProblem({
    platform: 'codeforces',
    platformProblemId: '1000A',
    canonicalUrl: 'https://codeforces.com/problemset/problem/1000/A',
    title: 'Backup Roundtrip',
    confidence: 'url',
  })
  const problem = db.prepare(`
    SELECT id, platform, platform_problem_id, canonical_url
    FROM problems
    WHERE platform = 'codeforces' AND platform_problem_id = '1000A'
  `).get() as ProblemRow

  db.prepare('UPDATE problems SET tags_json = ? WHERE id = ?')
    .run(JSON.stringify(['dp', 'graphs']), problem.id)

  db.prepare(`
    INSERT INTO problem_visits
      (id, problem_id, session_id, platform, url, entered_at, left_at, duration_seconds, active_seconds, leave_reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'visit-backup-1',
    problem.id,
    'backup-test',
    problem.platform,
    problem.canonical_url,
    `${day}T09:00:00+08:00`,
    `${day}T09:10:00+08:00`,
    600,
    540,
    'test',
    `${day}T09:00:00+08:00`,
    `${day}T09:10:00+08:00`,
  )

  upsertSubmission({
    platform: 'codeforces',
    platformSubmissionId: 'backup-submission-1',
    problemId: problem.id,
    verdict: 'WA',
    rawVerdict: 'WRONG_ANSWER',
    language: 'GNU C++23',
    submittedAt: `${day}T10:00:00+08:00`,
    sourceUrl: forbiddenLocalPath,
    rawJson: JSON.stringify({ diagnostic: forbiddenCookieHeader, path: forbiddenLocalPath }),
  })

  db.prepare(`
    INSERT INTO user_daily_stats (
      local_day, active_seconds, duration_seconds, visited_problem_count,
      solved_problem_count, submission_count, ac_submission_count,
      platform_distribution_json, recomputed_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    day,
    540,
    600,
    1,
    0,
    1,
    0,
    JSON.stringify([{ platform: 'codeforces', count: 1 }]),
    `${day}T11:00:00+08:00`,
    `${day}T11:00:00+08:00`,
    `${day}T11:00:00+08:00`,
  )

  const accountId = upsertAccount('codeforces', 'tourist', 'tourist')
  upsertRatingHistory({
    accountId,
    platform: 'codeforces',
    contestId: '1',
    contestName: 'Codeforces Round 1',
    rank: 1,
    ratingBefore: 3800,
    ratingAfter: 3900,
    delta: 100,
    contestAt: `${day}T12:00:00+08:00`,
    rawJson: JSON.stringify({ path: forbiddenLocalPath }),
  })

  upsertCookieMetadata({
    siteId: 'leetcode-cn',
    domain: 'leetcode.cn',
    name: 'LEETCODE_SESSION',
    purpose: 'login',
    secure: true,
    httpOnly: true,
  })
}

test('backs up sqlite and round-trips non-sensitive learning data', async () => {
  const paths = createTestPaths()
  try {
    initDbAtPath(paths.sourceDbPath)
    seedSourceDatabase()

    const backupResult = await createDatabaseBackup(paths.tempDir)
    assert.strictEqual(backupResult.success, true)
    assert.ok(backupResult.path)
    assert.ok(fs.existsSync(backupResult.path))

    const exported = exportLearningData()
    const serialized = JSON.stringify(exported)
    const serializedTables = JSON.stringify(exported.tables)
    assert.strictEqual(exported.tables.problems.length, 1)
    assert.strictEqual(exported.tables.problem_visits.length, 1)
    assert.strictEqual(exported.tables.submissions.length, 1)
    assert.strictEqual(exported.tables.user_daily_stats.length, 1)
    assert.strictEqual(exported.tables.platform_accounts.length, 1)
    assert.strictEqual(exported.tables.rating_history.length, 1)
    assert.strictEqual(Object.prototype.hasOwnProperty.call(exported.tables, 'cookie_records'), false)
    assert.strictEqual(Object.prototype.hasOwnProperty.call(exported.tables, 'sync_queue'), false)
    assert.ok(!serialized.includes('LEETCODE_SESSION'))
    assert.ok(!serializedTables.includes(forbiddenCookieHeader))
    assert.ok(!serializedTables.includes(forbiddenLocalPath))
    assert.ok(!serializedTables.includes('raw_json'))
    closeDb()

    initDbAtPath(paths.targetDbPath)
    const preview = previewLearningDataImport(exported)
    assert.strictEqual(preview.valid, true)
    assert.deepStrictEqual(preview.conflicts, [])
    assert.strictEqual(preview.new_counts.problems, 1)
    assert.strictEqual(preview.new_counts.submissions, 1)

    const importResult = importLearningData(exported)
    assert.strictEqual(importResult.success, true)
    assert.strictEqual(importResult.inserted.problems, 1)
    assert.strictEqual(importResult.inserted.problem_visits, 1)
    assert.strictEqual(importResult.inserted.submissions, 1)
    assert.strictEqual(importResult.inserted.user_daily_stats, 1)
    assert.strictEqual(importResult.inserted.platform_accounts, 1)
    assert.strictEqual(importResult.inserted.rating_history, 1)

    const importedCounts = getImportedCounts()
    assert.deepStrictEqual(importedCounts, {
      problems: 1,
      problem_visits: 1,
      submissions: 1,
      user_daily_stats: 1,
      platform_accounts: 1,
      rating_history: 1,
    })

    const duplicatePreview = previewLearningDataImport(exported)
    assert.strictEqual(duplicatePreview.duplicate_counts.problems, 1)
    assert.strictEqual(duplicatePreview.duplicate_counts.submissions, 1)
  } finally {
    closeDb()
    fs.rmSync(paths.tempDir, { recursive: true, force: true })
  }
})

test('detects import conflicts instead of silently overwriting existing data', () => {
  const paths = createTestPaths()
  try {
    initDbAtPath(paths.sourceDbPath)
    seedSourceDatabase()
    const exported = exportLearningData()
    closeDb()

    initDbAtPath(paths.targetDbPath)
    const firstImport = importLearningData(exported)
    assert.strictEqual(firstImport.success, true)

    const conflicting = cloneExport(exported)
    conflicting.tables.problems[0] = {
      ...conflicting.tables.problems[0],
      id: 'different-local-problem-id',
      title: 'Conflicting title',
    }
    conflicting.tables.problem_visits[0].problem_id = 'different-local-problem-id'
    conflicting.tables.submissions[0].problem_id = 'different-local-problem-id'

    const preview = previewLearningDataImport(conflicting)
    assert.strictEqual(preview.valid, true)
    assert.strictEqual(preview.conflicts.length, 1)
    assert.strictEqual(preview.conflicts[0].entity_type, 'problems')

    const result = importLearningData(conflicting)
    assert.strictEqual(result.success, false)
    assert.ok(result.error?.includes('存在冲突'))
  } finally {
    closeDb()
    fs.rmSync(paths.tempDir, { recursive: true, force: true })
  }
})

// Two machines never share a platform_accounts UUID (upsertAccount mints
// crypto.randomUUID), so a cross-device import always arrives with foreign
// account ids. The preview must resolve them the same way the import does.
test('previews rating history duplicates when the local account id differs', () => {
  const paths = createTestPaths()
  try {
    initDbAtPath(paths.sourceDbPath)
    seedSourceDatabase()
    const exported = exportLearningData()
    closeDb()

    initDbAtPath(paths.targetDbPath)
    assert.strictEqual(importLearningData(exported).success, true)

    const foreign = cloneExport(exported)
    const foreignAccountId = 'account-from-another-machine'
    foreign.tables.platform_accounts[0] = { ...foreign.tables.platform_accounts[0], id: foreignAccountId }
    foreign.tables.rating_history[0] = { ...foreign.tables.rating_history[0], account_id: foreignAccountId }

    const preview = previewLearningDataImport(foreign)
    const applied = importLearningData(foreign)
    assert.strictEqual(applied.success, true)
    assert.strictEqual(applied.inserted.rating_history, 0)
    assert.strictEqual(applied.skipped.rating_history, 1)
    assert.strictEqual(preview.duplicate_counts.rating_history, 1)
    assert.strictEqual(preview.new_counts.rating_history, 0)
  } finally {
    closeDb()
    fs.rmSync(paths.tempDir, { recursive: true, force: true })
  }
})

test('does not count a conflicting row twice when previewing new rows', () => {
  const paths = createTestPaths()
  try {
    initDbAtPath(paths.sourceDbPath)
    seedSourceDatabase()
    const exported = exportLearningData()
    closeDb()

    initDbAtPath(paths.targetDbPath)
    assert.strictEqual(importLearningData(exported).success, true)

    // One row conflicts with an existing problem, one row is genuinely new.
    const mixed = cloneExport(exported)
    mixed.tables.problems = [
      { ...exported.tables.problems[0], id: 'conflicting-problem-id', title: 'Conflicting title' },
      {
        ...exported.tables.problems[0],
        id: 'brand-new-problem-id',
        platform_problem_id: '2000B',
        canonical_url: 'https://codeforces.com/problemset/problem/2000/B',
        title: 'Brand new',
      },
    ]
    mixed.tables.problem_visits = []
    mixed.tables.submissions = []

    const preview = previewLearningDataImport(mixed)
    assert.strictEqual(preview.counts.problems, 2)
    assert.strictEqual(preview.duplicate_counts.problems, 1)
    assert.strictEqual(preview.conflicts.length, 1)
    assert.strictEqual(preview.new_counts.problems, 1)

    const applied = importLearningData(mixed, true)
    assert.strictEqual(applied.success, true)
    assert.strictEqual(applied.inserted.problems, 1)
  } finally {
    closeDb()
    fs.rmSync(paths.tempDir, { recursive: true, force: true })
  }
})

test('reports daily snapshot conflicts and rebuilds time from the retained visits', () => {
  const paths = createTestPaths()
  try {
    initDbAtPath(paths.sourceDbPath)
    seedSourceDatabase()
    const exported = exportLearningData()
    closeDb()

    initDbAtPath(paths.targetDbPath)
    assert.strictEqual(importLearningData(exported).success, true)

    const other = cloneExport(exported)
    other.tables.user_daily_stats = [{
      ...exported.tables.user_daily_stats[0],
      active_seconds: 3600,
      duration_seconds: 4200,
    }]

    const preview = previewLearningDataImport(other)
    assert.strictEqual(preview.duplicate_counts.user_daily_stats, 1)
    assert.strictEqual(
      preview.conflicts.filter(item => item.entity_type === 'user_daily_stats').length,
      1,
    )

    // The preview still requires explicit approval, but an aggregate snapshot
    // cannot invent time absent from the final visit rows.
    assert.strictEqual(importLearningData(other, true).updated.user_daily_stats, 1)
    const stored = getDb()
      .prepare('SELECT active_seconds, duration_seconds FROM user_daily_stats WHERE local_day = ?')
      .get(exported.tables.user_daily_stats[0].local_day) as {
        active_seconds: number
        duration_seconds: number
      }
    assert.strictEqual(stored.active_seconds, 540)
    assert.strictEqual(stored.duration_seconds, 600)
  } finally {
    closeDb()
    fs.rmSync(paths.tempDir, { recursive: true, force: true })
  }
})

test('detects same-id metadata conflicts and rebuilds dates after correcting or revoking an AC', () => {
  const paths = createTestPaths()
  try {
    const archived = seedImportedDatabase(paths)
    const problemId = String(archived.tables.problems[0].id)
    const corrected = cloneExport(archived)
    corrected.tables.problems[0].title = 'Restored title'
    corrected.tables.problems[0].difficulty = '1800'
    corrected.tables.submissions[0].verdict = 'AC'
    corrected.tables.submissions[0].submitted_at = '2026-07-05T10:00:00+08:00'
    corrected.tables.user_daily_stats = []

    assert.deepStrictEqual(
      previewLearningDataImport(corrected).conflicts.map(row => row.entity_type).sort(),
      ['problems', 'submissions'],
    )
    const before = exportLearningData().tables
    assert.strictEqual(importLearningData(corrected).success, false)
    assert.deepStrictEqual(exportLearningData().tables, before, 'conflict refusal must write nothing')

    const applied = importLearningData(corrected, true)
    assert.strictEqual(applied.success, true)
    assert.strictEqual(applied.updated.problems, 1)
    assert.strictEqual(applied.updated.submissions, 1)
    assert.deepStrictEqual(readProblemState(problemId), {
      status: 'solved', first_solved_at: '2026-07-05T10:00:00+08:00',
    })
    const restored = getDb().prepare('SELECT title, difficulty FROM problems WHERE id = ?')
      .get(problemId) as { title: string; difficulty: string }
    assert.deepStrictEqual(restored, { title: 'Restored title', difficulty: '1800' })
    assert.strictEqual(readDailyStats(day).submission_count, 0)
    assert.strictEqual(readDailyStats('2026-07-05').solved_problem_count, 1)
    assert.strictEqual(readDailyStats('2026-07-05').ac_submission_count, 1)

    const revoked = exportLearningData()
    revoked.tables.submissions[0].verdict = 'WA'
    revoked.tables.submissions[0].submitted_at = '2026-07-06T11:00:00+08:00'
    revoked.tables.user_daily_stats = []
    assert.strictEqual(previewLearningDataImport(revoked).conflicts.length, 1)
    assert.strictEqual(importLearningData(revoked, true).success, true)
    assert.deepStrictEqual(readProblemState(problemId), { status: 'attempted', first_solved_at: null })
    assert.strictEqual(readDailyStats('2026-07-05').submission_count, 0)
    assert.strictEqual(readDailyStats('2026-07-05').solved_problem_count, 0)
    assert.strictEqual(readDailyStats('2026-07-05').ac_submission_count, 0)
    assert.strictEqual(readDailyStats('2026-07-06').submission_count, 1)
  } finally {
    closeDb()
    fs.rmSync(paths.tempDir, { recursive: true, force: true })
  }
})

test('compares submission problem links after mapping foreign local ids', () => {
  const paths = createTestPaths()
  try {
    const foreign = seedImportedDatabase(paths)
    foreign.tables.problems[0].id = 'foreign-problem'
    foreign.tables.problem_visits[0].problem_id = 'foreign-problem'
    foreign.tables.submissions[0].id = 'foreign-submission'
    foreign.tables.submissions[0].problem_id = 'foreign-problem'

    const preview = previewLearningDataImport(foreign)
    assert.deepStrictEqual(preview.conflicts, [])
    assert.strictEqual(preview.duplicate_counts.submissions, 1)
    const applied = importLearningData(foreign)
    assert.strictEqual(applied.success, true)
    assert.strictEqual(applied.skipped.submissions, 1)
    assert.strictEqual(getImportedCounts().submissions, 1)
  } finally {
    closeDb()
    fs.rmSync(paths.tempDir, { recursive: true, force: true })
  }
})

test('merges disjoint same-day facts, preserves visit time semantics and remains idempotent', () => {
  const paths = createTestPaths()
  try {
    const foreign = seedImportedDatabase(paths)
    foreign.tables.problems[0].id = 'foreign-problem'
    foreign.tables.problem_visits[0].id = 'foreign-visit'
    foreign.tables.problem_visits[0].problem_id = 'foreign-problem'
    foreign.tables.submissions[0].id = 'foreign-submission'
    foreign.tables.submissions[0].platform_submission_id = 'foreign-submission'
    foreign.tables.submissions[0].problem_id = 'foreign-problem'

    getDb().prepare(`
      INSERT INTO user_daily_stats (local_day, active_seconds, created_at, updated_at)
      VALUES ('2000-01-01', 777, 'sentinel', 'sentinel')
    `).run()
    const untouched = readDailyStats('2000-01-01')
    assert.deepStrictEqual(previewLearningDataImport(foreign).conflicts, [])
    assert.strictEqual(importLearningData(foreign).success, true)
    const merged = readDailyStats(day)
    assert.strictEqual(merged.submission_count, 2)
    assert.strictEqual(merged.active_seconds, 1080)
    assert.strictEqual(merged.duration_seconds, 1200)
    assert.strictEqual(merged.visited_problem_count, 1)
    assert.deepStrictEqual(JSON.parse(merged.platform_distribution_json!), [{ platform: 'codeforces', count: 2 }])
    assert.deepStrictEqual(readDailyStats('2000-01-01'), untouched, 'unaffected history must not be recomputed')

    assert.strictEqual(importLearningData(foreign, true).success, true)
    assert.strictEqual(getImportedCounts().submissions, 2)
    assert.strictEqual(getImportedCounts().problem_visits, 2)
    assert.deepStrictEqual(readDailyStats(day), merged, 'reimport must not double count either database')

    const snapshot = exportLearningData()
    assert.deepStrictEqual(previewLearningDataImport(snapshot).conflicts, [])
    assert.strictEqual(importLearningData(snapshot).success, true)
    assert.deepStrictEqual(exportLearningData().tables, snapshot.tables)
  } finally {
    closeDb()
    fs.rmSync(paths.tempDir, { recursive: true, force: true })
  }
})

test('new AC submissions refresh an existing problem and move its first solve to an earlier day', () => {
  const paths = createTestPaths()
  try {
    const later = seedImportedDatabase(paths)
    const problemId = String(later.tables.problems[0].id)
    later.tables.problem_visits = []
    later.tables.user_daily_stats = []
    later.tables.submissions[0] = {
      ...later.tables.submissions[0],
      id: 'later-ac', platform_submission_id: 'later-ac',
      verdict: 'AC', submitted_at: '2026-07-06T12:00:00+08:00',
    }
    assert.strictEqual(importLearningData(later).success, true)
    assert.deepStrictEqual(readProblemState(problemId), {
      status: 'solved', first_solved_at: '2026-07-06T12:00:00+08:00',
    })
    assert.strictEqual(readDailyStats('2026-07-06').solved_problem_count, 1)

    const earlier = cloneExport(later)
    earlier.tables.submissions[0] = {
      ...earlier.tables.submissions[0],
      id: 'earlier-ac', platform_submission_id: 'earlier-ac',
      submitted_at: '2026-07-03T12:00:00+08:00',
    }
    assert.strictEqual(importLearningData(earlier).success, true)
    assert.deepStrictEqual(readProblemState(problemId), {
      status: 'solved', first_solved_at: '2026-07-03T12:00:00+08:00',
    })
    assert.strictEqual(readDailyStats('2026-07-06').solved_problem_count, 0)
    assert.strictEqual(readDailyStats('2026-07-06').ac_submission_count, 1)
    assert.strictEqual(readDailyStats('2026-07-03').solved_problem_count, 1)
    assert.strictEqual(readDailyStats('2026-07-03').ac_submission_count, 1)
  } finally {
    closeDb()
    fs.rmSync(paths.tempDir, { recursive: true, force: true })
  }
})

test('rebuilds old and new problems and dates when overwritten facts move', () => {
  const paths = createTestPaths()
  try {
    const archived = seedImportedDatabase(paths)
    archived.tables.submissions[0].verdict = 'AC'
    assert.strictEqual(importLearningData(archived, true).success, true)
    const moved = exportLearningData()
    const oldProblemId = String(moved.tables.problems[0].id)
    moved.tables.problems.push({
      ...moved.tables.problems[0], id: 'new-problem', platform_problem_id: '2000B',
      title: 'New problem', canonical_url: 'https://codeforces.com/problemset/problem/2000/B',
      status: 'visited', first_solved_at: null,
    })
    moved.tables.submissions[0].problem_id = 'new-problem'
    moved.tables.submissions[0].submitted_at = '2026-07-05T12:00:00+08:00'
    moved.tables.problem_visits[0].entered_at = '2026-07-06T09:00:00+08:00'
    moved.tables.problem_visits[0].left_at = '2026-07-06T09:15:00+08:00'
    moved.tables.problem_visits[0].duration_seconds = 900
    moved.tables.problem_visits[0].active_seconds = 720
    moved.tables.user_daily_stats = []

    assert.strictEqual(previewLearningDataImport(moved).conflicts.length, 1)
    assert.strictEqual(importLearningData(moved, true).success, true)
    assert.deepStrictEqual(readProblemState(oldProblemId), { status: 'visited', first_solved_at: null })
    assert.deepStrictEqual(readProblemState('new-problem'), {
      status: 'solved', first_solved_at: '2026-07-05T12:00:00+08:00',
    })
    assert.strictEqual(readDailyStats(day).active_seconds, 0)
    assert.strictEqual(readDailyStats(day).submission_count, 0)
    assert.strictEqual(readDailyStats(day).solved_problem_count, 0)
    assert.strictEqual(readDailyStats('2026-07-05').solved_problem_count, 1)
    assert.strictEqual(readDailyStats('2026-07-05').submission_count, 1)
    assert.strictEqual(readDailyStats('2026-07-06').active_seconds, 720)
    assert.strictEqual(readDailyStats('2026-07-06').duration_seconds, 900)
  } finally {
    closeDb()
    fs.rmSync(paths.tempDir, { recursive: true, force: true })
  }
})

test('rolls back imported facts and first-AC changes when statistics rebuilding fails', () => {
  const paths = createTestPaths()
  try {
    const incoming = seedImportedDatabase(paths)
    incoming.tables.submissions[0] = {
      ...incoming.tables.submissions[0], id: 'new-ac', platform_submission_id: 'new-ac', verdict: 'AC',
    }
    incoming.tables.problem_visits = []
    incoming.tables.user_daily_stats = []
    const before = exportLearningData().tables
    getDb().exec(`
      CREATE TRIGGER reject_stats_rebuild BEFORE UPDATE ON user_daily_stats
      BEGIN SELECT RAISE(ABORT, 'forced stats rebuild failure'); END;
    `)
    assert.throws(() => importLearningData(incoming), /forced stats rebuild failure/)
    assert.deepStrictEqual(exportLearningData().tables, before)
  } finally {
    closeDb()
    fs.rmSync(paths.tempDir, { recursive: true, force: true })
  }
})

function seedImportedDatabase(paths: TestPaths): LearningDataExport {
  initDbAtPath(paths.sourceDbPath)
  seedSourceDatabase()
  const archived = exportLearningData()
  closeDb()
  initDbAtPath(paths.targetDbPath)
  assert.strictEqual(importLearningData(archived).success, true)
  return archived
}

function readProblemState(id: string): { status: string; first_solved_at: string | null } {
  return getDb().prepare('SELECT status, first_solved_at FROM problems WHERE id = ?')
    .get(id) as { status: string; first_solved_at: string | null }
}

interface DailyStatsRow {
  active_seconds: number
  duration_seconds: number
  visited_problem_count: number
  solved_problem_count: number
  submission_count: number
  ac_submission_count: number
  platform_distribution_json: string | null
}

function readDailyStats(localDay: string): DailyStatsRow {
  return getDb().prepare(`
    SELECT active_seconds, duration_seconds, visited_problem_count, solved_problem_count,
      submission_count, ac_submission_count, platform_distribution_json
    FROM user_daily_stats WHERE local_day = ?
  `).get(localDay) as DailyStatsRow
}

function createTestPaths(): TestPaths {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-backup-import-'))
  return {
    tempDir,
    sourceDbPath: path.join(tempDir, 'source.sqlite'),
    targetDbPath: path.join(tempDir, 'target.sqlite'),
  }
}

function getImportedCounts(): Record<string, number> {
  const db = getDb()
  const tables = [
    'problems',
    'problem_visits',
    'submissions',
    'user_daily_stats',
    'platform_accounts',
    'rating_history',
  ]
  return Object.fromEntries(tables.map(table => {
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number }
    return [table, row.count]
  }))
}

function cloneExport(data: LearningDataExport): LearningDataExport {
  return JSON.parse(JSON.stringify(data)) as LearningDataExport
}

let failedCount = 0
console.log('Running backup/import tests...\n')
for (const t of tests) {
  try {
    await t.fn()
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
