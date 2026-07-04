import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection.ts'
import { upsertProblem } from '../../electron/db/repositories/problemRepository.ts'
import { upsertSubmission } from '../../electron/db/repositories/submissionRepository.ts'
import { exportAIContext, renderContextAsMarkdown } from '../../electron/ai/contextExporter.ts'
import { getReviewPlan } from '../../electron/ai/recommendations/reviewPlanner.ts'
import { getReviewRecommendations } from '../../electron/ai/recommendations/reviewRecommender.ts'
import { getWeaknessAnalysis } from '../../electron/ai/recommendations/weaknessAnalyzer.ts'

interface ProblemSeed {
  platformProblemId: string
  title: string
  tags: string[]
}

interface ProblemRow {
  id: string
  platform: string
  platform_problem_id: string
  canonical_url: string
  title: string | null
}

const day = '2026-07-04'
const forbiddenCookieHeader = ['Cook', 'ie'].join('') + ': hidden-session-value'
const forbiddenLocalPath = 'D:\\Users\\private\\solution.cpp'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

function seedProblem(seed: ProblemSeed): ProblemRow {
  upsertProblem({
    platform: 'codeforces',
    platformProblemId: seed.platformProblemId,
    canonicalUrl: `https://codeforces.com/problemset/problem/${seed.platformProblemId}`,
    title: seed.title,
    confidence: 'url',
  })

  const db = getDb()
  const problem = db.prepare(`
    SELECT id, platform, platform_problem_id, canonical_url, title
    FROM problems
    WHERE platform = 'codeforces' AND platform_problem_id = ?
  `).get(seed.platformProblemId) as ProblemRow | undefined
  assert.ok(problem)

  db.prepare('UPDATE problems SET tags_json = ? WHERE id = ?')
    .run(JSON.stringify(seed.tags), problem.id)
  return problem
}

function insertVisit(problem: ProblemRow, id: string, durationSeconds: number): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO problem_visits
      (id, problem_id, session_id, platform, url, entered_at, left_at, duration_seconds, active_seconds, leave_reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    problem.id,
    'ai-traceability',
    problem.platform,
    problem.canonical_url,
    `${day}T09:00:00+08:00`,
    `${day}T09:10:00+08:00`,
    durationSeconds,
    Math.max(1, durationSeconds - 30),
    'test',
    `${day}T09:00:00+08:00`,
    `${day}T09:10:00+08:00`,
  )
}

function seedLocalLearningData(): ProblemRow[] {
  const dpA = seedProblem({ platformProblemId: '1000A', title: 'DP A', tags: ['dp', 'graph'] })
  const dpB = seedProblem({ platformProblemId: '1000B', title: 'DP B', tags: ['dp'] })
  const solved = seedProblem({ platformProblemId: '1000C', title: 'Solved DP', tags: ['dp'] })

  upsertSubmission({
    platform: 'codeforces',
    platformSubmissionId: 'trace-wa-1',
    problemId: dpA.id,
    verdict: 'WA',
    rawVerdict: 'WRONG_ANSWER',
    language: 'GNU C++23',
    submittedAt: `${day}T10:00:00+08:00`,
    rawJson: JSON.stringify({ diagnostic: forbiddenCookieHeader, path: forbiddenLocalPath }),
  })
  upsertSubmission({
    platform: 'codeforces',
    platformSubmissionId: 'trace-wa-2',
    problemId: dpA.id,
    verdict: 'WA',
    rawVerdict: 'WRONG_ANSWER',
    language: 'GNU C++23',
    submittedAt: `${day}T10:05:00+08:00`,
  })
  upsertSubmission({
    platform: 'codeforces',
    platformSubmissionId: 'trace-wa-3',
    problemId: dpB.id,
    verdict: 'WA',
    rawVerdict: 'WRONG_ANSWER',
    language: 'GNU C++23',
    submittedAt: `${day}T10:10:00+08:00`,
  })
  upsertSubmission({
    platform: 'codeforces',
    platformSubmissionId: 'trace-ac-1',
    problemId: solved.id,
    verdict: 'AC',
    rawVerdict: 'OK',
    language: 'GNU C++23',
    submittedAt: `${day}T10:15:00+08:00`,
  })

  insertVisit(dpA, 'visit-dp-a', 600)
  insertVisit(dpB, 'visit-dp-b', 480)
  insertVisit(solved, 'visit-solved', 180)

  return [dpA, dpB, solved]
}

function countWrongSubmissions(problemId: string): number {
  const row = getDb().prepare(`
    SELECT COUNT(*) as count
    FROM submissions
    WHERE problem_id = ? AND verdict != 'AC'
  `).get(problemId) as { count: number }
  return row.count
}

function hasAcceptedSubmission(problemId: string): boolean {
  const row = getDb().prepare(`
    SELECT COUNT(*) as count
    FROM submissions
    WHERE problem_id = ? AND verdict = 'AC'
  `).get(problemId) as { count: number }
  return row.count > 0
}

function countTaggedProblems(tag: string): number {
  const rows = getDb().prepare(`
    SELECT tags_json
    FROM problems
    WHERE deleted_at IS NULL
  `).all() as { tags_json: string | null }[]
  return rows.filter(row => {
    if (!row.tags_json) return false
    const tags = JSON.parse(row.tags_json) as unknown
    return Array.isArray(tags) && tags.includes(tag)
  }).length
}

function assertNoSensitivePayload(label: string, value: unknown): void {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  assert.ok(!serialized.includes(forbiddenCookieHeader), `${label} leaked raw cookie header`)
  assert.ok(!serialized.includes(forbiddenLocalPath), `${label} leaked local path`)
  assert.ok(!serialized.includes('raw_json'), `${label} leaked raw_json key`)
}

test('AI recommendation outputs are traceable to local problems, submissions, visits, and tag stats', () => {
  const seededProblems = seedLocalLearningData()
  const seededProblemIds = new Set(seededProblems.map(problem => problem.id))

  const recommendations = getReviewRecommendations(10)
  assert.ok(recommendations.recommendations.length >= 2)
  for (const recommendation of recommendations.recommendations) {
    assert.ok(seededProblemIds.has(recommendation.problem_id))
    assert.strictEqual(recommendation.source.has_ac, false)
    assert.strictEqual(hasAcceptedSubmission(recommendation.problem_id), false)
    assert.strictEqual(recommendation.source.wrong_count, countWrongSubmissions(recommendation.problem_id))
    assert.ok(recommendation.source.last_attempt)
    assert.ok(recommendation.source.visit_count >= 1)
    assert.ok(recommendation.reason.includes(`错误 ${recommendation.source.wrong_count} 次`))
  }

  const weaknesses = getWeaknessAnalysis(10)
  const dpWeakness = weaknesses.weaknesses.find(weakness => weakness.tag === 'dp')
  assert.ok(dpWeakness)
  assert.strictEqual(dpWeakness.total, countTaggedProblems('dp'))
  assert.ok(dpWeakness.wrong_submissions >= 3)
  assert.ok(dpWeakness.evidence.includes(`${dpWeakness.total} 题`))
  assert.ok(dpWeakness.evidence.includes(`错误提交 ${dpWeakness.wrong_submissions} 次`))

  const plan = getReviewPlan(7)
  assert.ok(plan.items.length >= 2)
  assert.ok(plan.evidence.includes('reviewRecommender'))
  assert.ok(plan.evidence.includes('weaknessAnalyzer'))
  for (const item of plan.items) {
    assert.ok(seededProblemIds.has(item.problem_id))
    assert.strictEqual(item.source.wrong_count, countWrongSubmissions(item.problem_id))
    assert.ok(item.source.days_since_attempt >= 0)
    assert.ok(item.reason.includes('错误'))
  }
})

test('AI context export and recommendation artifacts exclude sensitive local payloads', () => {
  seedLocalLearningData()

  const context = exportAIContext()
  const contextMarkdown = renderContextAsMarkdown(context)
  const recommendations = getReviewRecommendations(10)
  const weaknesses = getWeaknessAnalysis(10)
  const plan = getReviewPlan(7)

  assertNoSensitivePayload('context json', context)
  assertNoSensitivePayload('context markdown', contextMarkdown)
  assertNoSensitivePayload('recommendations', recommendations)
  assertNoSensitivePayload('weakness analysis', weaknesses)
  assertNoSensitivePayload('review plan', plan)
})

function runWithTemporaryDatabase(fn: () => void): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-ai-traceability-'))
  const dbPath = path.join(tempDir, 'traceability.sqlite')

  try {
    initDbAtPath(dbPath)
    fn()
  } finally {
    closeDb()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

let failedCount = 0
console.log('Running AI traceability tests...\n')
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
