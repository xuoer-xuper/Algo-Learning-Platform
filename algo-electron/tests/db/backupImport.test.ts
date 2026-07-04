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
