import assert from 'node:assert'
import {
  buildReviewReason,
  buildWeaknessEvidence,
  determineReviewPriority,
  estimateReviewMinutes,
  normalizePlanDays,
  scoreReviewCandidate,
  scoreTagWeakness,
} from '../../electron/ai/recommendations/rules.ts'
import { parseTagsJson } from '../../electron/ai/recommendations/tagParsing.ts'
import type { TagAggregate, TagWeakness } from '../../electron/ai/recommendations/types.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

test('parses and normalizes tag json safely', () => {
  assert.deepStrictEqual(parseTagsJson('["dp", " graph ", 3, ""]'), ['dp', 'graph'])
  assert.deepStrictEqual(parseTagsJson('{"tag":"dp"}'), [])
  assert.deepStrictEqual(parseTagsJson('not-json'), [])
  assert.deepStrictEqual(parseTagsJson(null), [])
})

test('scores review candidates with capped local factors', () => {
  assert.strictEqual(scoreReviewCandidate(1, 0, 0), 8)
  assert.strictEqual(scoreReviewCandidate(10, 100, 10), 80)
  assert.strictEqual(buildReviewReason(3, 8, 2), '已错误 3 次，8 天未复习，访问 2 次仍未通过，建议复习')
})

test('scores weakness and formats evidence', () => {
  const stats: TagAggregate = {
    total: 4,
    solved: 1,
    attempted: 2,
    wrong_submissions: 10,
    total_duration_seconds: 600,
  }
  assert.strictEqual(scoreTagWeakness(25, 10, 600), 49)
  assert.strictEqual(buildWeaknessEvidence(stats, 25), '4 题，AC 1 题（25%），错误提交 10 次，累计停留 10 分钟')
})

test('normalizes review plan priority and duration', () => {
  const weaknessTags: TagWeakness[] = [{
    tag: 'dp',
    total: 3,
    solved: 0,
    attempted: 2,
    ac_rate: 0,
    wrong_submissions: 6,
    total_duration_seconds: 900,
    weakness_score: 70,
    evidence: 'test',
  }]

  assert.strictEqual(determineReviewPriority(10, weaknessTags, ['dp']), 1)
  assert.strictEqual(determineReviewPriority(40, [], []), 2)
  assert.strictEqual(determineReviewPriority(10, [], []), 3)
  assert.strictEqual(estimateReviewMinutes(2, 5), 45)
  assert.strictEqual(normalizePlanDays(-1), 7)
  assert.strictEqual(normalizePlanDays(14), 14)
})

let failedCount = 0
console.log('Running AI recommendation rules tests...\n')
for (const t of tests) {
  try {
    t.fn()
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
