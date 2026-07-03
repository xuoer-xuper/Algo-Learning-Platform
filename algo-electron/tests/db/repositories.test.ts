import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { closeDb, initDbAtPath } from '../../electron/db/connection.ts'
import {
  getProblemDetail,
  getRecentProblems,
  upsertProblem,
} from '../../electron/db/repositories/problemRepository.ts'
import {
  getSubmissionsByPlatform,
  getSubmissionsByProblem,
  updateFirstAc,
  upsertSubmission,
} from '../../electron/db/repositories/submissionRepository.ts'
import {
  getVisitedTrend,
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

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

const day = '2026-07-03'
const now = `${day}T10:00:00+08:00`

interface ProblemRow {
  id: string
  platform: string
  platform_problem_id: string
  canonical_url: string
  title: string | null
  status: string
  contest_id: string | null
  problem_index: string | null
  first_solved_at: string | null
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

function getProblemByPlatformId(db: Database.Database, platform: string, platformProblemId: string): ProblemRow {
  const row = db.prepare(`
    SELECT id, platform, platform_problem_id, canonical_url, title, status, contest_id, problem_index, first_solved_at
    FROM problems
    WHERE platform = ? AND platform_problem_id = ?
  `).get(platform, platformProblemId) as ProblemRow | undefined
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
  db.prepare(`
    INSERT INTO problem_visits
      (id, problem_id, session_id, platform, url, entered_at, left_at, duration_seconds, active_seconds, leave_reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    problem.id,
    'session-repository-test',
    problem.platform,
    problem.canonical_url,
    `${day}T09:00:00+08:00`,
    `${day}T09:05:00+08:00`,
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
  assert.strictEqual(upsertSubmission({
    platform: 'codeforces',
    platformSubmissionId: 'cf-1',
    problemId: problem.id,
    verdict: 'WA',
    rawVerdict: 'WRONG_ANSWER',
    language: 'GNU C++23',
    submittedAt: `${day}T10:00:00+08:00`,
    runtimeMs: 15,
    memoryKb: 800,
    sourceUrl: 'https://codeforces.com/contest/1000/submission/1',
  }), true)

  assert.strictEqual(upsertSubmission({
    platform: 'codeforces',
    platformSubmissionId: 'cf-2',
    problemId: problem.id,
    verdict: 'AC',
    rawVerdict: 'OK',
    language: 'GNU C++23',
    submittedAt: `${day}T10:02:00+08:00`,
  }), true)
}

test('runs migrations into a temporary database', () => {
  const db = getDbForTest()
  const migrations = db.prepare('SELECT COUNT(*) as count FROM schema_migrations').get() as { count: number }
  assert.strictEqual(migrations.count, 18)

  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name IN ('problems', 'submissions', 'user_daily_stats')
    ORDER BY name
  `).all() as { name: string }[]
  assert.deepStrictEqual(tables.map(row => row.name), ['problems', 'submissions', 'user_daily_stats'])
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

  const count = db.prepare(`
    SELECT COUNT(*) as count FROM problems
    WHERE platform = 'codeforces' AND platform_problem_id = '1000A'
  `).get() as { count: number }
  assert.strictEqual(count.count, 1)

  const problem = getProblemByPlatformId(db, 'codeforces', '1000A')
  assert.strictEqual(problem.canonical_url, 'https://codeforces.com/problemset/problem/1000/A')
  assert.strictEqual(problem.title, '示例题')
  assert.strictEqual(problem.contest_id, '1000')
  assert.strictEqual(problem.problem_index, 'A')

  assert.throws(() => {
    db.prepare(`
      INSERT INTO problems
        (id, platform, platform_problem_id, canonical_url, status, first_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('duplicate-problem', 'codeforces', '1000A', problem.canonical_url, 'visited', now, now, now)
  }, /UNIQUE constraint failed/)

  const recent = getRecentProblems(5)
  assert.strictEqual(recent.length, 1)
  assert.strictEqual(recent[0].platform_problem_id, '1000A')
})

test('deduplicates submissions and updates first AC metadata', () => {
  const db = getDbForTest()
  const problem = seedCodeforcesProblem()

  assert.strictEqual(upsertSubmission({
    platform: 'codeforces',
    platformSubmissionId: 'cf-1',
    problemId: problem.id,
    verdict: 'WA',
    rawVerdict: 'WRONG_ANSWER',
    language: 'GNU C++23',
    submittedAt: `${day}T10:00:00+08:00`,
    runtimeMs: 15,
    memoryKb: 800,
    sourceUrl: 'https://codeforces.com/contest/1000/submission/1',
  }), true)

  assert.strictEqual(upsertSubmission({
    platform: 'codeforces',
    platformSubmissionId: 'cf-1',
    problemId: problem.id,
    verdict: 'AC',
    submittedAt: `${day}T10:01:00+08:00`,
  }), false)

  assert.strictEqual(upsertSubmission({
    platform: 'codeforces',
    platformSubmissionId: 'cf-2',
    problemId: problem.id,
    verdict: 'AC',
    rawVerdict: 'OK',
    language: 'GNU C++23',
    submittedAt: `${day}T10:02:00+08:00`,
  }), true)

  const submissions = getSubmissionsByProblem(problem.id)
  assert.strictEqual(submissions.length, 2)
  assert.strictEqual(submissions[0].platform_submission_id, 'cf-2')
  assert.strictEqual(submissions[1].platform_submission_id, 'cf-1')

  const platformSubmissions = getSubmissionsByPlatform('codeforces', 1)
  assert.strictEqual(platformSubmissions.length, 1)
  assert.strictEqual(platformSubmissions[0].platform_submission_id, 'cf-2')

  assert.throws(() => {
    db.prepare(`
      INSERT INTO submissions
        (id, problem_id, platform, platform_submission_id, verdict, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('duplicate-submission', problem.id, 'codeforces', 'cf-1', 'AC', now, now, now)
  }, /UNIQUE constraint failed/)

  updateFirstAc(problem.id)
  const updatedProblem = getProblemByPlatformId(db, 'codeforces', '1000A')
  assert.strictEqual(updatedProblem.status, 'solved')
  assert.strictEqual(updatedProblem.first_solved_at, `${day}T10:02:00+08:00`)

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

  const stats = db.prepare('SELECT * FROM user_daily_stats WHERE local_day = ?').get(day) as DailyStatsRow | undefined
  assert.ok(stats)
  assert.strictEqual(stats.active_seconds, 90)
  assert.strictEqual(stats.duration_seconds, 150)
  assert.strictEqual(stats.visited_problem_count, 2)
  assert.strictEqual(stats.solved_problem_count, 1)
  assert.strictEqual(stats.submission_count, 2)
  assert.strictEqual(stats.ac_submission_count, 1)

  const platformDistribution = JSON.parse(stats.platform_distribution_json ?? '[]') as { platform: string; count: number }[]
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
  assert.deepStrictEqual(getAccountsByPlatform('codeforces').map(row => row.id), [accountId])

  assert.strictEqual(upsertRatingHistory({
    accountId,
    platform: 'codeforces',
    contestId: '1',
    contestName: 'Codeforces Round 1',
    rank: 10,
    ratingBefore: 3800,
    ratingAfter: 3900,
    delta: 100,
    contestAt: `${day}T09:00:00+08:00`,
  }), true)
  assert.strictEqual(upsertRatingHistory({
    accountId,
    platform: 'codeforces',
    contestId: '1',
    ratingAfter: 4100,
  }), false)
  assert.strictEqual(upsertRatingHistory({
    accountId,
    platform: 'codeforces',
    contestId: '2',
    contestName: 'Codeforces Round 2',
    rank: 1,
    ratingBefore: 3900,
    ratingAfter: 4050,
    delta: 150,
    contestAt: `${day}T11:00:00+08:00`,
  }), true)

  const history = getRatingHistory(accountId)
  assert.strictEqual(history.length, 2)
  assert.deepStrictEqual(history.map(row => row.contest_id), ['1', '2'])
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
  assert.deepStrictEqual(getAllScripts().map(script => script.id), [scriptId])
  assert.deepStrictEqual(getEnabledScripts().map(script => script.id), [scriptId])

  assert.strictEqual(updateScript(scriptId, {
    description: null,
    file_path: 'example-helper.user.js',
    site_ids_json: '[]',
  }), true)
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
  assert.deepStrictEqual(JSON.parse(saved.input_summary_json ?? '{}'), { range: ['2026-07-01', '2026-07-07'] })
  assert.deepStrictEqual(JSON.parse(saved.source_refs_json ?? '{}'), { problemIds: ['p1', 'p2'] })
  assert.deepStrictEqual(JSON.parse(saved.model_info_json ?? '{}'), { engine: 'local-rules', version: 1 })

  assert.deepStrictEqual(listAIOutputs('review_plan').map(output => output.id), [reviewPlan.id])
  assert.deepStrictEqual(new Set(listAIOutputs(undefined, 10).map(output => output.id)), new Set([periodSummary.id, reviewPlan.id]))

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
  assert.strictEqual(first.schema_version, 1)

  const snapshot = getSnapshotByDate(first.snapshot_date)
  assert.ok(snapshot)
  assert.strictEqual(snapshot.id, first.id)
  assert.strictEqual(snapshot.context.schema_version, 1)
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
  assert.strictEqual(getSiteById('codeforces')?.enabled, false, 'seed should not overwrite user enable state')

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
      { id: 'codeforces', name: 'Codeforces Import', domains: ['codeforces.com'], homeUrl: 'https://codeforces.com' },
      { id: 'custom-oj', name: 'Custom OJ Updated', domains: ['example.test'], homeUrl: 'https://example.test/new', enabled: false },
      { id: 'new-oj', name: 'New OJ', domains: ['new.example.test'], homeUrl: 'https://new.example.test' },
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
